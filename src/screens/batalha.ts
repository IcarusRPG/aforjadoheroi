import REGIOES from '../data/regioes.json';
import { ASSETS, SFX_CAPITULO, SFX_FASE4, src, type NomeSfx } from '../core/assets';
import { audio } from '../core/audio';
import { lerDado, rolar, rolarD20 } from '../core/dados';
import { atualizarCampanha, getEstado, marcarFlag } from '../core/estado';
import { estadoProgresso, registrarGanchos } from '../core/ganchos';
import { bonusPericia, defesaDe, pvAntesDaForjaDe, type IdPericia } from '../core/pericias';
import { ITENS_DEF, curarCom, darItem, encontrarCriatura, mudarRelacao, qtdItem, somarContador } from '../core/progresso';
import { irPara, type Tela } from '../core/telas';
import { fmt, textos } from '../core/textos';
import { botao, botaoMenu, esperar, h } from '../core/ui';
import { carregarFolha, SpriteBatalha } from '../batalha/sprite';
import { INIMIGOS, batalhaPorId, type AtaqueDados, type DadosBatalha, type DadosInimigo } from '../batalha/inimigos';
import { avaliar, mostrarRolagem } from '../narrativa/rolagem';
import { criarDado } from '../narrativa/dado';
import { abrirMenuPausa } from './pausa';
import { dica as dicaTutorial } from '../core/tutorial';

/**
 * Batalha no estilo Final Fantasy VI: até 3 inimigos à esquerda (em formação escalonada, virados para a
 * direita), o herói à direita, janela de comandos embaixo, mensagem no topo e a ordem dos turnos numa
 * faixa. Tudo vem dos dados: src/data/batalhas/*.json e src/data/inimigos/*.json.
 *
 * Regras (sistema Icarus, antes da Forja): iniciativa d20 + DES de cada um, ordem fixa; ataque d20 +
 * Luta (FOR) contra a Defesa; 20 natural acerta e dobra o dano, 1 natural erra. Não existe fugir.
 * Rasteira (manobra): teste oposto d20 + Luta contra d20 + Fortitude do alvo; empate fica com o alvo.
 */

export interface ParamsBatalha {
  /** Id de src/data/batalhas/ (ou de um inimigo, para uma luta de um contra um). */
  batalha?: string;
  /** Formato antigo (Fase 3). */
  inimigo?: string;
  vitoria: string;
  derrota: string;
  /** Para onde voltar depois: a tela de capítulo (padrão) ou o mapa. */
  retorno?: 'capitulo' | 'mapa';
}

type Comando = 'bicuda' | 'intimidar' | 'acalmar' | 'aguardar' | 'item' | 'rasteira';
type Fim = 'vitoria' | 'derrota' | 'rasteira' | null;

interface Inimigo {
  uid: string;
  dados: DadosInimigo;
  nome: string;
  pv: number;
  pvMax: number;
  ativo: boolean;
  assustado: boolean;
  caido: boolean;
  defesaExtra: number;
  turnos: number;
  sprite: SpriteBatalha;
}

const T = textos.batalha;
const FORMACOES: [number, number][][] = [[], [[2, 8]], [[0, 18], [30, 4]], [[42, 4], [6, 58], [0, 0]]];

