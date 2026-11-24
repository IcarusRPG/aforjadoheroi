import { garantirEtapa } from '../core/etapas';
import { ASSETS, SFX_SONHO, existeAsset, src, urlAsset } from '../core/assets';
import { audio } from '../core/audio';
import { ehErroDeModulo, importar, mostrarTelaDeErro } from '../core/carregar';
import { registrarErro } from '../core/erros';
import { definirPausador, dica } from '../core/tutorial';
import { concluirSonho, getEstado, ouvirVoz, tremoresLigados } from '../core/estado';
import { irPara, type Tela } from '../core/telas';
import { ehToque, fmt, textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';
import MAPA_JSON from '../data/mapas/sonho.json';
import { blocosDoChao, type DadosMapa } from '../exploracao/tipos';
import { CaixaFala } from '../exploracao/caixaFala';
import { Controles } from '../exploracao/controles';
import type { EstatuaSonho } from '../exploracao/efeitosSonho';
import { abrirOpcoes } from './opcoes';

/**
 * O sonho dos deuses: primeira cena de exploração.
 * O herói (chibi) anda pelo templo celestial, ouve as sete vozes e, no altar, recebe o clímax.
 * Phaser só é carregado aqui, por import() dinâmico.
 */

const MAPA = MAPA_JSON as unknown as DadosMapa & { estatuas: EstatuaSonho[] };
const T = textos.sonho;
const VOZES = T.vozes as Record<string, { titulo: string; mensagem: string }>;
const TOTAL = MAPA.estatuas.length;
/** Intervalo aleatório entre tremores de terra (ms). */
const TREMOR_MIN = 15_000;
const TREMOR_MAX = 30_000;

const parametros = () => new URLSearchParams(location.search);

/**
 * Com ?test=1, os marcos da cena (caminhada, chegada ao altar, feixes, "O escolhido…") ficam registrados em
 * window.__fdgLog, que sobrevive à troca de tela: em máquinas lentas o teste pode olhar depois que a cena acabou.
 */
function registrar(evento: string, dados: Record<string, unknown> = {}) {
  if (!parametros().has('test')) return;
  const w = window as unknown as { __fdgLog?: { evento: string; t: number }[] };
  (w.__fdgLog ??= []).push({ evento, t: Math.round(performance.now()), ...dados });
}

async function musicaDoSonho(): Promise<string | null> {
  for (const c of ASSETS.musicaSonho) if (await existeAsset(c, 'audio')) return c;
  return null;
}

export function telaSonho(): Tela {
  const p = getEstado().personagem;
  const toque = ehToque();
  const palco = h('div', { class: 'sonho-palco' });
  const carregando = h('p', { class: 'sonho-carregando' }, T.carregando);
  const contador = h('div', { class: 'sonho-contador', 'aria-live': 'polite' });
  const dicaSonho = h('p', { class: 'sonho-dica' }, toque ? T.dicaToque : T.dicaTeclado);
  const hud = h('div', { class: 'sonho-hud' }, contador, dicaSonho);
  const clarao = h('div', { class: 'sonho-clarao' });
  const pularClimax = h('div', { class: 'dica-pular sonho-pular' }, toque ? T.pularClimaxToque : T.pularClimax);
  const el = h('div', { class: 'tela-sonho' }, palco, carregando, hud, pularClimax, clarao);

  let saiu = false;
  let pausado = false;
  let emClimax = false;
  let desfazerPausador = () => {};
  /** O herói está indo sozinho até o altar (depois da 7ª voz). */
  let emCaminhada = false;
  let tremoresFeitos = 0;
  let ultimoTremorCamera = false;
  let musica: string | null = null;
  let spriteUsado = '';
  let menuPausa: HTMLElement | null = null;
  let motor: import('../exploracao/motor').Motor | null = null;
  let efeitos: import('../exploracao/efeitosSonho').EfeitosSonho | null = null;
  let clima: import('../exploracao/climaSonho').ClimaSonho | null = null;
  const timers: number[] = [];
  const depois = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !saiu && fn(), ms));

  const caixa = new CaixaFala(el);
  const controles = new Controles({
    raiz: el,
    toque,
    rotuloInteragir: T.interagir,
    rotuloPausa: T.pausa,
    aoInteragir: () => interagir(),
    aoPausar: () => alternarPausa(),
  });

  const atualizarContador = () => {
    contador.textContent = fmt(T.contador, p?.genero ?? 'm', { n: getEstado().sonho.ouvidas.length, total: TOTAL });
  };
  atualizarContador();

  /* ----------------------------- interação ----------------------------- */

  function interagir() {
    if (!motor || pausado || emClimax || emCaminhada) return;
    if (caixa.aberta) return caixa.avancar();
    const id = motor.proximo();
    const voz = id ? VOZES[id] : null;
    const estatua = MAPA.estatuas.find((e) => e.id === id);
    if (!id || !voz || !estatua) return;
    audio.sfx('statue-awaken');
    efeitos?.acender(id);
    const jaTinhaTodas = getEstado().sonho.ouvidas.length === TOTAL;
    ouvirVoz(id);
    atualizarContador();
    const ultimaVoz = !jaTinhaTodas && getEstado().sonho.ouvidas.length === TOTAL;
    motor.bloquear(true);
    controles.mostrarInteracao(false);
    caixa.mostrar({
      titulo: voz.titulo,
      texto: voz.mensagem,
      cor: estatua.cor,
      aoFechar: () => {
        // Fechou a fala da 7ª voz: o herói vai sozinho até o altar.
        if (ultimaVoz) return void caminharAteOAltar(1000);
        motor?.bloquear(false);
        controles.mostrarInteracao(motor?.proximo() !== null);
      },
    });
  }

  /** Clique/toque fora da caixa também avança a fala (mas não move o herói). */
  el.addEventListener('pointerup', (e) => {
    if (caixa.aberta && !(e.target as HTMLElement).closest('button')) caixa.avancar();
  });

  function aoProximidade(id: string | null) {
    for (const e of MAPA.estatuas) efeitos?.perto(e.id, e.id === id);
    if (id) audio.sfx('statue-glow', { ganho: 0.8 });
    controles.mostrarInteracao(id !== null && !caixa.aberta && !emClimax && !emCaminhada);
    if (id !== null && !caixa.aberta && !emClimax && !emCaminhada) void dica('interagir');
  }

  /** Antes das sete vozes, pisar no altar não faz nada. Com as sete, o clímax começa. */
  function aoEntrarGatilho(id: string) {
    if (id !== 'altar' || emClimax || emCaminhada || caixa.aberta) return;
    if (getEstado().sonho.ouvidas.length === TOTAL) void climax();
  }

  /* ----------------------------- caminhada até o altar ----------------------------- */

  /**
   * Depois da 7ª voz (ou ao recarregar com as sete ouvidas): os controles somem, o altar brilha e o herói
   * anda sozinho, pelo caminho andável, até o centro do altar; lá vira para baixo e o clímax começa.
   */
  async function caminharAteOAltar(pausaMs: number) {
    if (!motor || emCaminhada || emClimax) return;
    emCaminhada = true;
    const m = motor;
    m.bloquear(true);
    controles.habilitar(false);
    controles.mostrarInteracao(false);
    el.classList.add('controles-ocultos');
    registrar('caminhada', { ...m.posicao() });
    await esperar(pausaMs);
    if (saiu) return;
    efeitos?.altarPronto();
    audio.sfx('statue-glow');
    await esperar(600);
    if (saiu) return;
    const altar = MAPA.pontos!.altar;
    const chegou = await m.caminharAte(altar.x, altar.y);
    if (saiu) return;
    if (!chegou) m.teleportar(altar.x, altar.y);
    m.virar('baixo');
    registrar('altar', { ...m.posicao(), chegou });
    emCaminhada = false;
    void climax();
  }

  /* ----------------------------- tremores ----------------------------- */

  function agendarTremor() {
    const ms = TREMOR_MIN + Math.random() * (TREMOR_MAX - TREMOR_MIN);
    depois(ms, () => {
      tremor();
      agendarTremor();
    });
  }

  /** Tremor leve: câmera (se ligado nas Opções), som grave, estátuas tremulam e poeira dourada cai. */
  function tremor(forcar = false) {
    if (!motor) return false;
    if (!forcar && (caixa.aberta || emCaminhada || emClimax || pausado)) return false;
    tremoresFeitos++;
    ultimoTremorCamera = tremoresLigados();
    if (ultimoTremorCamera) motor.tremer(400 + Math.random() * 400, 0.002 + Math.random() * 0.002);
    audio.sfx('tremor', { ganho: 0.9 });
    efeitos?.tremular();
    clima?.derrubarPoeira();
    return true;
  }

  /* ----------------------------- pausa ----------------------------- */

  function alternarPausa() {
    if (emClimax || !motor) return;
    // Esc com Opções aberto fecha só o Opções.
    if (document.querySelector('.modal-fundo:not(.saindo):not(.pausa-fundo)')) return;
    if (pausado) return fecharPausa();
    if (caixa.aberta) return caixa.fechar();
    pausado = true;
    motor.pausar(true);
    controles.habilitar(false);
    audio.sfx('ui-click');
    const continuar = botao(T.continuar, () => fecharPausa(), { classe: 'btn-principal' });
    menuPausa = h('div', { class: 'modal-fundo pausa-fundo' },
      h('div', { class: 'modal pausa', role: 'dialog', 'aria-modal': 'true', 'aria-label': T.pausa },
        h('h2', { class: 'modal-titulo' }, T.pausa),
        h('div', { class: 'pausa-botoes' },
          continuar,
          botao(T.opcoes, () => abrirOpcoes()),
          botao(textos.mapa.destravar, () => { fecharPausa(); void destravar('destravado pelo jogador', false); }, { classe: 'btn-destravar', som: 'ui-back' }),
          botao(T.voltarMenu, () => {
            fecharPausa(false);
            void irPara('menu');
          }, { som: 'ui-back' }),
        ),
      ),
    );
    el.append(menuPausa);
    continuar.focus({ preventScroll: true });
  }

  function fecharPausa(retomar = true) {
    if (!pausado) return;
    pausado = false;
    menuPausa?.remove();
    menuPausa = null;
    if (retomar) {
      motor?.pausar(false);
      controles.habilitar(true);
    }
  }

  /* ----------------------------- vigia (herói fora da área) ----------------------------- */

  /** Leva o herói ao ponto andável mais próximo, com fade rápido, e devolve o controle. */
  async function destravar(motivo: string, registrar = true) {
    if (!motor || emClimax || emCaminhada) return;
    const m = motor;
    const de = m.posicao();
    const alvo = m.pontoSeguro();
    m.pararMovimento();
    await m.piscar(() => m.teleportar(alvo.x, alvo.y));
    m.seguirCamera();
    if (!caixa.aberta) { m.bloquear(false); controles.habilitar(true); }
    if (registrar) registrarErro(new Error(`Herói ${motivo} no sonho (${Math.round(de.x)}, ${Math.round(de.y)})`), { mensagem: 'Vigia do mapa' });
  }
  let foraDesde = 0;
  function vigiar() {
    if (!motor || saiu || pausado || emClimax || emCaminhada || caixa.aberta || document.querySelector('.dica-tutorial') || motor.travado()) { foraDesde = 0; return; }
    if (!motor.foraDaArea()) { foraDesde = 0; return; }
    if (!foraDesde) foraDesde = performance.now();
    else if (performance.now() - foraDesde >= 1000) { foraDesde = 0; void destravar('fora da área'); }
  }

  /* ----------------------------- clímax ----------------------------- */

  async function climax() {
    if (!motor || !efeitos || emClimax) return;
    emClimax = true;
    registrar('climax');
    const m = motor;
    const fx = efeitos;
    controles.habilitar(false);
    controles.mostrarInteracao(false);
    m.bloquear(true);
    el.classList.add('em-climax');
    if (musica) audio.pararMusica(2500);
    else audio.pararAmbiente(2500);

    let pulou = false;
    let fimDado = false;
    const t0 = performance.now();
    const pular = () => {
      if (performance.now() - t0 < 2000 || pulou) return;
      pulou = true;
      void trovao();
    };
    depois(2000, () => pularClimax.classList.add('visivel'));
    el.addEventListener('pointerup', pular);
    const tecla = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') pular(); };
    window.addEventListener('keydown', tecla);

    /** O estrondo interrompe a voz: tremor, clarão branco e fade para o preto. */
    async function trovao() {
      if (fimDado) return;
      fimDado = true;
      el.removeEventListener('pointerup', pular);
      window.removeEventListener('keydown', tecla);
      pularClimax.classList.remove('visivel');
      audio.sfx('thunder');
      m.tremer(700, 0.012);
      clarao.classList.add('branco');
      await esperar(650);
      if (saiu) return;
      caixa.fechar();
      clarao.classList.add('preto');
      await esperar(1300);
      if (saiu) return;
      concluirSonho();
      void irPara('despertar', undefined, { som: false, duracao: 0 });
    }

    // 1. O herói para no centro do altar, virado para baixo.
    const altar = MAPA.pontos?.altar ?? { x: m.posicao().x, y: m.posicao().y };
    if (Math.hypot(m.posicao().x - altar.x, m.posicao().y - altar.y) > 3) await m.andarAte(altar.x, altar.y, 700);
    m.virar('baixo');
    if (pulou || saiu) return;
    // 2. As sete estátuas acendem ao mesmo tempo.
    fx.maximo();
    await esperar(500);
    if (pulou || saiu) return;
    // 3–4. Os feixes convergem no herói; acorde coral; zoom lento.
    fx.iniciarFeixes(1600);
    registrar('feixes', { n: fx.feixesAtivos });
    audio.sfx('divine-chord');
    m.zoomPara(1.7, 5000);
    await esperar(1700);
    if (pulou || saiu) return;
    // 5. "O escolhido…", mais devagar.
    caixa.mostrar({ texto: T.escolhido, cor: '#ffd25a', velocidade: 7, interativa: false });
    registrar('escolhido');
    await esperar(3200);
    if (pulou || saiu) return;
    // 6. Antes de a frase continuar: o trovão.
    void trovao();
  }

  /* ----------------------------- montagem ----------------------------- */

  function ganchosDeTeste() {
    if (!parametros().has('test')) return;
    (window as unknown as { __fdg: unknown }).__fdg = {
      /** Id de estátua, 'altar' ou "x,y" (pixels do mapa). */
      teleport(id: string) {
        if (!motor) return false;
        if (id === 'altar') {
          const a = MAPA.pontos!.altar;
          motor.teleportar(a.x, a.y + 30, 'cima');
          return true;
        }
        const xy = /^(\d+),(\d+)$/.exec(id);
        if (xy) {
          motor.teleportar(Number(xy[1]), Number(xy[2]), 'cima');
          return true;
        }
        const i = MAPA.interacoes.find((x) => x.id === id);
        if (!i) return false;
        motor.teleportar(i.x, i.y, 'cima');
        return true;
      },
      interact: () => interagir(),
      fecharFala: () => caixa.aberta && caixa.fechar(),
      /** Anda (pelo caminho andável, na velocidade normal) até "x,y". Resolve true ao chegar. */
      walkTo: async (xy: string) => {
        const [x, y] = xy.split(',').map(Number);
        return motor ? motor.caminharAte(x, y) : false;
      },
      /** Força um tremor agora (ignora o sorteio de tempo). */
      tremor: () => ({ ok: tremor(true), cameraTremendo: motor?.cena.cameras.main.shakeEffect.isRunning ?? false }),
      /** Desce um degrau da neblina, como se o FPS tivesse caído. */
      reduzirClima: () => clima?.reduzir(),
      state: () => ({
        pronto: motor !== null,
        heroi: motor?.posicao() ?? null,
        nitidez: motor?.nitidez() ?? null,
        proximo: motor?.proximo() ?? null,
        ouvidas: [...getEstado().sonho.ouvidas],
        concluido: getEstado().sonho.concluido,
        falaAberta: caixa.aberta,
        climax: emClimax,
        feixes: efeitos?.feixesAtivos ?? 0,
        pausado,
        caminhando: emCaminhada,
        atrasDe: motor?.atrasDe() ?? null,
        sprite: spriteUsado,
        tremores: tremoresFeitos,
        tremorCamera: ultimoTremorCamera,
        cameraTremendo: motor ? (motor.cena.cameras.main.shakeEffect.isRunning) : false,
        neblina: clima ? { camadas: clima.camadasVisiveis, nivel: clima.nivel } : null,
        fps: motor ? Math.round(motor.cena.game.loop.actualFps) : 0,
      }),
    };
  }

  async function montar() {
    // O mapa do sonho e o herói em memória antes de o Phaser começar (com a barra, se precisar baixar).
    await garantirEtapa('sonho', el);
    if (saiu) return;
    void audio.carregarEfeitos(SFX_SONHO);
    const raca = p?.raca ?? 'arake';
    const genero = p?.genero ?? 'm';
    const [{ criarMotor, EfeitosSonho, ClimaSonho }, temSprite, faixa] = await Promise.all([
      importar(() => import('../exploracao/pacote')),
      existeAsset(ASSETS.spriteChibi(raca, genero), 'image'),
      musicaDoSonho(),
    ]);
    if (saiu) return;
    musica = faixa;
    spriteUsado = temSprite ? ASSETS.spriteChibi(raca, genero) : 'provisorio';
    const debug = parametros().has('debug');
    const m = await criarMotor({
      container: palco,
      mapa: MAPA,
      blocos: blocosDoChao(MAPA).map((b) => ({ ...b, url: src(b.imagem) })),
      heroi: { raca, genero, spriteUrl: temSprite ? urlAsset(ASSETS.spriteChibi(raca, genero)) : null },
      entrada: () => controles.vetor(),
      debugPermitido: import.meta.env.DEV || debug,
      debugInicial: debug,
      aoProximidade,
      aoEntrarGatilho,
      aoPasso: () => audio.sfx('step-marble', { taxa: 0.85 + Math.random() * 0.3, ganho: 0.55 }),
      aoCriar: (mm) => {
        efeitos = new EfeitosSonho(mm.cena, mm.heroi, MAPA.estatuas, MAPA.pontos!.altar);
        clima = new ClimaSonho(mm.cena, {
          largura: MAPA.largura,
          altura: MAPA.altura,
          centro: { x: 627, y: 571, rx: 592, ry: 452 },
          claros: [{ x0: 535, y0: 990, x1: 720, y1: MAPA.altura }],
          economico: toque,
          vigiarFps: !parametros().has('test'),
        });
        // Ao retomar um save, as estátuas já ouvidas continuam acesas.
        for (const id of getEstado().sonho.ouvidas) efeitos.acender(id);
        if (getEstado().sonho.ouvidas.length === TOTAL) efeitos.altarPronto();
      },
    });
    if (saiu) return m.destruir();
    motor = m;
    el.classList.add('pronto');
    if (musica) audio.tocarMusica(musica, 2000);
    else audio.tocarAmbiente(2000);
    depois(6000, () => dicaSonho.classList.add('some'));
    timers.push(window.setInterval(vigiar, 1000));
    desfazerPausador = definirPausador((sim) => {
      if (!motor || pausado) return;
      motor.pausar(sim);
      controles.habilitar(!sim);
    });
    void dica('andar').then(() => dica('menu'));
    ganchosDeTeste();
    agendarTremor();
    // Recarregou com as sete vozes e o sonho não terminou: o herói já vai sozinho até o altar.
    if (getEstado().sonho.ouvidas.length === TOTAL) void caminharAteOAltar(900);
  }

  return {
    el,
    aoEntrar() {
      montar().catch((erro) => {
        // Nunca o erro técnico na tela: pedaço que não veio já foi tratado no importar() (recarga ou
        // tela de erro); o resto vai para o registro e o jogador vê a tela amigável.
        if (!ehErroDeModulo(erro)) { registrarErro(erro, { mensagem: 'O sonho não carregou' }); mostrarTelaDeErro(); }
      });
    },
    aoSair() {
      saiu = true;
      timers.forEach(clearTimeout);
      timers.forEach(clearInterval);
      desfazerPausador();
      controles.destruir();
      caixa.destruir();
      menuPausa?.remove();
      efeitos?.destruir();
      clima?.destruir();
      motor?.destruir();
      motor = null;
      audio.pararAmbiente(800);
      if (musica) audio.pararMusica(800);
      delete (window as unknown as { __fdg?: unknown }).__fdg;
    },
  };
}
