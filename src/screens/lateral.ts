import LATERAL from '../data/lateral/ato1.json';
import { ASSETS, SFX_ATO1, src } from '../core/assets';
import { audio, type LoopAmbiente } from '../core/audio';
import { paginaLida } from '../core/caderno';
import { importar } from '../core/carregar';
import { forcarD20, rolarD20 } from '../core/dados';
import { animacoesReduzidas, atualizarCampanha, getEstado, marcarFlag, tremoresLigados } from '../core/estado';
import { garantirEtapa, PAINEIS_LATERAIS, PECAS_FRENTE, SIMBOLOS } from '../core/etapas';
import { estadoProgresso, modoTeste, registrarGanchos } from '../core/ganchos';
import { bonusPericia, pvAntesDaForjaDe, type IdPericia } from '../core/pericias';
import { nivelRelacao, relacao } from '../core/progresso';
import { irPara, type Tela } from '../core/telas';
import { ehToque, textos } from '../core/textos';
import { esperar, h } from '../core/ui';
import { cartaoParte } from '../narrativa/cartoes';
import { criarPalco, type Palco } from '../narrativa/palco';
import { mostrarRolagem } from '../narrativa/rolagem';
import { estadoMemoria } from '../narrativa/memoria';
import type { GradeLajes, MotorLateral, Tocha } from '../exploracao/lateral';
import { proximaParteDoAto } from './fimCapitulo';
import { abrirMenuPausa } from './pausa';

/**
 * Fase lateral do Ato I (Partes 2 a 5): o túnel, os símbolos, o corredor de Sólem e a escuridão.
 * O motor (exploracao/lateral.ts) desenha e move; esta tela cuida das regras: gatilhos de fala, testes,
 * flechas, a regra do LEVANTE, o save a cada painel e a passagem de uma parte para a outra.
 */

interface DadosParte {
  x0: number; x1: number; inicio: { x: number; y: number }; fim?: number;
  musica: string; ambiente: number;
  tetoBaixo?: [number, number][];
  gatilhos?: { id: string; x: number; cena: string }[];
  grade?: GradeLajes;
  audicao?: { x: number; cd: number };
  parede?: number; avisoVoltar?: number; acenderEm?: number;
  tochas?: Tocha[];
  porta?: { x: number; raio: number };
}
const D = LATERAL as unknown as {
  altura: number; alturaHeroi: number; velocidade: number;
  paineis: { id: string; x: number; w: number; chao: [number, number] }[];
  frente: { id: string; x: number; lado: 'cima' | 'baixo'; altura: number }[];
  pocas: { x: number; y: number; r: number }[];
  partes: Record<string, DadosParte>;
};
const NOMES_DEUS: Record<string, string> = { S: 'Sólem', J: 'Justar', A: 'Ardor', X: 'Expiria', E: 'Eternus', M: 'Mentis', I: 'Irae' };
const ID_DEUS: Record<string, string> = { S: 'solem', J: 'justar', A: 'ardor', X: 'expiria', E: 'eternus', M: 'mentis', I: 'irae' };
const ACERTOS = ['A flecha acerta o seu tornozelo.', 'Outra passa de raspão no seu braço.', 'A terceira crava na sua coxa.'];

/** Dados de dano (1d4) forçados nos testes. */
let danosForcados: number[] = [];
const rolarDano = (lados: number) => danosForcados.shift() ?? 1 + Math.floor(Math.random() * lados);