export function telaBatalha(params?: unknown): Tela {
  const prm = params as ParamsBatalha;
  const def: DadosBatalha = batalhaPorId(prm.batalha ?? prm.inimigo!);
  const regiao = (REGIOES as Record<string, { fundo: string; musica: string }>)[def.regiao];
  const p = getEstado().personagem!;
  const pvMax = pvAntesDaForjaDe(p);
  const defesa = defesaDe(p);
  const treino = def.treino === true;
  const pvAntes = Math.max(1, Math.min(pvMax, getEstado().campanha.pvAtual ?? pvMax));

  // ---- estado da luta ----
  let pvHeroi = treino ? pvMax : pvAntes;
  let heroiCaido = false;
  let preparado = false;
  let fim: Fim = null;
  let vez: string | null = null;
  let causouDano = false;
  const log: string[] = [];
  let ordem: { id: string; nome: string; valor: number }[] = [];
  let inimigos: Inimigo[] = [];
  let saiu = false;

  // ---- elementos ----
  const arena = h('div', { class: 'batalha-arena' });
  arena.style.backgroundImage = `url("${src(ASSETS.fundoBatalha(regiao.fundo))}")`;
  const mensagem = h('p', { class: 'batalha-mensagem', 'aria-live': 'polite' });
  const faixaTurnos = h('ol', { class: 'batalha-turnos', 'aria-label': T.ordem });
  const ladoInimigo = h('div', { class: 'batalha-lado inimigos' });
  const ladoHeroi = h('div', { class: 'batalha-lado herois' });
  const efeitos = h('div', { class: 'batalha-efeitos', 'aria-hidden': 'true' });
  const escuro = h('div', { class: 'batalha-escuro' });
  arena.append(ladoInimigo, ladoHeroi, efeitos, h('div', { class: 'batalha-topo' }, mensagem, faixaTurnos), escuro);
  // Pausa: Opções e Voltar ao menu; o Salvar aparece desabilitado durante a batalha.
  const btnPausa = botaoMenu('batalha-btn-pausa');
  let pausaAberta = false;
  btnPausa.addEventListener('click', () => {
    if (pausaAberta) return;
    pausaAberta = true;
    abrirMenuPausa({ emBatalha: true, aoFechar: () => { pausaAberta = false; } });
  });
  arena.append(btnPausa);

  const listaComandos = h('div', { class: 'batalha-comandos', role: 'group', 'aria-label': T.comandos });
  const dica = h('p', { class: 'batalha-dica' });
  const barraPv = h('div', { class: 'pv-barra' }, h('div', { class: 'pv-preenchido' }));
  const numeroPv = h('span', { class: 'pv-numero' });
  const status = h('span', { class: 'batalha-status' });
  const ficha = h('div', { class: 'batalha-ficha' },
    h('p', { class: 'ficha-nome' }, p.nome, status),
    h('div', { class: 'ficha-pv' }, h('span', { class: 'pv-rotulo' }, 'PV'), barraPv, numeroPv),
    h('p', { class: 'ficha-defesa' }, `${T.defesa} ${defesa}${treino ? ` · ${T.treino}` : ''}`));
  const registro = h('ol', { class: 'batalha-log' });
  const btnRegistro = h('button', { type: 'button', class: 'batalha-btn-log', 'aria-expanded': 'false' }, T.registro);
  const caixaLog = h('div', { class: 'batalha-caixa-log', hidden: true }, registro);
  btnRegistro.addEventListener('click', () => {
    caixaLog.hidden = !caixaLog.hidden;
    btnRegistro.setAttribute('aria-expanded', String(!caixaLog.hidden));
  });
  const janela = h('div', { class: 'batalha-janela' },
    h('div', { class: 'janela-esquerda' }, listaComandos, dica),
    h('div', { class: 'janela-direita' }, ficha, btnRegistro));
  const el = h('div', { class: 'tela-batalha' }, arena, janela, caixaLog);

  let heroi!: SpriteBatalha;

  // ---- utilidades ----
  const msg = (t: string) => { mensagem.textContent = t; };
  const registrar = (linha: string) => {
    log.push(linha);
    registro.append(h('li', {}, linha));
    registro.scrollTop = registro.scrollHeight;
  };
  const sfx = (n: string | undefined) => n && audio.sfx(n as NomeSfx);
  const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);
  const ativos = () => inimigos.filter((i) => i.ativo);
  const metade = (n: number) => Math.ceil(n / 2);
  const comNome = (t: string, i: Inimigo) => t.replace(/\{nome\}/g, i.nome).replace(/\{inimigo\}/g, i.nome);

  function atualizarFicha() {
    const frac = Math.max(0, pvHeroi / pvMax);
    (barraPv.firstElementChild as HTMLElement).style.width = `${frac * 100}%`;
    barraPv.classList.toggle('baixo', frac <= 0.25);
    numeroPv.textContent = `${Math.max(0, pvHeroi)} / ${pvMax}`;
    status.textContent = heroiCaido ? ` · ${T.caido}` : '';
  }

  /** Pose parada do herói: ajoelhado com 25% dos PV ou menos; caído com 0 ou derrubado. */
  function poseHeroiParado() {
    if (pvHeroi <= 0 || heroiCaido) return 'caido';
    return pvHeroi / pvMax <= 0.25 ? 'ferido' : 'parado';
  }
  function heroiEmGuarda() {
    if (!heroi) return; // sprites ainda carregando
    const pose = poseHeroiParado();
    heroi.mudarPose(pose);
    heroi.respirar(pose === 'parado');
  }
  function poseInimigoParado(i: Inimigo) {
    const d = i.dados;
    if (i.caido && d.poses.caido) return d.poses.caido;
    if (i.defesaExtra && d.poses.defendendo) return d.poses.defendendo;
    if (i.assustado && d.poses.assustada) return d.poses.assustada;
    if (d.exaustoComPv && i.pv <= d.exaustoComPv && d.poses.exausto) return d.poses.exausto;
    return d.poses.parado;
  }
  function inimigoEmGuarda(i: Inimigo) {
    if (!i.ativo) return;
    const pose = poseInimigoParado(i);
    i.sprite.mudarPose(pose);
    i.sprite.respirar(pose === i.dados.poses.parado);
  }

  /** Número que sobe e some sobre o alvo (crítico dourado e maior; cura em verde; "Errou!"). */
  function numeroSobre(alvo: SpriteBatalha, textoNum: string, classe: string) {
    const r = alvo.el.getBoundingClientRect();
    const a = arena.getBoundingClientRect();
    const n = h('span', { class: `batalha-numero ${classe}` }, textoNum);
    n.style.left = `${r.left - a.left + r.width / 2}px`;
    n.style.top = `${r.top - a.top + r.height * 0.25}px`;
    efeitos.append(n);
    setTimeout(() => n.remove(), 1400);
  }

  /**
   * O d20 animado sobre quem rola (Fase 5): o dado do jogador; o do adversário em cinza. Versão curta,
   * sem esperar toque (um toque na arena pula a animação). Some sozinho logo depois.
   */
  async function dadoNaArena(valor: number, quem: SpriteBatalha, cinza = false) {
    if (saiu) return;
    const d = criarDado({ tamanho: 78, cinza, classe: 'batalha-dado' });
    const r = quem.el.getBoundingClientRect();
    const a = arena.getBoundingClientRect();
    d.el.style.left = `${r.left - a.left + r.width / 2}px`;
    d.el.style.top = `${Math.max(46, r.top - a.top + r.height * 0.05)}px`;
    efeitos.append(d.el);
    const pular = () => d.pular();
    arena.addEventListener('pointerdown', pular);
    await d.rolar(valor, { curto: true });
    arena.removeEventListener('pointerdown', pular);
    window.setTimeout(() => { d.el.classList.add('saindo'); window.setTimeout(() => d.el.remove(), 300); }, 650);
  }

  /** Ícone que espatifa sobre o alvo (abóbora quebrada). */
  function iconeQuebrando(alvo: SpriteBatalha, icone: string) {
    const r = alvo.el.getBoundingClientRect();
    const a = arena.getBoundingClientRect();
    const img = h('img', { class: 'batalha-icone-quebra', src: src(ASSETS.item(icone)), alt: '' });
    img.style.left = `${r.left - a.left + r.width * 0.6}px`;
    img.style.top = `${r.top - a.top + r.height * 0.55}px`;
    efeitos.append(img);
    setTimeout(() => img.remove(), 1300);
  }

  // ---- dicas de tutorial: as mesmas do resto do jogo (src/data/tutorial.json), uma vez cada ----
  async function dicaDe(quando: string) {
    if (saiu) return;
    const comRasteira = (def.comandosExtras ?? []).includes('rasteira');
    const id = quando === 'inicio' ? 'batalha-turnos'
      : quando === 'primeiroTurnoHeroi' ? (comRasteira ? 'rasteira' : 'batalha-atacar')
      : quando === 'aposAtaqueInimigo' ? 'batalha-aguardar'
      : quando === 'aposAcao:defender' && comRasteira ? 'rasteira-defesa'
      : null;
    if (id) await dicaTutorial(id);
  }

  // ---- iniciativa ----
  async function rolarIniciativa() {
    const rolagens: { id: string; nome: string; valor: number; bonus: number }[] = [];
    const dH = rolarD20();
    const bH = bonusPericia(p, 'iniciativa').total;
    rolagens.push({ id: 'heroi', nome: p.nome, valor: dH + bH, bonus: bH });
    registrar(fmt(T.logIniciativa, p.genero, { nome: p.nome, d: dH, b: sinal(bH), t: dH + bH }));
    const dados: Promise<void>[] = [dadoNaArena(dH, heroi)];
    for (const i of inimigos) {
      const d = rolarD20();
      rolagens.push({ id: i.uid, nome: i.nome, valor: d + i.dados.iniciativa, bonus: i.dados.iniciativa });
      registrar(fmt(T.logIniciativa, p.genero, { nome: i.nome, d, b: sinal(i.dados.iniciativa), t: d + i.dados.iniciativa }));
      dados.push(dadoNaArena(d, i.sprite, true));
    }
    // Os dados de todos rolam juntos.
    await Promise.all(dados);
    // Empate: maior bônus age antes; persistindo, o herói.
    ordem = rolagens.sort((a, b) => b.valor - a.valor || b.bonus - a.bonus || (a.id === 'heroi' ? -1 : b.id === 'heroi' ? 1 : 0))
      .map(({ id, nome, valor }) => ({ id, nome, valor }));
    desenharFaixa();
    msg(`${T.iniciativaRotulo}: ${ordem.map((o) => `${o.nome} ${o.valor}`).join(' · ')}`);
    el.classList.add('mostrando-iniciativa');
    await esperar(1500);
    el.classList.remove('mostrando-iniciativa');
  }

  /** Faixa da ordem: quem fugiu sai dela. */
  function desenharFaixa() {
    const vivos = ordem.filter((o) => o.id === 'heroi' || inimigos.find((i) => i.uid === o.id)?.ativo);
    faixaTurnos.replaceChildren(...vivos.map((o) => h('li', { 'data-id': o.id, class: o.id === vez ? 'atual' : '' },
      h('span', { class: 'turno-nome' }, o.nome), h('span', { class: 'turno-valor' }, String(o.valor)))));
  }

  function marcarVez(id: string) {
    vez = id;
    for (const li of faixaTurnos.children) li.classList.toggle('atual', (li as HTMLElement).dataset.id === id);
  }

  // ---- comandos ----
  let escolher: ((c: { cmd: Comando; alvo?: Inimigo; item?: string }) => void) | null = null;

  function montarComandos() {
    const conversa = inimigos.every((i) => i.dados.aceitaConversa);
    const semConversa = inimigos.every((i) => i.dados.semConversa);
    const itens: [Comando, string, boolean][] = [['bicuda', T.cmd.bicuda, true]];
    for (const extra of def.comandosExtras ?? []) itens.push([extra as Comando, (T.cmd as Record<string, string>)[extra] ?? extra, true]);
    if (!semConversa) itens.push(['intimidar', T.cmd.intimidar, conversa], ['acalmar', T.cmd.acalmar, conversa]);
    itens.push(['aguardar', T.cmd.aguardar, true], ['item', T.cmd.item, temItensDeCura()]);
    listaComandos.replaceChildren(...itens.map(([id, rotulo, ok]) => {
      const b = botao(rotulo, () => void aoComando(id), { classe: 'batalha-cmd', som: 'ui-confirm' });
      b.dataset.comando = id;
      b.dataset.liberado = ok ? '1' : '0';
      const ajuda = (T.ajudaComandos as Record<string, string>)[id];
      if (!ok && (id === 'intimidar' || id === 'acalmar')) b.setAttribute('aria-description', T.furiosoDemais);
      else if (ajuda) b.setAttribute('aria-description', ajuda);
      if (ajuda) ajudaDoComando(b, !ok && (id === 'intimidar' || id === 'acalmar') ? T.furiosoDemais : ajuda);
      return b;
    }));
    dica.textContent = !semConversa && !conversa ? T.furiosoDemais : '';
  }

  /**
   * Ajuda sempre disponível (mesmo sem tutorial): passar o mouse ou segurar o dedo num comando mostra a
   * descrição de uma linha. Segurar não executa o comando.
   */
  let balaoAjuda: HTMLElement | null = null;
  function mostrarAjuda(b: HTMLElement, texto: string) {
    esconderAjuda();
    const r = b.getBoundingClientRect();
    const a = arena.getBoundingClientRect();
    balaoAjuda = h('div', { class: 'batalha-cmd-ajuda', role: 'tooltip' }, texto);
    arena.append(balaoAjuda);
    const w = balaoAjuda.offsetWidth;
    balaoAjuda.style.left = `${Math.min(Math.max(6, r.left - a.left + r.width / 2 - w / 2), a.width - w - 6)}px`;
    balaoAjuda.style.top = `${Math.max(6, r.top - a.top - balaoAjuda.offsetHeight - 8)}px`;
  }
  function esconderAjuda() {
    balaoAjuda?.remove();
    balaoAjuda = null;
  }
  function ajudaDoComando(b: HTMLButtonElement, texto: string) {
    let timer = 0;
    let segurou = false;
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') mostrarAjuda(b, texto); });
    b.addEventListener('pointerleave', () => { clearTimeout(timer); esconderAjuda(); });
    b.addEventListener('pointerdown', (e) => {
      segurou = false;
      if (e.pointerType === 'mouse') return;
      timer = window.setTimeout(() => { segurou = true; mostrarAjuda(b, texto); }, 450);
    });
    b.addEventListener('pointerup', () => { clearTimeout(timer); if (segurou) window.setTimeout(esconderAjuda, 1400); });
    b.addEventListener('pointercancel', () => { clearTimeout(timer); esconderAjuda(); });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    // Segurou para ler: o toque não vira comando.
    b.addEventListener('click', (e) => { if (segurou) { segurou = false; e.stopImmediatePropagation(); } }, { capture: true });
  }

  const temItensDeCura = () => Object.entries(ITENS_DEF).some(([id, d]) => d.tipo === 'cura' && qtdItem(id) > 0);

  function habilitarComandos(sim: boolean) {
    for (const b of listaComandos.querySelectorAll<HTMLButtonElement>('.batalha-cmd')) {
      if (b.dataset.comando === 'item') b.dataset.liberado = temItensDeCura() ? '1' : '0';
      b.disabled = !sim || b.dataset.liberado !== '1';
    }
    janela.classList.toggle('esperando', sim);
    if (sim) listaComandos.querySelector<HTMLButtonElement>('.batalha-cmd:not(:disabled)')?.focus({ preventScroll: true });
  }

  /** Bicuda e Rasteira escolhem o alvo (setas ou toque) se houver mais de um inimigo. */
  async function aoComando(cmd: Comando) {
    if (!escolher) return;
    if (cmd === 'item') return escolherItem();
    if ((cmd === 'bicuda' || cmd === 'rasteira') && ativos().length > 1) return escolherAlvo(cmd);
    escolher({ cmd, alvo: ativos()[0] });
  }

  function escolherAlvo(cmd: Comando) {
    const vivos = ativos();
    let atual = 0;
    const marcar = () => vivos.forEach((i, k) => i.sprite.el.classList.toggle('alvo-ativo', k === atual));
    const terminar = (i: Inimigo | null) => {
      vivos.forEach((x) => x.sprite.el.classList.remove('alvo-ativo', 'alvo-possivel'));
      window.removeEventListener('keydown', tecla);
      montarComandos();
      if (i) escolher?.({ cmd, alvo: i });
      else habilitarComandos(true);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { atual = (atual + vivos.length - 1) % vivos.length; marcar(); e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { atual = (atual + 1) % vivos.length; marcar(); e.preventDefault(); }
      else if (e.key === 'Escape') terminar(null);
    };
    window.addEventListener('keydown', tecla);
    vivos.forEach((i) => {
      i.sprite.el.classList.add('alvo-possivel');
      i.sprite.el.onclick = () => { if (i.sprite.el.classList.contains('alvo-possivel')) terminar(i); };
    });
    msg(T.escolhaAlvo);
    listaComandos.replaceChildren(
      ...vivos.map((i, k) => {
        const b = botao(i.nome, () => terminar(i), { classe: 'batalha-cmd batalha-alvo', som: 'ui-confirm' });
        b.dataset.alvo = String(k);
        b.addEventListener('focus', () => { atual = k; marcar(); });
        return b;
      }),
      botao(T.voltar, () => terminar(null), { classe: 'batalha-cmd', som: 'ui-back' }),
    );
    marcar();
    (listaComandos.querySelector('.batalha-alvo') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  function escolherItem() {
    const curas = Object.entries(ITENS_DEF).filter(([id, d]) => d.tipo === 'cura' && qtdItem(id) > 0);
    listaComandos.replaceChildren(
      ...curas.map(([id, d]) => {
        const b = botao(`${d.nome} ×${qtdItem(id)}`, () => { montarComandos(); escolher?.({ cmd: 'item', item: id }); }, { classe: 'batalha-cmd batalha-item', som: 'ui-confirm' });
        b.dataset.item = id;
        return b;
      }),
      botao(T.voltar, () => { montarComandos(); habilitarComandos(true); }, { classe: 'batalha-cmd', som: 'ui-back' }),
    );
    (listaComandos.querySelector('.batalha-item') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  // ---- ações do herói ----
  async function bicuda(alvo: Inimigo, prefixo = '') {
    const luta = bonusPericia(p, 'luta');
    const d = rolarD20();
    const defAlvo = alvo.dados.defesa + alvo.defesaExtra;
    const r = avaliar(d, luta.partes, defAlvo);
    const acerto = d !== 1 && (d === 20 || r.total >= defAlvo);
    const critico = d === 20;
    msg(prefixo || fmt(T.bicuda, p.genero, { nome: p.nome }));
    await dadoNaArena(d, heroi);
    let dano = 0;
    let rolagemDano = '';
    if (acerto) {
      const forca = p.atributosFinais.FOR;
      const [dd] = rolar(1, 4);
      dano = Math.max(1, dd + forca) * (critico ? 2 : 1);
      rolagemDano = `1d4${sinal(forca)} = ${Math.max(1, dd + forca)}${critico ? ` × 2 = ${dano}` : ''}`;
    }
    await heroi.atacar('ataque', 20, async () => {
      if (!acerto) {
        sfx('miss');
        numeroSobre(alvo.sprite, T.errou, 'errou');
        return;
      }
      sfx(critico ? 'crit' : 'kick');
      numeroSobre(alvo.sprite, String(dano), critico ? 'critico' : 'dano');
      alvo.pv -= dano;
      causouDano = true;
      await alvo.sprite.levarDano(alvo.dados.poses.atingido);
    });
    registrar(`${T.cmd.bicuda}: ${r.conta} ${T.contra} ${T.defesa} ${defAlvo}${alvo.nome !== inimigos[0].nome || inimigos.length > 1 ? ` (${alvo.nome})` : ''} · ${acerto ? (critico ? T.critico : T.acerto) : T.erro}${acerto ? ` · ${rolagemDano}` : ''}`);
    if (!acerto && def.aoErrar) {
      sfx(def.aoErrar.som);
      iconeQuebrando(alvo.sprite, def.aoErrar.icone);
      const n = somarContador(def.aoErrar.contador);
      msg(def.aoErrar.mensagem);
      registrar(`${def.aoErrar.mensagem} (${n})`);
      await esperar(900);
    }
    if (acerto && critico && alvo.dados.poses.tonto && alvo.pv > alvo.dados.fogeComPv) {
      alvo.sprite.mudarPose(alvo.dados.poses.tonto);
      await esperar(700);
    }
    heroiEmGuarda();
    await depoisDoDano(alvo);
  }

  /** Depois de levar dano: foge, fica assustado ou (no treino) encerra pela metade dos PV. */
  async function depoisDoDano(alvo: Inimigo) {
    if (treino && alvo.pv <= metade(alvo.pvMax)) { fim = 'vitoria'; return; }
    if (alvo.pv <= alvo.dados.fogeComPv) {
      if (alvo.dados.fogeNoProprioTurno) {
        alvo.assustado = true;
        inimigoEmGuarda(alvo);
        if (alvo.pv <= 0) await inimigoFoge(alvo, 'fugiu');
      } else {
        await inimigoFoge(alvo, 'fugiu');
      }
      return;
    }
    inimigoEmGuarda(alvo);
  }

  async function rasteira(alvo: Inimigo) {
    const luta = bonusPericia(p, 'luta');
    const dH = rolarD20();
    const dA = rolarD20();
    const forti = alvo.dados.fortitude ?? 0;
    const tH = dH + luta.total;
    const tA = dA + forti;
    const venceu = tH > tA;
    const ela = alvo.dados.id === 'nyme' || alvo.dados.id === 'ratazana';
    const veredito = venceu ? (ela ? T.elaCai : T.eleCai) : (ela ? T.elaAguenta : T.eleAguenta);
    const linha = `${T.cmd.rasteira}: ${dH} + FOR ${p.atributosFinais.FOR} = ${tH} × ${T.fortitudeDe.replace('{nome}', alvo.nome)}: ${dA} + ${forti} = ${tA} · ${veredito}`;
    msg(fmt(T.rasteiraMsg, p.genero, { nome: p.nome }));
    sfx('rasteira');
    await heroi.rasteira(() => {
      if (venceu) {
        alvo.caido = true;
        alvo.sprite.respirar(false);
        alvo.sprite.mudarPose(alvo.dados.poses.caido ?? alvo.dados.poses.atingido);
      }
    });
    await mostrarOposto(dH, tH, dA, tA, alvo.nome, venceu, veredito);
    registrar(linha);
    heroiEmGuarda();
    if (venceu && treino) fim = 'rasteira';
  }

  /** As duas rolagens lado a lado (teste oposto). */
  async function mostrarOposto(dH: number, tH: number, dA: number, tA: number, nomeAlvo: string, venceu: boolean, veredito: string) {
    // Os dois dados do teste oposto: o do jogador e o do adversário (em cinza).
    const dadoH = criarDado({ tamanho: 72, classe: 'oposta-dado' });
    const dadoA = criarDado({ tamanho: 72, cinza: true, classe: 'oposta-dado' });
    const totalH = h('p', { class: 'oposta-total', hidden: true }, `= ${tH}`);
    const totalA = h('p', { class: 'oposta-total', hidden: true }, `= ${tA}`);
    const vered = h('p', { class: 'oposta-veredito', hidden: true }, veredito);
    const caixa = h('div', { class: `rolagem-oposta ${venceu ? 'sucesso' : 'falha'}`, role: 'status' },
      h('div', { class: 'oposta-lado' }, h('p', { class: 'oposta-quem' }, p.nome), dadoH.el, h('p', { class: 'oposta-d20', hidden: true }, String(dH)), totalH),
      h('p', { class: 'oposta-x' }, '×'),
      h('div', { class: 'oposta-lado' }, h('p', { class: 'oposta-quem' }, nomeAlvo), dadoA.el, h('p', { class: 'oposta-d20', hidden: true }, String(dA)), totalA),
      vered);
    arena.append(caixa);
    const pular = () => { dadoH.pular(); dadoA.pular(); };
    caixa.addEventListener('pointerdown', pular);
    await Promise.all([dadoH.rolar(dH, { curto: true }), dadoA.rolar(dA, { curto: true, silencioso: true })]);
    caixa.removeEventListener('pointerdown', pular);
    totalH.hidden = totalA.hidden = vered.hidden = false;
    await esperar(1500);
    caixa.remove();
  }

  async function conversar(cmd: 'intimidar' | 'acalmar', alvo: Inimigo) {
    const pericia: IdPericia = cmd === 'intimidar' ? 'intimidacao' : 'adestramento';
    const cd = cmd === 'intimidar' ? alvo.dados.cdIntimidar ?? 12 : alvo.dados.cdAcalmar ?? 15;
    msg(fmt(cmd === 'intimidar' ? T.intimidando : T.acalmando, p.genero, { nome: p.nome }));
    const b = bonusPericia(p, pericia);
    const r = await mostrarRolagem(el, { titulo: T.cmd[cmd], d20: rolarD20(), partes: b.partes, alvo: cd, esperarToque: false, giroMs: 800 });
    registrar(`${T.cmd[cmd]}: ${r.conta} · CD ${cd} · ${r.sucesso ? T.sucesso : T.falha}`);
    if (!r.sucesso) {
      msg(cmd === 'intimidar' ? T.intimidarFalhou : T.acalmarFalhou);
      await esperar(1100);
      return;
    }
    marcarFlag(cmd === 'intimidar' ? 'intimidou' : 'acalmou');
    if (alvo.dados.poses.recuando) {
      alvo.sprite.respirar(false);
      alvo.sprite.mudarPose(alvo.dados.poses.recuando);
    }
    msg(fmt(cmd === 'intimidar' ? T.intimidarDeuCerto : T.acalmarDeuCerto, p.genero, { inimigo: alvo.nome }));
    await esperar(1000);
    await inimigoFoge(alvo, cmd === 'intimidar' ? 'fugiu' : 'acalmou');
  }

  async function usarItem(id: string) {
    const d = ITENS_DEF[id];
    const r = curarCom(d.cura!, pvHeroi);
    darItem(id, -1);
    pvHeroi = r.novo;
    atualizarFicha();
    heroiEmGuarda();
    numeroSobre(heroi, `+${r.recuperou}`, 'cura');
    msg(fmt(T.usouItem, p.genero, { nome: p.nome, item: d.nome, n: r.recuperou }));
    registrar(`${T.cmd.item}: ${d.nome} · ${d.cura} = ${r.rolagem} · +${r.recuperou} PV`);
    await esperar(1000);
  }

  async function inimigoFoge(i: Inimigo, motivo: 'fugiu' | 'acalmou') {
    sfx(i.dados.id.startsWith('ratazana') ? 'rato-guincho' : 'pig-squeal');
    const texto = fmt(motivo === 'fugiu' ? T.inimigoFoge : T.inimigoVolta, p.genero, { inimigo: i.nome });
    msg(texto);
    registrar(texto);
    i.ativo = false;
    await i.sprite.fugir(i.dados.poses.fugindo);
    desenharFaixa();
    if (!ativos().length) fim = 'vitoria';
  }

  // ---- turno do inimigo ----
  let acaoForcada: string | null = null;
  function escolherAcao(i: Inimigo): AtaqueDados & { id: string } {
    const ia = i.dados.ia;
    let id = ia.ataque ?? Object.keys(i.dados.ataques)[0];
    if (acaoForcada) { id = acaoForcada; acaoForcada = null; return { id, ...i.dados.ataques[id] }; }
    if (ia.tipo === 'investida' || ia.tipo === 'padrao') {
      if (i.turnos === 0 && ia.primeiro) id = ia.primeiro;
      else if (heroiCaido && ia.seCaido) id = ia.seCaido;
      else if (ia.senao) {
        let x = Math.random();
        for (const [nome, peso] of ia.senao) { if ((x -= peso) <= 0) { id = nome; break; } }
      }
    }
    return { id, ...i.dados.ataques[id] };
  }

  async function turnoDoInimigo(i: Inimigo) {
    if (i.assustado && i.dados.fogeNoProprioTurno) return inimigoFoge(i, 'fugiu');
    i.defesaExtra = 0;
    if (i.caido) {
      i.caido = false;
      msg(fmt(T.inimigoLevanta, p.genero, { inimigo: i.nome }));
      registrar(fmt(T.inimigoLevanta, p.genero, { inimigo: i.nome }));
      await esperar(900);
      inimigoEmGuarda(i);
      i.turnos++;
      return;
    }
    const atq = escolherAcao(i);
    i.turnos++;
    if (atq.acao === 'provocar') {
      msg(`${i.nome}: “${comNome(atq.mensagem, i)}”`);
      registrar(`${i.nome}: ${atq.nome}`);
      await esperar(1300);
      return;
    }
    if (atq.acao === 'defender') {
      i.defesaExtra = atq.bonusDefesa ?? 2;
      inimigoEmGuarda(i);
      msg(comNome(atq.mensagem, i));
      registrar(`${i.nome}: ${atq.nome} (+${i.defesaExtra} ${T.defesa})`);
      await esperar(900);
      await dicaDe(`aposAcao:${atq.id}`);
      return;
    }
    // Aguardar: a Bicuda preparada sai antes do ataque.
    if (preparado) {
      preparado = false;
      el.classList.remove('heroi-preparado');
      await bicuda(i, fmt(T.revida, p.genero, { nome: p.nome }));
      if (fim || !i.ativo || i.assustado) return;
      await esperar(300);
    }
    msg(comNome(atq.mensagem, i));
    const d = rolarD20();
    await dadoNaArena(d, i.sprite, true);
    const total = d + (atq.bonus ?? 0);
    const acerto = d !== 1 && (d === 20 || total >= defesa);
    const critico = d === 20;
    const dd = lerDado(atq.dano ?? '1d2');
    const base = rolar(dd.qtd, dd.lados).reduce((a, b) => a + b, 0) + dd.mod;
    const dano = acerto ? Math.max(1, base) * (critico ? 2 : 1) : 0;
    sfx(atq.som);
    const pose = atq.pose ? i.dados.poses[atq.pose] ?? atq.pose : i.dados.poses.ataque;
    await i.sprite.atacar(pose, atq.id === 'investida' ? 60 : 30, async () => {
      if (!acerto) {
        sfx('miss');
        numeroSobre(heroi, T.errou, 'errou');
        return;
      }
      sfx(critico ? 'crit' : 'kick');
      numeroSobre(heroi, String(dano), critico ? 'critico' : 'dano');
      pvHeroi = Math.max(0, pvHeroi - dano);
      atualizarFicha();
      await heroi.levarDano('atingido');
    });
    registrar(`${atq.nome}${inimigos.length > 1 ? ` (${i.nome})` : ''}: ${d} ${sinal(atq.bonus ?? 0)} = ${total} ${T.contra} ${T.defesa} ${defesa} · ${acerto ? (critico ? T.critico : T.acerto) : T.erro}${acerto ? ` · ${atq.dano} = ${Math.max(1, base)}${critico ? ` × 2 = ${dano}` : ''}` : ''}`);
    inimigoEmGuarda(i);
    if (treino && pvHeroi <= metade(pvMax)) { heroiEmGuarda(); fim = 'derrota'; return; }
    if (pvHeroi <= 0) { heroiEmGuarda(); fim = 'derrota'; return; }
    // Investida: se acertou, Fortitude (CON) contra a CD ou o herói fica Caído.
    if (acerto && atq.derruba) {
      const b = bonusPericia(p, atq.derruba.pericia as IdPericia);
      const dF = rolarD20();
      await dadoNaArena(dF, heroi);
      const r = avaliar(dF, b.partes, atq.derruba.cd);
      registrar(`${T.fortitude}: ${r.conta} · CD ${atq.derruba.cd} · ${r.sucesso ? T.sucesso : T.falha}`);
      if (!r.sucesso) {
        heroiCaido = true;
        heroiEmGuarda();
        sfx('fall');
        msg(fmt(T.derrubado, p.genero, { nome: p.nome }));
        atualizarFicha();
        await esperar(900);
      } else {
        msg(fmt(T.resistiu, p.genero, { nome: p.nome }));
        await esperar(800);
      }
    }
    heroiEmGuarda();
    await dicaDe('aposAtaqueInimigo');
  }

  // ---- turno do herói ----
  async function turnoDoHeroi() {
    if (heroiCaido) {
      msg(T.levantando);
      registrar(fmt(T.logLevantando, p.genero, { nome: p.nome }));
      await esperar(1000);
      heroiCaido = false;
      atualizarFicha();
      heroiEmGuarda();
    }
    msg(fmt(T.vezDoHeroi, p.genero, { nome: p.nome }));
    await dicaDe('primeiroTurnoHeroi');
    if (pvHeroi <= metade(pvMax) && temItensDeCura()) await dicaTutorial('batalha-item');
    habilitarComandos(true);
    const escolha = await new Promise<{ cmd: Comando; alvo?: Inimigo; item?: string }>((ok) => { escolher = ok; });
    escolher = null;
    habilitarComandos(false);
    const alvo = escolha.alvo ?? ativos()[0];
    if (escolha.cmd === 'bicuda') await bicuda(alvo);
    else if (escolha.cmd === 'rasteira') await rasteira(alvo);
    else if (escolha.cmd === 'item' && escolha.item) await usarItem(escolha.item);
    else if (escolha.cmd === 'intimidar' || escolha.cmd === 'acalmar') await conversar(escolha.cmd, alvo);
    else {
      preparado = true;
      el.classList.add('heroi-preparado');
      msg(fmt(T.aguardando, p.genero, { nome: p.nome }));
      registrar(fmt(T.aguardando, p.genero, { nome: p.nome }));
      await esperar(900);
    }
  }

  // ---- fim ----
  function aplicarFim(chave: string) {
    const f = def.fins?.[chave];
    if (!f) return;
    for (const fl of f.flag === undefined ? [] : Array.isArray(f.flag) ? f.flag : [f.flag]) marcarFlag(fl);
    for (const [id, n] of Object.entries(f.relacao ?? {})) mudarRelacao(id, n);
  }

  function seguirPara(cena: string) {
    void irPara(prm.retorno === 'mapa' ? 'mapa' : 'capitulo', { cena }, { duracao: 700 });
  }

  async function vitoria() {
    heroi.respirar(false);
    heroi.mudarPose('vitoria');
    if (def.semVinheta) audio.pararMusica(1800);
    else audio.tocarVinheta(ASSETS.musica('vitoria'));
    msg(fim === 'rasteira' ? fmt(T.treinoRasteira, p.genero, { inimigo: inimigos[0].nome }) : treino ? T.treinoVitoria : T.vitoria);
    el.classList.add('vitoria');
    aplicarFim(fim === 'rasteira' ? 'rasteira' : 'vitoria');
    if (def.flagDano && causouDano) marcarFlag(def.flagDano);
    atualizarCampanha({ pvAtual: treino ? pvAntes : pvHeroi });
    if (!treino) marcarFlag('venceu_' + def.id.split('-')[0]);
    await esperar(600);
    mostrarContinuar(prm.vitoria);
  }

  async function derrota() {
    heroi.respirar(false);
    if (def.flagDano && causouDano) marcarFlag(def.flagDano);
    if (treino) {
      heroi.mudarPose('ferido');
      const n = inimigos[0];
      if (n.dados.poses.vitoria) { n.sprite.respirar(false); n.sprite.mudarPose(n.dados.poses.vitoria); }
      audio.pararMusica(1800);
      msg(fmt(T.treinoDerrota, p.genero, { inimigo: n.nome }));
      aplicarFim('derrota');
      atualizarCampanha({ pvAtual: pvAntes });
      await esperar(600);
      return mostrarContinuar(prm.derrota);
    }
    heroi.mudarPose('caido');
    sfx('fall');
    msg(fmt(T.derrota, p.genero, { nome: p.nome }));
    atualizarCampanha({ pvAtual: 0 });
    el.classList.add('derrota');
    await esperar(2200);
    if (saiu) return;
    seguirPara(prm.derrota);
  }

  function mostrarContinuar(cena: string) {
    const b = botao(T.continuar, () => seguirPara(cena), { classe: 'btn-principal batalha-continuar' });
    listaComandos.replaceChildren(b);
    dica.textContent = '';
    b.focus({ preventScroll: true });
  }

  async function lutar() {
    await rolarIniciativa();
    await dicaDe('inicio');
    while (!fim && !saiu) {
      for (const o of ordem) {
        if (fim || saiu) break;
        const i = inimigos.find((x) => x.uid === o.id);
        if (i && !i.ativo) continue;
        marcarVez(o.id);
        if (o.id === 'heroi') await turnoDoHeroi();
        else await turnoDoInimigo(i!);
        await esperar(250);
      }
    }
    vez = null;
    if (saiu) return;
    if (fim === 'derrota') await derrota();
    else await vitoria();
  }

  // ---- escala dos sprites (inteira quando possível) ----
  function escalar() {
    if (!heroi || !inimigos.length) return;
    const altura = arena.clientHeight;
    const largInimigos = Math.max(...inimigos.map((i) => i.sprite.larguraQuadro)) * (inimigos.length > 1 ? 1.5 : 1);
    const porAltura = altura / (heroi.alturaQuadro * 2.15);
    const porLargura = (arena.clientWidth * 0.86) / (heroi.larguraQuadro + largInimigos);
    const bruto = Math.min(porAltura, porLargura);
    const k = bruto >= 2 ? Math.min(4, Math.floor(bruto)) : bruto >= 1.5 ? 1.5 : 1;
    heroi.escalar(k);
    inimigos.forEach((i) => i.sprite.escalar(k));
    el.style.setProperty('--escala', String(k));
  }
  const observador = new ResizeObserver(() => escalar());

  registrarGanchos({
    setPv: (n: number) => { pvHeroi = n; atualizarFicha(); heroiEmGuarda(); },
    setPvInimigo: (n: number, k = 0) => { if (inimigos[k]) inimigos[k].pv = n; },
    /** A próxima ação do inimigo (ex.: "espada"), em vez do sorteio da IA. */
    forcarAcaoInimigo: (id: string) => { acaoForcada = id; },
    comando: (c: Comando) => void aoComando(c),
    alvo: (k: number) => (listaComandos.querySelectorAll<HTMLButtonElement>('.batalha-alvo')[k])?.click(),
    desfazerInimigo: () => inimigos[0]?.sprite.desfazer(),
    state: () => ({
      ...estadoProgresso(),
      tela: 'batalha',
      batalha: def.id,
      inimigo: inimigos[0]?.dados.id ?? null,
      inimigos: inimigos.map((i) => ({ uid: i.uid, id: i.dados.id, nome: i.nome, pv: i.pv, ativo: i.ativo, pose: i.sprite.pose, caido: i.caido, defesaExtra: i.defesaExtra })),
      pvHeroi, pvMax, defesa, treino,
      pvInimigo: (ativos()[0] ?? inimigos[0])?.pv ?? null,
      ordem: ordem.filter((o) => o.id === 'heroi' || inimigos.find((i) => i.uid === o.id)?.ativo).map((o) => o.id),
      iniciativa: ordem.map((o) => o.valor),
      vez,
      poseHeroi: heroi?.pose ?? null,
      poseInimigo: inimigos[0]?.sprite.pose ?? null,
      heroiCaido, preparado, fim,
      comandos: [...listaComandos.querySelectorAll<HTMLButtonElement>('.batalha-cmd[data-comando]')].map((b) => ({ id: b.dataset.comando, habilitado: b.dataset.liberado === '1' })),
      log: [...log],
    }),
  });

  return {
    el,
    aoEntrar() {
      void (async () => {
        await audio.carregarEfeitos([...SFX_CAPITULO, ...SFX_FASE4]);
        audio.tocarMusica(ASSETS.musica(def.musica ?? regiao.musica), 1200);
        for (const b of def.bestiario ?? []) encontrarCriatura(b);
        const ids = [...new Set(def.inimigos)];
        const [fH, ...folhas] = await Promise.all([
          carregarFolha(ASSETS.spriteBatalhaHeroi(p.raca, p.genero)),
          ...ids.map((id) => carregarFolha(ASSETS.spriteBatalhaInimigo(INIMIGOS[id].sprite))),
        ]);
        if (saiu) return;
        heroi = new SpriteBatalha(fH, 'heroi', 'direita');
        ladoHeroi.append(heroi.el);
        const contagem: Record<string, number> = {};
        const repetidos = (id: string) => def.inimigos.filter((x) => x === id).length > 1;
        const formacao = FORMACOES[Math.min(3, def.inimigos.length)];
        inimigos = def.inimigos.slice(0, 3).map((id, k) => {
          const dados = INIMIGOS[id];
          contagem[id] = (contagem[id] ?? 0) + 1;
          const nome = repetidos(id) ? `${dados.nome} ${'ABC'[contagem[id] - 1]}` : dados.nome;
          const sprite = new SpriteBatalha(folhas[ids.indexOf(id)], 'inimigo', 'esquerda');
          const [x, y] = formacao[k];
          Object.assign(sprite.el.style, { position: 'absolute', left: `${x}%`, bottom: `${y}%`, zIndex: String(20 - Math.round(y / 5)) });
          sprite.el.dataset.uid = k === 0 ? 'inimigo' : `inimigo-${k + 1}`;
          ladoInimigo.append(sprite.el);
          const pv = treino ? dados.pv : dados.pv;
          return { uid: sprite.el.dataset.uid, dados, nome, pv, pvMax: dados.pv, ativo: true, assustado: false, caido: false, defesaExtra: 0, turnos: 0, sprite };
        });
        ladoInimigo.classList.toggle('varios', inimigos.length > 1);
        montarComandos();
        habilitarComandos(false);
        atualizarFicha();
        escalar();
        observador.observe(arena);
        heroiEmGuarda();
        inimigos.forEach(inimigoEmGuarda);
        el.classList.add('pronta');
        msg(inimigos.length > 1 ? fmt(T.aparecemVarios, p.genero, { inimigo: inimigos[0].dados.nome }) : fmt(T.aparece, p.genero, { inimigo: inimigos[0].nome }));
        await esperar(1100);
        if (!saiu) await lutar();
      })();
    },
    aoSair() {
      saiu = true;
      observador.disconnect();
      delete (window as unknown as { __fdg?: unknown }).__fdg;
    },
  };
}
