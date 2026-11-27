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
import { dica } from '../core/tutorial';
import { esperar, h } from '../core/ui';
import { editorPedido } from '../exploracao/editor';
import { centroLaje, colunaEm, depoisDaGrade, ehQuebrada, fileiraDoY, juntaX, linhas } from '../exploracao/grade';
import { criarPalco, precisaEspelhar, type Palco } from '../narrativa/palco';
import { mostrarRolagem } from '../narrativa/rolagem';
import { estadoMemoria } from '../narrativa/memoria';
import type { GradeLajes, MotorLateral, Tocha } from '../exploracao/lateral';
import { proximaParteDoAto } from './fimCapitulo';
import { abrirMenuPausa } from './pausa';

/**
 * Fase lateral do Ato I (Partes 2 a 5): o túnel, os símbolos, o corredor de Sólem e a escuridão.
 * O motor (exploracao/lateral.ts) desenha e move; esta tela cuida das regras: gatilhos de fala, testes,
 * flechas, a visão, a regra do LEVANTE, o save a cada painel e a passagem de uma parte para a outra.
 *
 * Fase 6B:
 * - Primeiro tabuleiro (Parte 3, a tolerância): o caminho seguro evita Sólem e começa já na primeira
 *   coluna; as lajes de Sólem disparam a flecha.
 * - Segundo tabuleiro (Parte 4, o corredor de Sólem): o inverso. O caminho certo é o de Sólem; as lajes
 *   dos outros deuses disparam a flecha; duas lajes de Sólem estão quebradas e é preciso pular
 *   (Atletismo CD 12). A voz interior é a pista.
 * - A visão ("Se você quer ser forte, continue.") vem na primeira flecha que acerta, em qualquer
 *   tabuleiro; sem nenhuma flecha nos dois, ela vem no fim do segundo, como recompensa. O LEVANTE só
 *   acontece a 0 PV de verdade.
 * - Todo teste diz antes o que o herói tenta e, depois, o que mudou (e vai para o Diário). Teste
 *   passivo que falha não mostra nada.
 * - Sem cartão de "Parte N": a passagem de um trecho para o outro é só um fade curto.
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
  // Começo da parte: só quando o fim da anterior (ou o Continuar do game over) marcou cena "inicio".
  // O save de cada painel grava cena null com a posição: retomar continua dali (Fase 6B; antes recomeçava).
  const comecoDaParte = c0.cena === 'inicio' || c0.local.tela !== 'lateral' || c0.local.x === undefined;

  const jogoEl = h('div', { class: 'lateral-jogo' });
  const palcoEl = h('div', { class: 'lateral-palco' });
  const pv = h('p', { class: 'lateral-pv', 'aria-live': 'polite' });
  const busto = h('img', { class: 'lateral-busto', alt: '', hidden: true, draggable: 'false' });
  const nomeLaje = h('p', { class: 'lateral-nome-laje', hidden: true });
  /** A frase de um teste: antes do dado (o que o herói tenta) e depois (o que mudou). */
  const aviso = h('p', { class: 'lateral-aviso', hidden: true, 'aria-live': 'polite' });
  const el = h('div', { class: `tela-lateral parte-${parte} entrando` }, jogoEl, pv, busto, nomeLaje, aviso, palcoEl);

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

  const NOME_PERICIA: Partial<Record<IdPericia, string>> = {
    audicao: 'Audição', visao: 'Visão', vontade: 'Vontade', atletismo: 'Atletismo', reflexos: 'Reflexos', religiao: 'Religião',
  };
  let timerAviso = 0;
  function avisar(texto: string, ms = 2800) {
    window.clearTimeout(timerAviso);
    aviso.textContent = texto;
    aviso.hidden = false;
    aviso.classList.remove('some');
    if (ms > 0) timerAviso = window.setTimeout(() => { aviso.classList.add('some'); timerAviso = window.setTimeout(() => { aviso.hidden = true; }, 350); }, ms);
  }
  function registrar(texto: string) {
    const c = getEstado().campanha;
    atualizarCampanha({ registro: [...(c.registro ?? []), { ato: c.ato, texto }] });
  }

  /**
   * Um teste de perícia: a frase de antes (o que o herói tenta), o dado (o selo mostra a perícia, a CD e
   * o bônus) e a frase de depois (o que mudou), que também vai para o Diário. Sem `depois`, a frase
   * de depois é a fala que a tela abre em seguida. Passivo: rola em silêncio e, na falha, não mostra nada.
   */
  async function teste(pericia: IdPericia, cd: number, extra = 0, f: { antes?: string; sucesso?: string; falha?: string; passivo?: boolean } = {}) {
    const b = bonusPericia(p, pericia, extra);
    const titulo = NOME_PERICIA[pericia] ?? pericia;
    const d20 = rolarD20();
    const total = d20 + b.total;
    const passou = d20 === 20 || (d20 !== 1 && total >= cd);
    if (f.passivo && !passou) {
      registrar(`${titulo} (CD ${cd}): ${f.falha ?? 'você não percebeu nada.'}`);
      return { sucesso: false, d20 };
    }
    if (f.antes) avisar(f.antes, 0);
    const r = await mostrarRolagem(el, { titulo, d20, partes: b.partes, alvo: cd, esperarToque: false, giroMs: modoTeste() ? 200 : 700 });
    const depois = r.sucesso ? f.sucesso : f.falha;
    if (depois) avisar(depois);
    else if (f.antes) aviso.hidden = true;
    registrar(`${titulo} (CD ${cd}): ${depois ?? (r.sucesso ? 'sucesso' : 'falha')}`);
    return { ...r, d20 };
  }

  function bustoRapido(expressao: string, ms = 1400) {
    const normal = ASSETS.bustoHeroi(p.raca, p.genero);
    const com = ASSETS.bustoHeroi(p.raca, p.genero, expressao);
    busto.onerror = () => { busto.onerror = null; busto.src = src(normal); };
    busto.src = src(com);
    busto.dataset.expressao = expressao;
    // O busto do herói fica à direita, olhando para dentro da tela (retratos.json).
    busto.classList.toggle('espelhado', precisaEspelhar(com, 'heroi'));
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
    const r = await teste('reflexos', 12, bonus, {
      antes: 'Uma flecha sai da fenda da parede! Você tenta se esquivar.',
      sucesso: 'Você gira o corpo a tempo: a flecha só raspa (dano pela metade).',
      falha: 'Você não consegue desviar: a flecha acerta em cheio.',
    });
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

  /** Depois de uma flecha: a visão (só na primeira que acerta, em qualquer tabuleiro) e a regra do LEVANTE. */
  async function depoisDaFlecha(): Promise<boolean> {
    if (!temFlag('visao_vista')) {
      await falar('s-visao');
      marcarFlag('visao_vista');
    }
    return verificarQueda();
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
  let dicaPulo = false;

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
    // Primeiro trecho lateral, já com o controle (sem fala aberta): a dica do pulo (opção de dicas do tutorial).
    if (pronto && !dicaPulo) { dicaPulo = true; void dica('pular'); }
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

  /* ---------- Parte 3: os símbolos (a tolerância) ---------- */
  const g = dp.grade;
  const tab = g?.tabuleiro;
  const letra = (col: number, lin: number) => tab?.[lin]?.[col] ?? '';
  /** A laje à frente do herói: a da coluna seguinte, na fileira dele (antes da grade, a da primeira coluna). */
  function lajeAFrente(x: number, y: number): { col: number; lin: number } | null {
    if (!g) return null;
    const lin = Math.max(0, Math.min(linhas(g) - 1, fileiraDoY(g, y)));
    const col = colunaEm(g, x, y);
    // Antes da grade, só bem perto da primeira coluna (não no ponto de partida).
    if (col < 0 && x < juntaX(g, 0, y) - 120) return null;
    const alvo = col < 0 ? 0 : col + 1;
    return alvo < g.juntas.length - 1 ? { col: alvo, lin } : null;
  }
  function contaParado(x: number) {
    const moveu = Math.abs(x - ultimoX) > 0.5;
    ultimoX = x;
    parado = moveu ? 0 : parado + 1;
    if (moveu && !nomeLaje.hidden) nomeLaje.hidden = true;
    return moveu;
  }

  async function regrasSimbolos(x: number) {
    if (!motor || !g) return;
    const { y } = motor.posicao();
    const casa = motor.casa();
    const chave = casa ? `${casa.col},${casa.lin}` : null;
    contaParado(x);
    // Parado ao lado de uma laje: o nome dela (e os testes de pista na primeira vez).
    const frente = lajeAFrente(x, y);
    if (parado === 20 && frente && letra(frente.col, frente.lin)) { emAcao = true; await pistas(frente); emAcao = false; }
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
    if (depoisDaGrade(g, x, y, 20)) {
      emAcao = true;
      // A tolerância: atravessou sem nenhuma flecha.
      if (contador('flechas_p3') === 0) marcarFlag('caminho_tolerancia');
      await falar('s-fim');
      emAcao = false;
      return terminar();
    }
  }

  async function armadilhaSimbolos(casa: { col: number; lin: number }) {
    if (!motor) return;
    motor.bloquear(true);
    motor.dispararLaje(casa.col, casa.lin);
    await flecha();
    somar('flechas_p3');
    const n = contador('flechas_p3');
    if (await depoisDaFlecha()) return;
    if (n === 2) await falar('s-flecha2');
    if (n === 3) {
      await falar('s-flecha3');
      if (getEstado().config.tutorial) motor.brilharSeguras(3000, (l) => l !== 'S');
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
      const r = await teste(pericia, 12, 0, {
        passivo: true,
        sucesso: pericia === 'visao' ? 'Você percebe que a laje de Sólem está solta.' : 'Você ouve um estalo metálico sob a laje de Sólem.',
        falha: 'você não percebeu nada.',
      });
      if (r.sucesso) await falar(pericia === 'visao' ? 's-solta-visao' : 's-solta-audicao');
    }
    // O nome da laje: se o herói abriu a página do deus no Caderno, ou passou em Religião CD 10.
    const deus = ID_DEUS[l];
    let conhece = paginaLida(deus) || temFlag('nomes_lajes');
    let destaque = false;
    if (!conhece && !feito('p3:religiao')) {
      marcar('p3:religiao');
      await falar('s-religiao');
      const r = await teste('religiao', 10, 0, {
        sucesso: 'Você reconhece os sete deuses: o nome de cada um aparece quando você para ao lado da laje.',
        falha: 'Os nomes fogem da sua memória.',
      });
      if (r.sucesso) { marcarFlag('nomes_lajes'); conhece = true; destaque = true; await falar('s-religiao-ok'); }
      else await falar('s-religiao-falha');
    }
    if (conhece) {
      nomeLaje.textContent = `Laje de ${NOMES_DEUS[l]}`;
      nomeLaje.hidden = false;
      // O que o herói ganhou: os nomes aparecem sobre as lajes por um instante e o rótulo pisca.
      if (destaque) {
        motor?.mostrarNomes(2600, NOMES_DEUS);
        nomeLaje.classList.remove('destaque');
        void nomeLaje.offsetWidth;
        nomeLaje.classList.add('destaque');
      }
    }
  }

  /* ---------- Parte 4: o corredor de Sólem (o inverso) ---------- */
  async function regrasCorredor(x: number) {
    if (!motor || !g) return;
    const { y } = motor.posicao();
    // Audição opcional, pelo botão de interação, antes de atravessar.
    const pertoAudicao = !!dp.audicao && Math.abs(x - dp.audicao.x) < 160 && !feito('p4:audicao');
    controles.c?.mostrarInteracao(pertoAudicao);
    contaParado(x);
    const casa = motor.casa();
    // Parado diante da primeira laje (uma vez só): a voz interior.
    if (parado >= 20 && !casa && x < juntaX(g, 0, y) && x > juntaX(g, 0, y) - 120 && !feito('p4:primeira')) {
      marcar('p4:primeira');
      emAcao = true; await falar('c-primeira'); emAcao = false;
      return;
    }
    // Teste passivo de Visão CD 12, parado diante de uma laje errada (de outro deus), uma vez.
    const frente = lajeAFrente(x, y);
    if (parado >= 30 && frente && letra(frente.col, frente.lin) && letra(frente.col, frente.lin) !== 'S' && !feito('p4:visao')) {
      marcar('p4:visao');
      emAcao = true;
      const r = await teste('visao', 12, 0, { passivo: true, sucesso: 'Você percebe que a laje de outro deus está solta.' });
      if (r.sucesso) await falar('c-solta');
      emAcao = false;
      return;
    }
    const chave = casa ? `${casa.col},${casa.lin}` : null;
    if (chave && chave !== ultimaCasa && casa) {
      const anterior = ultimaCasa;
      ultimaCasa = chave;
      // Laje quebrada: o herói tropeça na beira do buraco (sem pular) e volta para a laje de trás.
      if (ehQuebrada(g, casa.col, casa.lin)) {
        emAcao = true;
        await quedaNoBuraco(casa, anterior);
        emAcao = false;
        return;
      }
      // Laje de outro deus: a armadilha (uma vez por laje).
      if (letra(casa.col, casa.lin) !== 'S' && !feito(`p4:laje:${chave}`)) {
        marcar(`p4:laje:${chave}`);
        emAcao = true;
        await armadilhaCorredor(casa);
        emAcao = false;
        return;
      }
    } else if (!chave) ultimaCasa = null;
    // Do outro lado das lajes.
    if (depoisDaGrade(g, x, y, 30)) {
      emAcao = true;
      motor.bloquear(true);
      if (contador('flechas_p4') === 0) marcarFlag('seguiu_a_luz');
      await falar('c-fim');
      // Nenhuma flecha nos dois tabuleiros: a visão vem agora, sem queda, como recompensa.
      if (!temFlag('visao_vista') && contador('flechas_p3') === 0 && contador('flechas_p4') === 0) {
        await falar('c-visao');
        marcarFlag('visao_vista');
      }
      emAcao = false;
      return terminar();
    }
  }

  async function armadilhaCorredor(casa: { col: number; lin: number }) {
    if (!motor) return;
    motor.bloquear(true);
    motor.dispararLaje(casa.col, casa.lin);
    const i = contador('flechas_p4');
    await flecha(ACERTOS[i % ACERTOS.length]);
    somar('flechas_p4');
    const n = contador('flechas_p4');
    if (await depoisDaFlecha()) return;
    if (n === 1) await falar('c-flecha1');
    if (n === 2) {
      await falar('c-flecha2');
      // Com as dicas ligadas, as lajes de Sólem do caminho brilham por 3 s.
      if (getEstado().config.tutorial) motor.brilharSeguras(3000, (l) => l === 'S');
    }
    motor.bloquear(false);
  }

  /** Centro de uma laje, com os pés do herói na fileira dela. */
  const pe = (col: number, lin: number) => { const c = centroLaje(g!, col, lin); return { x: c.x, y: c.y }; };

  async function quedaNoBuraco(buraco: { col: number; lin: number }, anterior: string | null) {
    if (!motor) return;
    motor.bloquear(true);
    const [ac, al] = anterior ? anterior.split(',').map(Number) : [buraco.col - 1, buraco.lin];
    const volta = ac >= 0 ? pe(ac, al) : { x: juntaX(g!, 0, motor.posicao().y) - 40, y: motor.posicao().y };
    await perderNaBeira(volta, 'Você tropeça na beira do buraco. É preciso pular.');
  }

  /** Cai na beira do buraco: 1d4 PV e volta para a laje de trás. */
  async function perderNaBeira(volta: { x: number; y: number }, texto: string) {
    if (!motor) return;
    const dano = rolarDano(4);
    atualizarCampanha({ pvAtual: Math.max(0, pvAtual() - dano) });
    audio.sfx('fall', { ganho: 0.6 });
    audio.sfx('coracao-menos');
    if (tremoresLigados()) motor.tremer();
    bustoRapido('dor');
    motor.textoSobre(`${texto}  −${dano} PV`, '#ffb3a1');
    mostrarPv();
    await esperar(500);
    motor.teleportar(volta.x, volta.y);
    const casa = motor.casa();
    ultimaCasa = casa ? `${casa.col},${casa.lin}` : null;
    if (await verificarQueda()) return;
    motor.bloquear(false);
  }

  /** O buraco à frente do herói (mesma fileira, coluna seguinte), se houver. */
  function buracoAFrente(): { col: number; lin: number } | null {
    if (!motor || !g) return null;
    const { x, y } = motor.posicao();
    const f = lajeAFrente(x, y);
    return f && ehQuebrada(g, f.col, f.lin) ? f : null;
  }

  /** Pulo sobre a laje quebrada: Atletismo CD 12 (sucesso: a laje de Sólem seguinte; falha: a beira). */
  async function puloBuraco(buraco: { col: number; lin: number }): Promise<void> {
    if (!motor || !g) return;
    emAcao = true;
    motor.bloquear(true);
    const r = await teste('atletismo', 12, 0, {
      antes: 'Você toma impulso para pular o buraco.',
      sucesso: 'Você cai do outro lado, na laje de Sólem.',
      falha: 'O pé escorrega na beira do buraco.',
    });
    const { x } = motor.posicao();
    const destino = pe(buraco.col + 1, buraco.lin);
    // Os pés na fileira do buraco, para o pulo cair na laje certa.
    motor.teleportar(x, destino.y);
    audio.sfx('kick', { ganho: 0.5 });
    if (r.sucesso) {
      await motor.pularAte(destino.x, 620);
      ultimaCasa = `${buraco.col + 1},${buraco.lin}`;
      if (r.d20 === 20) { motor.textoSobre('Você nem sentiu o vão.', '#ffe2a8'); avisar('Você nem sentiu o vão.'); }
      motor.bloquear(false);
    } else {
      const beira = centroLaje(g, buraco.col, buraco.lin);
      await motor.pularAte(beira.x - beira.largura * 0.25, 420);
      await perderNaBeira(pe(buraco.col - 1, buraco.lin), 'Você cai na beira do buraco.');
    }
    emAcao = false;
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
      const r = await teste('vontade', 12, 0, {
        antes: 'O escuro aperta o peito. Você tenta não entrar em pânico.',
        sucesso: 'Você domina o medo e segue em frente.',
        falha: 'O medo trava as pernas por um momento.',
      });
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
    // A luz das tochas toma o lugar da tocha do herói (apagada): o furo dela fecha (raio 0) e a camada
    // escura fica uniforme, cada vez mais clara. A silhueta do escuro total sai.
    void motor.luz({ raio: 0, ambiente: 0.6, ms: 4200 });
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
      const r = await teste('audicao', dp.audicao.cd, 0, {
        antes: 'Você encosta o ouvido na parede e presta atenção ao mecanismo.',
        sucesso: 'Você entende o ritmo das flechas: +2 em Reflexos neste corredor.',
        falha: 'Você não consegue ouvir o mecanismo.',
      });
      if (r.sucesso) { marcarFlag('ouviu_mecanismo'); await falar('c-audicao'); } else await falar('c-audicao-falha');
      emAcao = false;
      return;
    }
    if (parte === 5 && dp.porta && Math.abs(x - dp.porta.x) < dp.porta.raio) return abrirPorta();
  }

  function pular() {
    if (!motor || ocupado || emAcao) return;
    // No corredor de Sólem, diante de uma laje quebrada: o pulo com Atletismo.
    if (parte === 4) {
      const b = buracoAFrente();
      if (b && !motor.noAr()) { void puloBuraco(b); return; }
    }
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
    andarAte: (x: number, y?: number) => motor?.teleportar(x, y ?? motor.posicao().y),
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
      aviso: aviso.hidden ? null : aviso.textContent,
      registro: getEstado().campanha.registro ?? [],
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
          aoInteragir: () => void interagir(), aoPausar: abrirPausa, aoPular: pular, rotuloPular: 'PULAR', teclaPular: 'Espaço',
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
          frente: D.frente, pocas: D.pocas, inicio: ini, limites: [dp.x0, dp.x1], reduzidas: animacoesReduzidas(), editor: editorPedido(),
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
        }
        if (parte === 4) motor.alcancePulo(0.35);
        // Lajes que já dispararam (retomando o save): continuam rachadas.
        for (const ch of getEstado().campanha.coletados) {
          const m = ch.match(new RegExp(`^lateral:p${parte}:laje:(\\d+),(\\d+)$`));
          if (m) motor.dispararLaje(Number(m[1]), Number(m[2]));
        }
        if (dp.tochas) motor.definirTochas(dp.tochas);
        if (dp.parede) motor.paredeEsquerda(dp.parede);
        // Modo de calibração (?editor=1): tudo aceso, para conferir a grade e as tochas contra o painel.
        if (editorPedido()) motor.luz({ raio: 0, ambiente: 1 });
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
        // Sem cartão de "Parte N": só o fade curto da entrada (CSS .entrando).
        requestAnimationFrame(() => el.classList.remove('entrando'));
        if (comecoDaParte) {
          await esperar(modoTeste() ? 150 : 600);
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