export function telaLateral(): Tela {
  const p = getEstado().personagem!;
  const c0 = getEstado().campanha;
  const parte = typeof c0.parte === 'number' ? c0.parte : 2;
  const dp = D.partes[String(parte)];
  const comecoDaParte = !c0.cena || c0.cena === 'inicio' || c0.local.tela !== 'lateral' || c0.local.x === undefined;

  const jogoEl = h('div', { class: 'lateral-jogo' });
  const palcoEl = h('div', { class: 'lateral-palco' });
  const pv = h('p', { class: 'lateral-pv', 'aria-live': 'polite' });
  const busto = h('img', { class: 'lateral-busto', alt: '', hidden: true, draggable: 'false' });
  const nomeLaje = h('p', { class: 'lateral-nome-laje', hidden: true });
  const el = h('div', { class: `tela-lateral parte-${parte}` }, jogoEl, pv, busto, nomeLaje, palcoEl);

  let motor: MotorLateral | null = null;
  let palco: Palco | null = null;
  let cenaAberta: string | null = null;
  let saiu = false;
  let ocupado = false;
  let fecharPausa: (() => void) | null = null;
  let loopTocha: LoopAmbiente | null = null;
  let loopGotejar: LoopAmbiente | null = null;
  let painelAtual = -1;
  /** O jogador já tem o controle (depois do cartão e da primeira fala). */
  let pronto = false;

  const pvMax = () => pvAntesDaForjaDe(p);
  const pvAtual = () => getEstado().campanha.pvAtual ?? pvMax();
  const mostrarPv = () => { pv.textContent = `PV ${pvAtual()}/${pvMax()}`; };
  const feito = (id: string) => getEstado().campanha.coletados.includes(`lateral:${id}`);
  const marcar = (id: string) => { if (!feito(id)) atualizarCampanha({ coletados: [...getEstado().campanha.coletados, `lateral:${id}`] }); };
  const contador = (id: string) => getEstado().campanha.contadores[id] ?? 0;
  const somar = (id: string, n = 1) => atualizarCampanha({ contadores: { ...getEstado().campanha.contadores, [id]: contador(id) + n } });
  const temFlag = (f: string) => getEstado().campanha.flags.includes(f);

  const controles = new (class { c: import('../exploracao/controles').Controles | null = null; })();

  /* ------------------------------------------------------------ falas por cima da fase */

  function falar(id: string): Promise<void> {
    return new Promise((ok) => {
      if (!motor || saiu) return ok();
      salvarPosicao();
      cenaAberta = id;
      ocupado = true;
      motor.bloquear(true);
      controles.c?.habilitar(false);
      controles.c?.mostrarInteracao(false);
      el.classList.add('com-palco');
      palco?.destruir();
      palcoEl.replaceChildren();
      palco = criarPalco({
        sobreMapa: true,
        aoBatalha: () => {},
        aoFim: () => fechar(),
        aoMapa: () => fechar(),
        aoVoltar: () => fechar(),
      });
      function fechar() {
        palco?.destruir();
        palco = null;
        palcoEl.replaceChildren();
        el.classList.remove('com-palco');
        cenaAberta = null;
        ocupado = false;
        motor?.bloquear(false);
        controles.c?.habilitar(true);
        mostrarPv();
        ok();
      }
      palcoEl.append(palco.el);
      void palco.entrar(id, 'falas');
    });
  }

  /* ------------------------------------------------------------ testes, dano e LEVANTE */

  async function teste(pericia: IdPericia, cd: number, extra = 0) {
    const b = bonusPericia(p, pericia, extra);
    const titulo = pericia === 'audicao' ? 'Audição' : pericia === 'visao' ? 'Visão' : pericia === 'vontade' ? 'Vontade'
      : pericia === 'atletismo' ? 'Atletismo' : pericia === 'reflexos' ? 'Reflexos' : pericia === 'religiao' ? 'Religião' : pericia;
    const d20 = rolarD20();
    const r = await mostrarRolagem(el, { titulo, d20, partes: b.partes, alvo: cd, esperarToque: false, giroMs: modoTeste() ? 200 : 700 });
    return { ...r, d20 };
  }

  function bustoRapido(expressao: string, ms = 1400) {
    const normal = ASSETS.bustoHeroi(p.raca, p.genero);
    const com = ASSETS.bustoHeroi(p.raca, p.genero, expressao);
    busto.onerror = () => { busto.onerror = null; busto.src = src(normal); };
    busto.src = src(com);
    busto.dataset.expressao = expressao;
    busto.hidden = false;
    busto.classList.remove('some');
    window.setTimeout(() => busto.classList.add('some'), ms);
    window.setTimeout(() => { busto.hidden = true; }, ms + 400);
  }

  /** Uma flecha da fenda da parede: Reflexos CD 12 reduz o dano (1d4) à metade (mínimo 1). */
  async function flecha(texto?: string): Promise<number> {
    if (!motor) return 0;
    audio.sfx('armadilha-estalo');
    await esperar(180);
    audio.sfx('flecha-nyme');
    await motor.flecha();
    let dano = rolarDano(4);
    const bonus = parte === 4 && temFlag('ouviu_mecanismo') ? 2 : 0;
    const r = await teste('reflexos', 12, bonus);
    if (r.sucesso) dano = Math.max(1, Math.floor(dano / 2));
    const novo = pvAtual() - dano;
    atualizarCampanha({ pvAtual: Math.max(0, novo) });
    audio.sfx('coracao-menos');
    if (tremoresLigados()) motor.tremer();
    bustoRapido('dor');
    motor.textoSobre(texto ? `${texto}  −${dano} PV` : `−${dano} PV`, '#ffb3a1');
    somar('flechas');
    mostrarPv();
    return dano;
  }

  /** Regra do LEVANTE (Partes 2 a 5): a primeira queda levanta com 1 PV; a segunda é game over. */
  async function verificarQueda(): Promise<boolean> {
    if (pvAtual() > 0) return false;
    if (!temFlag('levantou')) {
      await falar('s-levante');
      atualizarCampanha({ pvAtual: 1 });
      marcarFlag('levantou');
      mostrarPv();
      return false;
    }
    salvarPosicao();
    void irPara('gameOver', { lateral: true }, { duracao: 900 });
    saiu = true;
    return true;
  }

  /* ------------------------------------------------------------ save */

  function salvarPosicao() {
    if (!motor) return;
    const { x, y } = motor.posicao();
    const painel = D.paineis.findIndex((q) => x >= q.x && x < q.x + q.w);
    atualizarCampanha({ cena: null, local: { tela: 'lateral', x: Math.round(x), y: Math.round(y), painel } });
  }

  /* ------------------------------------------------------------ regras por parte */

  let ultimaCasa: string | null = null;
  let parado = 0;
  let ultimoX = 0;
  let emAcao = false;

  async function aoMover(x: number, y: number) {
    if (!motor || ocupado || emAcao || saiu) return;
    // Save a cada painel.
    const painel = D.paineis.findIndex((q) => x >= q.x && x < q.x + q.w);
    if (painel !== painelAtual) { painelAtual = painel; salvarPosicao(); }
    // Gotejar: mais alto perto das poças.
    if (loopGotejar) {
      const d = Math.min(...D.pocas.map((q) => Math.hypot(q.x - x, q.y - y)));
      loopGotejar.ganho(parte === 2 ? 0.12 + 0.55 * Math.max(0, 1 - d / 700) : 0.1, 250);
    }
    // Gatilhos de fala (uma vez cada).
    for (const g of dp.gatilhos ?? []) {
      if (x >= g.x && !feito(`p${parte}:${g.id}`)) {
        marcar(`p${parte}:${g.id}`);
        emAcao = true;
        await falar(g.cena);
        emAcao = false;
        return;
      }
    }
    // Teto baixo: metade da velocidade.
    const baixo = (dp.tetoBaixo ?? []).some(([a, b]) => x >= a && x <= b);
    motor.velocidade(baixo ? 0.5 : 1);
    if (parte === 3) return regrasSimbolos(x);
    if (parte === 4) return regrasCorredor(x);
    if (parte === 5) return regrasEscuro(x);
    if (dp.fim && x >= dp.fim) return terminar();
  }

  async function terminar() {
    if (saiu || emAcao) return;
    emAcao = true;
    motor?.bloquear(true);
    salvarPosicao();
    saiu = true;
    proximaParteDoAto();
  }

  /* ---------- Parte 3: os símbolos ---------- */
  const tab = dp.grade?.tabuleiro;
  const letra = (col: number, lin: number) => tab?.[lin]?.[col] ?? '';

  async function regrasSimbolos(x: number) {
    if (!motor || !dp.grade) return;
    const casa = motor.casa();
    const chave = casa ? `${casa.col},${casa.lin}` : null;
    // Parado ao lado de uma laje: o nome dela (e os testes de pista na primeira vez).
    const moveu = Math.abs(x - ultimoX) > 0.5;
    ultimoX = x;
    parado = moveu ? 0 : parado + 1;
    const frente = casa ? { col: casa.col + 1, lin: casa.lin } : (x < dp.grade.x ? { col: 0, lin: linhaDoY(motor.posicao().y) } : null);
    if (parado === 20 && frente && letra(frente.col, frente.lin)) { emAcao = true; await pistas(frente); emAcao = false; }
    if (moveu && !nomeLaje.hidden) nomeLaje.hidden = true;
    if (chave && chave !== ultimaCasa && casa) {
      ultimaCasa = chave;
      if (letra(casa.col, casa.lin) === 'S' && !feito(`p3:laje:${chave}`)) {
        marcar(`p3:laje:${chave}`);
        emAcao = true;
        await armadilhaSimbolos(casa);
        emAcao = false;
        return;
      }
    } else if (!chave) ultimaCasa = null;
    const fimGrade = dp.grade.x + dp.grade.larguraLaje * dp.grade.tabuleiro[0].length;
    if (x >= Math.max(dp.fim ?? 0, fimGrade + 20)) {
      emAcao = true;
      // A tolerância: nenhuma flecha além da primeira.
      if (contador('flechas_p3') <= 1) marcarFlag('caminho_tolerancia');
      await falar('s-fim');
      emAcao = false;
      return terminar();
    }
  }

  const linhaDoY = (y: number) => {
    const g = dp.grade!;
    let acc = g.y;
    for (let l = 0; l < g.alturas.length; l++) { acc += g.alturas[l]; if (y < acc) return l; }
    return g.alturas.length - 1;
  };

  async function armadilhaSimbolos(casa: { col: number; lin: number }) {
    if (!motor) return;
    motor.bloquear(true);
    motor.dispararLaje(casa.col, casa.lin);
    await flecha();
    somar('flechas_p3');
    const n = contador('flechas_p3');
    if (n === 1 && !temFlag('levantou')) {
      // A primeira flecha (roteiro): o herói cai e se vê de pé, envolto em luz. Conta como o primeiro LEVANTE.
      await falar('s-levante');
      marcarFlag('levantou');
      atualizarCampanha({ pvAtual: Math.max(1, pvAtual()) });
      mostrarPv();
    } else if (await verificarQueda()) return;
    if (n === 2) await falar('s-flecha2');
    if (n === 3) {
      await falar('s-flecha3');
      if (getEstado().config.tutorial) motor.brilharSeguras(3000);
    }
    motor.bloquear(false);
  }

  async function pistas(alvo: { col: number; lin: number }) {
    const l = letra(alvo.col, alvo.lin);
    if (!l) return;
    // Teste passivo, na primeira vez ao lado de uma laje de Sólem: Audição ou Visão (o maior), CD 12.
    if (l === 'S' && !feito('p3:passivo')) {
      marcar('p3:passivo');
      const aud = bonusPericia(p, 'audicao').total, vis = bonusPericia(p, 'visao').total;
      const pericia: IdPericia = aud > vis ? 'audicao' : 'visao';
      const r = await teste(pericia, 12);
      if (r.sucesso) await falar(pericia === 'visao' ? 's-solta-visao' : 's-solta-audicao');
    }
    // O nome da laje: se o herói abriu a página do deus no Caderno, ou passou em Religião CD 10.
    const deus = ID_DEUS[l];
    let conhece = paginaLida(deus) || temFlag('nomes_lajes');
    if (!conhece && !feito('p3:religiao')) {
      marcar('p3:religiao');
      const r = await teste('religiao', 10);
      if (r.sucesso) { marcarFlag('nomes_lajes'); conhece = true; }
    }
    if (conhece) {
      nomeLaje.textContent = `Laje de ${NOMES_DEUS[l]}`;
      nomeLaje.hidden = false;
    }
  }

  /* ---------- Parte 4: o corredor de Sólem ---------- */
  async function regrasCorredor(x: number) {
    if (!motor || !dp.grade) return;
    const g = dp.grade;
    const fimGrade = g.x + g.larguraLaje * g.tabuleiro[0].length;
    // Audição opcional, pelo botão de interação, antes de atravessar.
    const pertoAudicao = !!dp.audicao && Math.abs(x - dp.audicao.x) < 160 && !feito('p4:audicao');
    controles.c?.mostrarInteracao(pertoAudicao);
    const casa = motor.casa();
    const chave = casa ? `${casa.col},${casa.lin}` : null;
    if (chave && chave !== ultimaCasa && casa) {
      // Andando: cada laje é um pouso.
      ultimaCasa = chave;
      emAcao = true;
      await flechaCorredor();
      emAcao = false;
      return;
    } else if (!chave) ultimaCasa = null;
    // Do outro lado das lajes (andando ou no pouso do pulo).
    if (x >= fimGrade + 40) {
      emAcao = true;
      await falar('c-fim');
      emAcao = false;
      return terminar();
    }
  }

  async function flechaCorredor() {
    if (!motor) return;
    motor.bloquear(true);
    const i = contador('flechas_p4');
    await flecha(ACERTOS[i % ACERTOS.length]);
    somar('flechas_p4');
    if (await verificarQueda()) return;
    motor.bloquear(false);
  }

  /** Pulo no corredor: Atletismo CD 12 (sucesso: 3 lajes; falha: 2; 20 natural: atravessa tudo). */
  async function puloCorredor(): Promise<boolean> {
    if (!motor || !dp.grade || emAcao || ocupado) return false;
    const g = dp.grade;
    const { x } = motor.posicao();
    const n = g.tabuleiro[0].length;
    const fimGrade = g.x + g.larguraLaje * n;
    if (x < g.x - 300 || x >= fimGrade) return false;
    emAcao = true;
    motor.bloquear(true);
    const r = await teste('atletismo', 12);
    const atual = x < g.x ? -1 : Math.floor((x - g.x) / g.larguraLaje);
    const lajes = r.d20 === 20 ? n + 1 : r.sucesso ? 3 : 2;
    const destino = atual + lajes;
    const alvoX = destino >= n ? fimGrade + 70 : g.x + destino * g.larguraLaje + g.larguraLaje / 2;
    audio.sfx('kick', { ganho: 0.5 });
    await motor.pularAte(alvoX, 520 + lajes * 40);
    const casa = motor.casa();
    ultimaCasa = casa ? `${casa.col},${casa.lin}` : null;
    if (casa) await flechaCorredor();
    else motor.bloquear(false);
    emAcao = false;
    return true;
  }

  /* ---------- Parte 5: a escuridão e a porta ---------- */
  async function regrasEscuro(x: number) {
    if (!motor) return;
    const inicio = dp.inicio.x;
    if (dp.avisoVoltar && x < dp.avisoVoltar && !feito('p5:voltar')) {
      marcar('p5:voltar');
      emAcao = true; await falar('e-voltar'); emAcao = false; return;
    }
    if (x > inicio + 40 && !feito('p5:vontade')) {
      marcar('p5:vontade');
      emAcao = true;
      motor.bloquear(true);
      const r = await teste('vontade', 12);
      if (r.sucesso) { marcarFlag('coragem_escuro'); await falar('e-vontade-ok'); }
      else await falar('e-vontade-falha');
      if (nivelRelacao(relacao('nyme')) === 'leal') await falar('e-nyme');
      emAcao = false;
      return;
    }
    if (dp.acenderEm && x >= dp.acenderEm && feito('p5:vontade') && !feito('p5:tochas')) {
      marcar('p5:tochas');
      void acenderTochas();
    }
    const pertoPorta = !!dp.porta && Math.abs(x - dp.porta.x) < dp.porta.raio;
    controles.c?.mostrarInteracao(pertoPorta);
  }

  async function acenderTochas() {
    if (!motor) return;
    audio.sfx('tochas-acendendo');
    void motor.luz({ ambiente: 0.6, ms: 4200 });
    motor.silhueta(false);
    await motor.acenderTochas(animacoesReduzidas() ? 250 : 520);
    marcarFlag('tochas_acenderam');
  }

  async function abrirPorta() {
    if (!motor || emAcao) return;
    emAcao = true;
    controles.c?.mostrarInteracao(false);
    await falar('e-porta');
    audio.sfx('porta-antiga');
    const luz = h('div', { class: 'lateral-luz-porta' });
    el.append(luz);
    requestAnimationFrame(() => luz.classList.add('ativa'));
    await esperar(1600);
    emAcao = false;
    await terminar();
  }

  /* ------------------------------------------------------------ entrada */

  async function interagir() {
    if (!motor || ocupado || emAcao) return;
    const { x } = motor.posicao();
    if (parte === 4 && dp.audicao && Math.abs(x - dp.audicao.x) < 160 && !feito('p4:audicao')) {
      marcar('p4:audicao');
      emAcao = true;
      controles.c?.mostrarInteracao(false);
      const r = await teste('audicao', dp.audicao.cd);
      if (r.sucesso) { marcarFlag('ouviu_mecanismo'); await falar('c-audicao'); } else await falar('c-audicao-falha');
      emAcao = false;
      return;
    }
    if (parte === 5 && dp.porta && Math.abs(x - dp.porta.x) < dp.porta.raio) return abrirPorta();
  }

  function pular() {
    if (!motor || ocupado) return;
    if (parte === 4) { void puloCorredor().then((ok) => { if (!ok && !emAcao) { motor?.pular() && audio.sfx('kick', { ganho: 0.35 }); } }); return; }
    if (emAcao) return;
    if (motor.pular()) audio.sfx('kick', { ganho: 0.35 });
  }

  function abrirPausa() {
    if (fecharPausa || ocupado) return;
    motor?.bloquear(true);
    controles.c?.habilitar(false);
    fecharPausa = abrirMenuPausa({ aoFechar: () => { fecharPausa = null; motor?.bloquear(false); controles.c?.habilitar(true); } });
  }

  /* ------------------------------------------------------------ ganchos de teste */

  registrarGanchos({
    avancar: () => palco?.tocar(),
    teleportar: (x: number, y?: number) => motor?.teleportar(x, y ?? motor.posicao().y),
    pular: () => pular(),
    interagir: () => void interagir(),
    forceDano: (v: number[]) => { danosForcados = [...v]; },
    forceRoll: (v: number[]) => forcarD20(v),
    state: () => ({
      ...estadoProgresso(),
      tela: 'lateral',
      parte,
      cena: cenaAberta,
      digitando: palco?.digitando() ?? false,
      escolhas: palco?.escolhasVisiveis() ?? [],
      ocupado: ocupado || emAcao,
      pronto,
      lateral: motor?.estado() ?? null,
      casa: motor?.casa() ?? null,
      pvMax: pvMax(),
      nomeLaje: nomeLaje.hidden ? null : nomeLaje.textContent,
      memoria: estadoMemoria(palcoEl.querySelector('.palco-cena')),
      busto: busto.hidden ? null : busto.dataset.expressao,
      interacao: controles.c ? !controles.c.botaoInteragir.hidden : false,
      botaoPular: controles.c?.botaoPular ? { visivel: !controles.c.botaoPular.hidden } : null,
    }),
  });

  return {
    el,
    aoEntrar() {
      void (async () => {
        const sons = audio.carregarEfeitos([...SFX_ATO1]);
        await garantirEtapa('a1lateral', el);
        await sons;
        if (saiu) return;
        if (getEstado().campanha.pvAtual === null) atualizarCampanha({ pvAtual: pvMax() });
        // Início da parte: o save do começo (o Continuar do game over volta para cá).
        if (comecoDaParte) {
          const c = getEstado().campanha;
          atualizarCampanha({ inicioParte: { parte, pv: c.pvAtual, flags: [...c.flags], coletados: [...c.coletados], contadores: { ...c.contadores } } });
        }
        mostrarPv();
        const { Controles } = await importar(() => import('../exploracao/controles'));
        controles.c = new Controles({
          raiz: el, toque: ehToque(), rotuloInteragir: textos.cenas.continuar, rotuloPausa: textos.cenas.pausa,
          aoInteragir: () => void interagir(), aoPausar: abrirPausa, aoPular: pular, rotuloPular: 'PULAR',
        });
        controles.c.habilitar(false);
        const pac = await importar(() => import('../exploracao/pacote'));
        const urls: Record<string, string> = { heroi: src(`sprites/lateral-${p.raca}-${p.genero}.png`) };
        for (const id of PAINEIS_LATERAIS) urls[`painel-${id}`] = src(`img/lateral/${id}.webp`);
        for (const id of PECAS_FRENTE) urls[`frente-${id}`] = src(`img/lateral/frente-${id}.png`);
        for (const id of SIMBOLOS) urls[`simbolo-${id}`] = src(`img/simbolos/${id}.png`);
        for (const id of SIMBOLOS) urls[`brilho-${id}`] = src(`img/simbolos/${id}-brilho.png`);
        const l = getEstado().campanha.local;
        const ini = !comecoDaParte && l.x !== undefined ? { x: l.x, y: l.y ?? dp.inicio.y } : dp.inicio;
        motor = await pac.criarMotorLateral({
          container: jogoEl, paineis: D.paineis, urls, altura: D.altura, alturaHeroi: D.alturaHeroi, velocidade: D.velocidade,
          frente: D.frente, pocas: D.pocas, inicio: ini, limites: [dp.x0, dp.x1], reduzidas: animacoesReduzidas(),
        });
        if (saiu) { motor.destruir(); return; }
        ultimoX = ini.x;
        motor.bloquear(true);
        motor.definirEntrada(() => controles.c?.vetor() ?? { x: 0, y: 0 });
        motor.luz({ ambiente: dp.ambiente });
        if (dp.grade) motor.grade(dp.grade);
        if (parte === 3 && dp.grade) {
          motor.alcancePulo(0.35);
          // Pista: flechas antigas quebradas perto das lajes de Sólem (fora da primeira coluna).
          const casas: { col: number; lin: number }[] = [];
          dp.grade.tabuleiro.forEach((linha, lin) => [...linha].forEach((ch, col) => { if (ch === 'S' && col > 0 && (col + lin) % 2 === 0) casas.push({ col, lin }); }));
          motor.flechasAntigas(casas);
          for (const ch of getEstado().campanha.coletados) {
            const m = ch.match(/^lateral:p3:laje:(\d+),(\d+)$/);
            if (m) motor.dispararLaje(Number(m[1]), Number(m[2]));
          }
        }
        if (dp.tochas) motor.definirTochas(dp.tochas);
        if (dp.parede) motor.paredeEsquerda(dp.parede);
        audio.tocarMusica(ASSETS.musica(dp.musica), 2000);
        const escuroTotal = parte === 5 && !temFlag('tochas_acenderam');
        if (parte <= 4 || escuroTotal) loopTocha = audio.loopAmbiente('tocha', 0.22, 800);
        if (parte <= 4) loopGotejar = audio.loopAmbiente('gotejar', 0.2, 1200);
        if (parte === 5 && temFlag('tochas_acenderam')) {
          // Retomando depois das tochas: já acesas.
          motor.luz({ raio: 0, ambiente: 0.6 });
          void motor.acenderTochas(0);
        } else if (parte === 5 && !comecoDaParte) {
          motor.luz({ raio: 0.2, ambiente: 0.03 });
          motor.silhueta(true);
        }
        if (comecoDaParte) {
          await cartaoParte(1, parte);
          if (saiu) return;
          atualizarCampanha({ cena: null });
          salvarPosicao();
        }
        if (parte === 5 && comecoDaParte) {
          // A lufada de ar frio apaga a tocha: o círculo encolhe até sumir em 1 s.
          await esperar(400);
          audio.sfx('vento-sopro');
          await motor.luz({ raio: 0.2, ambiente: 0.03, ms: 1000 });
          loopTocha?.parar(600);
          loopTocha = null;
          motor.silhueta(true);
          await falar('e-apaga');
        }
        motor.aoMover((x, y) => void aoMover(x, y));
        motor.bloquear(false);
        controles.c.habilitar(true);
        pronto = true;
      })();
    },
    aoSair() {
      saiu = true;
      palco?.destruir();
      fecharPausa?.();
      loopTocha?.parar(400);
      loopGotejar?.parar(400);
      controles.c?.destruir();
      motor?.destruir();
      motor = null;
      document.querySelectorAll('.modal-fundo, .rolagem-fundo').forEach((m) => m.remove());
    },
  };
}
