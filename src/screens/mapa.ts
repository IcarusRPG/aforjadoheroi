import { terminarParte } from './fimCapitulo';
import CONVERSAS from '../data/conversas.json';
import LIVROS from '../data/livros.json';
import MISSOES from '../data/missoes.json';
import { ASSETS, SFX_CAPITULO, SFX_FASE4, SFX_SONHO, existeAsset, src, urlAsset } from '../core/assets';
import { audio } from '../core/audio';
import { ehErroDeModulo, importar, mostrarTelaDeErro } from '../core/carregar';
import { registrarErro } from '../core/erros';
import { anelNoChao, criarBalao, destacarItem, texturasMarcas, type Balao, type Destaque, type TipoBalao } from '../exploracao/marcas';
import { animacoesReduzidas, atualizarCampanha, getEstado, marcarFlag } from '../core/estado';
import { estadoProgresso, registrarGanchos } from '../core/ganchos';
import {
  aoMudarAtraso, contador, definirMissao, nomeAtraso, pvAtual, somarAtraso, somarContador, verificarCompendio,
} from '../core/progresso';
import { irPara, type Tela } from '../core/telas';
import { ehToque, textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';
import { Controles } from '../exploracao/controles';
import type { Motor } from '../exploracao/motor';
import { blocosDoChao, type DadosMapa, type Direcao } from '../exploracao/tipos';
import { atende, type Condicao, type Efeitos } from '../narrativa/capitulo';
import { aplicarEfeitos, criarPalco, tocarMusicaDaCena, type Palco } from '../narrativa/palco';
import { abrirMenuPausa } from './pausa';
import { abrirAjudaFullmun } from './tutorial';
import { definirPausador, dica as dicaTutorial } from '../core/tutorial';
import { mostrarCarregando } from '../core/carregando';
import { aplicarTravaHorizontal } from '../core/telaCheia';
import { verificarCaderno } from '../core/caderno';
import { etapaDoCapitulo, garantirEtapa, itensDoMapa } from '../core/etapas';
import NPCS from '../data/npcs.json';
import OBJETOS from '../data/objetos.json';
import { montarMapa, type ObjetoMontado, type TipoObjeto } from '../exploracao/montagem';
const TIPOS_OBJETOS = OBJETOS as unknown as Record<string, TipoObjeto>;

/**
 * Exploração de um mapa da história (Füllmun, salão do templo, biblioteca): o motor do sonho com
 * moradores parados (respiração leve, marcadores ! … ?), itens no chão, seguidores pelo rastro do herói,
 * HUD (relógio do atraso ou contador), gatilhos de cena e as conversas no palco por cima do mapa.
 * Tudo vem de src/data/mapas/<id>.json e src/data/conversas.json.
 */

interface NpcMapa { id: string; x: number; y: number; direcao?: Direcao; requer?: Condicao }
interface ObjetoMapa {
  id: string;
  /** Ícone (public/assets/img/itens/<item>.png). */
  item: string;
  x: number;
  y: number;
  /** Onde o herói fica para interagir (se o ícone estiver num telhado, por exemplo). */
  interacao?: { x: number; y: number };
  requer?: Condicao;
  /** Cena ao interagir (ou efeitos diretos em `coletar`). */
  cena?: string;
  coletar?: Efeitos;
  /** "esfregar" (manchas, poeira, altar): 1 s de animação; "ler" (livros). */
  acao?: 'esfregar' | 'ler' | 'polir';
  livro?: string;
  /** Contador somado ao terminar a ação. */
  contador?: string;
  /** Some depois de usado (padrão: sim, menos livros). */
  fica?: boolean;
  /** Ponto de interação sem ícone no chão (alçapão, altar). */
  semIcone?: boolean;
  marcador?: { requer?: Condicao; tipo: string }[];
  /** Item sobre um objeto (telhado, cerca): fica numa camada acima dele (ex.: "padaria"). */
  sobre?: string;
  /** Anel de luz no chão quando o objeto tem marcador (o alçapão): centro e largura em px do mapa. */
  anel?: { x: number; y: number; largura: number };
}
interface GatilhoCena { id: string; pontos: [number, number][]; requer?: Condicao; cena: string; empurra?: { x: number; y: number } }
export interface DadosMapaJogo extends DadosMapa {
  musica?: string;
  alturasDeTela?: number;
  hud?: 'relogio' | { contador: string; rotulo: string; total?: number | { requer?: Condicao; n: number }[] };
  npcs?: NpcMapa[];
  objetos?: ObjetoMapa[];
  gatilhosCena?: GatilhoCena[];
  seguidores?: { id: string; requer?: Condicao }[];
  dicas?: { requer?: Condicao; texto: string }[];
  /** Cenas disparadas quando um contador chega a um valor (estantes limpas…). */
  aoContador?: { contador: string; valor: number; cena: string; requer?: Condicao }[];
  /** Cena ao entrar no mapa (uma vez, se a condição valer). */
  aoEntrar?: { cena: string; requer?: Condicao; umaVez?: string }[];
  /** Falas curtas sobre um seguidor (balões), sem parar o jogo. */
  baloes?: { quem: string; texto: string; requer?: Condicao; umaVez: string; contador?: { id: string; valor: number } }[];
  /** Espirro de vez em quando (biblioteca). */
  espirros?: boolean;
  /** Onde o herói fica ao voltar de uma cena (id da cena aberta no mapa → ponto). */
  retornos?: Record<string, { x: number; y: number; direcao?: Direcao }>;
  /**
   * Destinos marcados no mapa (ex.: a porta da casa da Aylin enquanto ela segue o herói): um "!" que
   * pula sobre o ponto e, quando ele sai da tela, uma seta na borda apontando para ele.
   */
  destinos?: Destino[];
  /** Mapas de chão + objetos (Fase 5): o atlas dos objetos (sem extensão), o mapa antigo (fantasma do editor). */
  objetosAtlas?: string;
  fantasma?: string;
  colisoesExtras?: DadosMapa['colisoes'];
  /** Versão das coordenadas (Füllmun 2 = mapa de 2400 px); vai junto da posição salva. */
  versao?: number;
}
export interface Destino { id: string; x: number; y: number; cor?: 'vermelho' | 'dourado'; requer?: Condicao }
type Regra = { requer?: Condicao; cena?: string; tipo?: string | null };
const CONV = CONVERSAS as Record<string, { conversas: Regra[]; marcadores?: Regra[] }>;
const MAPAS = import.meta.glob<DadosMapaJogo>('../data/mapas/*.json', { eager: true, import: 'default' });
/** O mapa pronto para o jogo (mapas de chão + objetos são montados: colisões pelos pés, itens, gatilhos). */
export const mapaPorId = (id: string): DadosMapaJogo & { cenario: ObjetoMontado[] } => {
  const m = Object.values(MAPAS).find((x) => x.id === id);
  if (!m) throw new Error(`Mapa desconhecido: ${id}`);
  return montarMapa(m as unknown as Record<string, unknown>, TIPOS_OBJETOS) as unknown as DadosMapaJogo & { cenario: ObjetoMontado[] };
};

export interface ParamsMapa { mapa?: string; x?: number; y?: number; cena?: string }

export function telaMapa(params?: unknown): Tela {
  const prm = (params ?? {}) as ParamsMapa;
  const local = getEstado().campanha.local;
  const idMapa = prm.mapa ?? local.mapa ?? 'fullmun';
  // Cópia: as listas de interação e gatilhos são remontadas a cada mudança.
  const base = mapaPorId(idMapa);
  const mapa: DadosMapaJogo = { ...base, interacoes: [], gatilhos: [] };
  const p = getEstado().personagem!;
  const toque = ehToque();
  /** Tamanho dos personagens neste mapa (o motor usa o mesmo valor para o herói, os pés e a velocidade). */
  const escala = base.escalaPersonagens ?? 1;
  /** Raio das interações: cresce com a raiz da escala (o herói maior alcança um pouco mais longe). */
  const alcance = Math.sqrt(escala);
  const setaDestino = h('div', { class: 'seta-destino', hidden: true, 'aria-hidden': 'true' },
    h('span', { class: 'seta-destino-ponta' }), h('span', { class: 'seta-destino-exclamacao' }, '!'));

  const palcoEl = h('div', { class: 'mapa-palco' });
  const hud = h('div', { class: 'mapa-hud', 'aria-live': 'polite' });
  const dica = h('p', { class: 'mapa-dica', hidden: true });
  /** Indicadores na borda da tela para quem tem ! ou ? (ou o alçapão) fora da área visível; no máximo 3. */
  const indicadores = [0, 1, 2].map(() => h('div', { class: 'indicador-borda', hidden: true, 'aria-hidden': 'true' },
    h('span', { class: 'indicador-borda-ponta' }), h('span', { class: 'indicador-borda-balao' })));
  const el = h('div', { class: `tela-mapa mapa-${idMapa}` }, palcoEl, hud, dica, setaDestino, ...indicadores);

  let saiu = false;
  let motor: Motor | null = null;
  let palco: Palco | null = null;
  let fecharPausa: (() => void) | null = null;
  let ocupado = false;
  let phaser: typeof import('phaser') | null = null;
  const sprites = new Map<string, { s: import('phaser').GameObjects.Sprite; marcador: Balao | null; npc: NpcMapa }>();
  const objetosSprites = new Map<string, Destaque>();
  const objetosMarcadores = new Map<string, { balao: Balao; anel: { destruir(): void } | null }>();
  /** Altura de um balão de missão em px do mapa: 45% do herói, nunca menos de 28 px na tela. */
  const alturaBalao = (fator = 1) => Math.max(0.45 * 45 * escala, 28 / Math.max(0.05, motor?.pxTela() ?? 1)) * fator;
  const alturaHeroi = 45 * escala;
  const seguidores = new Map<string, { s: import('phaser').GameObjects.Sprite; dir: Direcao }>();
  const rastro: { x: number; y: number }[] = [];
  const gatilhosDentro = new Set<string>();
  const timers: number[] = [];
  let vigia = 0;
  let desfazerPausador = () => {};

  const controles = new Controles({
    raiz: el, toque, rotuloInteragir: textos.sonho.interagir, rotuloPausa: textos.sonho.pausa,
    aoInteragir: () => interagir(), aoPausar: () => abrirPausa(),
  });

  /* ------------------------------------------------------------ estado e posição */

  function salvarPosicao() {
    if (!motor) return;
    const { x, y, direcao } = motor.posicao();
    atualizarCampanha({ local: { tela: 'mapa', mapa: idMapa, x: Math.round(x), y: Math.round(y), direcao, versaoMapa: base.versao ?? 1 } });
  }

  const coletado = (id: string) => getEstado().campanha.coletados.includes(`${idMapa}:${id}`);
  const marcarColetado = (id: string) => {
    if (!coletado(id)) atualizarCampanha({ coletados: [...getEstado().campanha.coletados, `${idMapa}:${id}`] });
  };
  const npcsVisiveis = () => (mapa.npcs ?? []).filter((n) => atende(n.requer));
  const objetosVisiveis = () => (mapa.objetos ?? []).filter((o) => atende(o.requer) && (o.fica || !coletado(o.id)));

  function conversaDe(id: string): string | null {
    return CONV[id]?.conversas.find((r) => atende(r.requer))?.cena ?? null;
  }
  function marcadorDe(id: string): string | null {
    return CONV[id]?.marcadores?.find((r) => atende(r.requer))?.tipo ?? null;
  }

  /** Remonta interações, marcadores, itens, seguidores, gatilhos, dica e HUD a partir do save. */
  function atualizar() {
    if (!motor || !phaser) return;
    const inter: DadosMapa['interacoes'] = [];
    for (const n of mapa.npcs ?? []) {
      const vis = atende(n.requer);
      const reg = sprites.get(n.id);
      if (reg) {
        reg.s.setVisible(vis);
        const m = vis ? marcadorDe(n.id) : null;
        if (m && !reg.marcador) reg.marcador = criarBalao(motor.cena, n.x, n.y - 50 * escala, m as TipoBalao, alturaBalao(), { reduzidas: animacoesReduzidas() });
        reg.marcador?.definirTipo(m as TipoBalao | null);
      }
      if (vis) inter.push({ id: `npc:${n.id}`, x: n.x, y: n.y + 8 * escala, raio: 58 * alcance });
    }
    for (const [id, d] of objetosSprites) if (!objetosVisiveis().some((o) => o.id === id)) { d.destruir(); objetosSprites.delete(id); }
    for (const o of objetosVisiveis()) {
      inter.push({ id: `obj:${o.id}`, x: o.interacao?.x ?? o.x, y: o.interacao?.y ?? o.y, raio: 52 * alcance });
      if (!o.semIcone && !objetosSprites.has(o.id)) objetosSprites.set(o.id, criarObjeto(o));
      // Livro já lido: perde o brilho e escurece.
      if (o.acao === 'ler' && o.livro && getEstado().campanha.usadas.includes(`ef:livro-${o.livro}`)) objetosSprites.get(o.id)?.escurecer();
      // Marcador de objeto (o alçapão): balão 1,5× maior, pulando, e um anel de luz no chão.
      const marca = (o.marcador?.find((r) => atende(r.requer))?.tipo ?? null) as TipoBalao | null;
      let m = objetosMarcadores.get(o.id);
      if (marca && !m) {
        texturasMarcas(motor.cena);
        const a = o.anel;
        const balao = a
          ? criarBalao(motor.cena, a.x, a.y - a.largura * 0.22, marca, alturaBalao(1.5), { reduzidas: animacoesReduzidas() })
          : criarBalao(motor.cena, o.x, o.y - 36 * escala, marca, alturaBalao(1.5), { reduzidas: animacoesReduzidas() });
        const anel = a ? anelNoChao(motor.cena, a.x, a.y, a.largura, animacoesReduzidas()) : null;
        m = { balao, anel };
        objetosMarcadores.set(o.id, m);
      }
      if (m && !marca) { m.balao.destruir(); m.anel?.destruir(); objetosMarcadores.delete(o.id); }
    }
    for (const [id, m] of objetosMarcadores) if (!objetosVisiveis().some((o) => o.id === id)) { m.balao.destruir(); m.anel?.destruir(); objetosMarcadores.delete(id); }
    mapa.interacoes = inter;
    mapa.gatilhos = (mapa.gatilhosCena ?? []).filter((g) => atende(g.requer)).map((g) => ({ id: g.id, pontos: g.pontos }));
    for (const s of mapa.seguidores ?? []) {
      const ativo = atende(s.requer);
      if (ativo && !seguidores.has(s.id)) criarSeguidor(s.id);
      if (!ativo && seguidores.has(s.id)) { seguidores.get(s.id)!.s.destroy(); seguidores.delete(s.id); motor.removerAtor(`seguidor:${s.id}`); }
    }
    atualizarDestino();
    const d = (mapa.dicas ?? []).find((x) => atende(x.requer));
    dica.hidden = !d;
    dica.textContent = d?.texto ?? '';
    desenharHud();
  }

  /* ------------------------------------------------------------ HUD */

  /** Missão de coleta aceita (Roupas, Repolhos): rótulo, quantos itens já estão na bolsa e o total. */
  function coletaAtual(): { rotulo: string; n: number; total: number; icone: string } | null {
    const c = getEstado().campanha;
    for (const [id, m] of Object.entries(MISSOES as Record<string, { coleta?: { rotulo: string; itens: string[]; total: number; icone: string } }>)) {
      if (!m.coleta || c.missoes[id] !== 'aceita') continue;
      const n = m.coleta.itens.reduce((t, it) => t + (c.inventario[it] ?? 0), 0);
      return { rotulo: m.coleta.rotulo, n: Math.min(n, m.coleta.total), total: m.coleta.total, icone: m.coleta.icone };
    }
    return null;
  }

  function desenharHud(animar = false) {
    if (mapa.hud === 'relogio') {
      const marcas = getEstado().campanha.atraso;
      const ponteiro = -150 + marcas * 60;
      hud.className = `mapa-hud hud-relogio${animar ? ' piscando' : ''}`;
      hud.innerHTML = `
        <svg class="relogio-sol" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="28" fill="#2a2016" stroke="#d6a94a" stroke-width="3"/>
          ${[0, 1, 2, 3, 4].map((k) => { const a = ((-150 + k * 60) * Math.PI) / 180; return `<line x1="${32 + Math.cos(a) * 20}" y1="${32 + Math.sin(a) * 20}" x2="${32 + Math.cos(a) * 26}" y2="${32 + Math.sin(a) * 26}" stroke="#f2d48a" stroke-width="2"/>`; }).join('')}
          <g class="relogio-ponteiro" style="transform: rotate(${ponteiro}deg)"><line x1="32" y1="32" x2="54" y2="32" stroke="#ffd25a" stroke-width="4" stroke-linecap="round"/></g>
          <circle cx="32" cy="32" r="4" fill="#ffd25a"/>
        </svg>`;
      hud.append(
        h('span', { class: 'relogio-bolinhas', 'aria-label': `${marcas} de 4` }, ...[0, 1, 2, 3].map((k) => h('span', { class: k < marcas ? 'cheia' : 'vazia' }, k < marcas ? '●' : '○'))),
        h('span', { class: 'relogio-estado' }, nomeAtraso(marcas)),
      );
      hud.dataset.marcas = String(marcas);
      const coleta = coletaAtual();
      if (coleta) {
        hud.append(h('span', { class: 'hud-coleta' },
          h('img', { class: 'hud-coleta-icone', src: src(ASSETS.item(coleta.icone)), alt: '' }),
          `${coleta.rotulo} ${coleta.n}/${coleta.total}`));
      }
    } else if (mapa.hud) {
      const cfg = mapa.hud;
      const total = typeof cfg.total === 'number' ? cfg.total : (cfg.total ?? []).find((t) => atende(t.requer))?.n ?? 0;
      hud.className = 'mapa-hud hud-contador';
      hud.textContent = total ? `${cfg.rotulo} ${Math.min(total, contador(cfg.contador))}/${total}` : '';
      hud.hidden = !total;
    }
  }

  /* ------------------------------------------------------------ sprites */

  const quadro = (dir: Direcao) => ['baixo', 'esquerda', 'direita', 'cima'].indexOf(dir) * 4;

  function animsDe(chave: string) {
    const cena = motor!.cena;
    ['baixo', 'esquerda', 'direita', 'cima'].forEach((d, linha) => {
      const k = `${chave}-${d}`;
      if (!cena.anims.exists(k)) cena.anims.create({ key: k, frames: cena.anims.generateFrameNumbers(chave, { start: linha * 4, end: linha * 4 + 3 }), frameRate: 7, repeat: -1 });
    });
  }

  function criarNpc(n: NpcMapa) {
    const cena = motor!.cena;
    const chave = `npc-${n.id}`;
    nitido(chave);
    const s = cena.add.sprite(n.x, n.y, chave, quadro(n.direcao ?? 'baixo')).setOrigin(0.5, 46 / 48).setDepth(n.y).setScale(escala);
    // Respiração leve por código.
    cena.tweens.add({ targets: s, scaleY: escala * 1.03, duration: 1400 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // Marcadores (! … ?): balão criado na primeira vez que o morador tem um (atualizar), na camada mais alta.
    texturasMarcas(cena);
    s.setData('id', n.id);
    sprites.set(n.id, { s, marcador: null, npc: n });
    motor!.registrarAtor(`npc:${n.id}`, s);
  }

  /** Nos mapas com escala, os pixels dos personagens ficam nítidos (sem borrar ao ampliar). */
  function nitido(chave: string) {
    if (phaser && motor?.cena.textures.exists(chave)) motor.cena.textures.get(chave).setFilter(phaser.Textures.FilterMode.NEAREST);
  }

  /**
   * Item no mapa. Manchas e poeira (esfregar/polir) ficam no chão, como antes. Itens de missão e livros:
   * - tamanho pela altura do herói (itens com 64%, livros com 35%);
   * - nunca atrás de um objeto: a profundidade sobe até ficar na frente de tudo o que cobriria o item
   *   (e de `sobre`, se houver: a camisa no telhado da padaria);
   * - contorno claro, flutuação, brilho, faíscas e, com missão aceita, a seta dourada.
   */
  function criarObjeto(o: ObjetoMapa): Destaque {
    const cena = motor!.cena;
    const img = cena.add.image(o.x, o.y, `item-${o.item}`);
    if (o.acao === 'esfregar' || o.acao === 'polir') {
      const lado = (o.item === 'mancha' ? 40 : 30) * escala;
      img.setDisplaySize(lado, lado * (img.height / img.width)).setDepth(-60_000);
      return { img, escurecer() {}, destruir() { img.destroy(); } };
    }
    texturasMarcas(cena);
    const alvo = (o.acao === 'ler' ? 0.35 : 0.64) * alturaHeroi;
    const largura = Math.min(alvo * (img.width / img.height), alturaHeroi * 1.2);
    img.setDisplaySize(largura, largura * (img.height / img.width));
    let prof = o.y;
    if (o.sobre) {
      const alvoSobre = motor!.cenario?.sprites.filter((s) => s.o.id === o.sobre).sort((a, b) => Math.hypot(a.o.x - o.x, a.o.y - o.y) - Math.hypot(b.o.x - o.x, b.o.y - o.y))[0];
      if (alvoSobre) prof = Math.max(prof, alvoSobre.o.profundidade + 1);
    }
    prof = motor!.frenteDe(img.getBounds(), prof);
    img.setDepth(prof);
    // No editor, o item fica sozinho (sem contorno, brilho e faíscas) para ser arrastado.
    if (new URLSearchParams(location.search).has('editor')) return { img, escurecer() {}, destruir() { img.destroy(); } };
    return destacarItem(cena, img, { pxTela: motor!.pxTela(), reduzidas: animacoesReduzidas(), seta: !!o.requer?.missao });
  }

  function criarSeguidor(id: string) {
    const cena = motor!.cena;
    const chave = `npc-${id}`;
    animsDe(chave);
    const h0 = motor!.posicao();
    nitido(chave);
    const s = cena.add.sprite(h0.x, h0.y + 30 * escala, chave, quadro('cima')).setOrigin(0.5, 46 / 48).setDepth(h0.y + 30 * escala).setScale(escala);
    seguidores.set(id, { s, dir: 'cima' });
    // Quem segue o herói também ganha a silhueta quando fica coberto.
    motor!.registrarAtor(`seguidor:${id}`, s, { silhueta: true });
    rastro.length = 0;
  }

  /** Seguidores andam pelo rastro do herói, ~40 px atrás, sem bloquear. */
  function atualizarSeguidores() {
    if (!motor || !seguidores.size) return;
    const hpos = motor.posicao();
    const ult = rastro[rastro.length - 1];
    if (!ult || Math.hypot(hpos.x - ult.x, hpos.y - ult.y) > 3) rastro.push({ x: hpos.x, y: hpos.y });
    if (rastro.length > 200) rastro.shift();
    let k = 0;
    for (const [id, f] of seguidores) {
      // Ponto do rastro a ~40 px (por seguidor) do herói, medido ao longo do caminho.
      let dist = 0;
      let alvo = rastro[0] ?? hpos;
      const atras = 40 * escala * (k + 1);
      for (let i = rastro.length - 1; i > 0; i--) {
        dist += Math.hypot(rastro[i].x - rastro[i - 1].x, rastro[i].y - rastro[i - 1].y);
        if (dist >= atras) { alvo = rastro[i - 1]; break; }
      }
      const dx = alvo.x - f.s.x, dy = alvo.y - f.s.y;
      const d = Math.hypot(dx, dy);
      if (d > 1.5) {
        const passo = Math.min(d, 2.6 * escala);
        f.s.x += (dx / d) * passo;
        f.s.y += (dy / d) * passo;
        f.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : dy < 0 ? 'cima' : 'baixo';
        f.s.anims.play(`npc-${id}-${f.dir}`, true);
      } else {
        f.s.anims.stop();
        f.s.setFrame(quadro(f.dir));
      }
      f.s.setDepth(f.s.y);
      k++;
    }
  }

  /** Balão curto sobre um seguidor ou morador, sem parar o jogo. */
  function balao(quem: string, texto: string) {
    if (!motor) return;
    const alvo = seguidores.get(quem)?.s ?? sprites.get(quem)?.s;
    if (!alvo) return;
    const t = motor.cena.add.text(alvo.x, alvo.y - 56 * escala, texto, {
      fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#2a1a10', backgroundColor: '#f3eee5', padding: { x: 6, y: 4 },
      wordWrap: { width: 190 }, align: 'center',
    }).setOrigin(0.5, 1).setDepth(160_000);
    const seguir = () => t.setPosition(alvo.x, alvo.y - 56 * escala);
    motor.cena.events.on('update', seguir);
    window.setTimeout(() => { motor?.cena.events.off('update', seguir); t.destroy(); }, 3800);
    ultimoBalao = texto;
  }
  let ultimoBalao = '';

  function verificarBaloes() {
    for (const b of mapa.baloes ?? []) {
      if (getEstado().campanha.usadas.includes(`balao:${b.umaVez}`)) continue;
      if (b.contador && contador(b.contador.id) < b.contador.valor) continue;
      if (!atende(b.requer)) continue;
      atualizarCampanha({ usadas: [...getEstado().campanha.usadas, `balao:${b.umaVez}`] });
      balao(b.quem, b.texto);
    }
  }

  /* ------------------------------------------------------------ nome do morador */

  let rotuloNome: import('phaser').GameObjects.Text | null = null;
  /** Ao chegar perto de um morador, o nome dele aparece acima da cabeça (camada mais alta). */
  function mostrarNome(id: string | null) {
    rotuloNome?.destroy();
    rotuloNome = null;
    const npc = id?.startsWith('npc:') ? sprites.get(id.slice(4)) : undefined;
    if (!npc || !motor) return;
    const nome = (NPCS as Record<string, { nome?: string }>)[npc.npc.id]?.nome ?? npc.npc.id;
    rotuloNome = motor.cena.add.text(npc.s.x, npc.s.y - 48 * escala, nome, {
      fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#fff6dc', backgroundColor: 'rgba(20,14,8,0.78)', padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 1).setDepth(155_000);
  }

  /* ------------------------------------------------------------ destino (casa da Aylin) */

  let destino: { d: Destino; balao: Balao } | null = null;

  /** O destino que vale agora (o primeiro cuja condição é atendida), com o "!" que pula sobre ele. */
  function atualizarDestino() {
    if (!motor) return;
    const d = (mapa.destinos ?? []).find((x) => atende(x.requer)) ?? null;
    if (destino && destino.d.id === d?.id) return;
    if (destino) { destino.balao.destruir(); destino = null; }
    setaDestino.hidden = true;
    if (!d) return;
    texturasMarcas(motor.cena);
    // O "!" de destino: balão vermelho 1,5× maior que o das missões; pula e achata (Fase 4F), acima de tudo.
    const balao = criarBalao(motor.cena, d.x, d.y, d.cor === 'dourado' ? '!' : '!vermelho', alturaBalao(1.5), { reduzidas: animacoesReduzidas(), profundidade: 150_010 });
    destino = { d, balao };
  }

  /** Seta na borda da tela quando o destino está fora da área visível (move-se pela borda com o herói). */
  function atualizarSetaDestino() {
    if (!motor || !destino) { setaDestino.hidden = true; return; }
    const v = motor.cena.cameras.main.worldView;
    const { x, y } = destino.d;
    const dentro = x > v.x + 8 && x < v.right - 8 && y - 30 > v.y && y < v.bottom - 8;
    setaDestino.hidden = dentro || ocupado;
    if (dentro || ocupado) return;
    posicionarNaBorda(setaDestino, x, y - 20, 34);
  }

  /** Põe o elemento na borda da tela (com margem), na direção do ponto (x, y) do mapa, girando a ponta. */
  function posicionarNaBorda(alvo: HTMLElement, x: number, y: number, margem: number) {
    const v = motor!.cena.cameras.main.worldView;
    const w = el.clientWidth, hh = el.clientHeight;
    const sx = ((x - v.x) / v.width) * w, sy = ((y - v.y) / v.height) * hh;
    const cx = w / 2, cy = hh / 2;
    const ang = Math.atan2(sy - cy, sx - cx);
    const kx = Math.abs(Math.cos(ang)) > 1e-6 ? (cx - margem) / Math.abs(Math.cos(ang)) : Infinity;
    const ky = Math.abs(Math.sin(ang)) > 1e-6 ? (cy - margem) / Math.abs(Math.sin(ang)) : Infinity;
    const k = Math.min(kx, ky);
    const pos = `${Math.round(cx + Math.cos(ang) * k)},${Math.round(cy + Math.sin(ang) * k)},${Math.round((ang * 180) / Math.PI)}`;
    if (alvo.dataset.pos === pos) return;
    alvo.dataset.pos = pos;
    const [px, py, pa] = pos.split(',');
    alvo.style.left = `${px}px`;
    alvo.style.top = `${py}px`;
    alvo.style.setProperty('--ang', `${pa}deg`);
  }

  /**
   * Indicadores de borda: moradores com ! ou ? e objetos marcados (o alçapão) fora da área visível. Os três
   * mais perto do herói, cada um com o balão em miniatura e uma ponta apontando para ele.
   */
  let indicadoresAtuais: { id: string; tipo: string }[] = [];
  function atualizarIndicadores() {
    if (!motor) return;
    const v = motor.cena.cameras.main.worldView;
    const heroi = motor.posicao();
    const alvos: { id: string; tipo: string; x: number; y: number }[] = [];
    if (!ocupado) {
      for (const [id, r] of sprites) {
        const t = r.marcador?.corpo.visible ? r.marcador.tipo : null;
        if (t === '!' || t === '?') alvos.push({ id: `npc:${id}`, tipo: t, x: r.npc.x, y: r.npc.y - 30 * escala });
      }
      for (const [id, m] of objetosMarcadores) {
        const o = (mapa.objetos ?? []).find((x) => x.id === id);
        if (o && m.balao.corpo.visible) alvos.push({ id: `obj:${id}`, tipo: m.balao.tipo, x: o.anel?.x ?? o.x, y: o.anel?.y ?? o.y - 20 * escala });
      }
    }
    const fora = alvos
      .filter((a) => !(a.x > v.x + 8 && a.x < v.right - 8 && a.y > v.y + 8 && a.y < v.bottom - 8))
      .sort((a, b) => Math.hypot(a.x - heroi.x, a.y - heroi.y) - Math.hypot(b.x - heroi.x, b.y - heroi.y))
      .slice(0, 3);
    indicadores.forEach((ind, i) => {
      const a = fora[i];
      ind.hidden = !a;
      if (!a) return;
      ind.dataset.tipo = a.tipo === '?' ? 'interr' : 'excl';
      (ind.lastElementChild as HTMLElement).textContent = a.tipo === '?' ? '?' : '!';
      posicionarNaBorda(ind, a.x, a.y, 30);
    });
    indicadoresAtuais = fora.map((a) => ({ id: a.id, tipo: a.tipo }));
  }

  /* ------------------------------------------------------------ palco (conversas por cima do mapa) */

  function abrirCena(id: string) {
    if (!motor || saiu) return;
    salvarPosicao();
    cenaAberta = id;
    ocupado = true;
    motor.bloquear(true);
    controles.habilitar(false);
    controles.mostrarInteracao(false);
    mostrarNome(null);
    el.classList.add('com-palco');
    palco?.destruir();
    palcoEl.replaceChildren();
    palco = criarPalco({
      sobreMapa: true,
      aoBatalha: (d) => {
        marcarFlag('lutou');
        atualizarCampanha({ cenaAntesDaBatalha: d.cenaOrigem });
        salvarPosicao();
        void irPara('batalha', { batalha: d.batalha, vitoria: d.vitoria, derrota: d.derrota, retorno: 'mapa' });
      },
      aoFim: terminarParte,
      aoMapa: (m) => {
        // Mesmo mapa: o herói vai para o ponto antes de a conversa fechar, para quem passa a segui-lo
        // (a Aylin) já nascer ali, e não onde a conversa começou.
        if (m.mapa === idMapa) { if (m.x !== undefined) motor?.teleportar(m.x, m.y ?? 0, 'baixo'); fecharCena({ semRetorno: m.x !== undefined }); salvarPosicao(); return; }
        void irPara('mapa', { mapa: m.mapa, x: m.x, y: m.y });
      },
      aoVoltar: () => fecharCena(),
    });
    palcoEl.append(palco.el);
    void palco.entrar(id, 'falas');
  }

  /**
   * Volta de qualquer cena para o mapa: para caminhadas e tweens, põe o herói no ponto de retorno da
   * cena (JSON do mapa → retornos) ou no empurrão do gatilho, religa a câmera e o controle.
   */
  function fecharCena(o: { semRetorno?: boolean } = {}) {
    palco?.destruir();
    palco = null;
    palcoEl.replaceChildren();
    el.classList.remove('com-palco');
    ocupado = false;
    motor?.pararMovimento();
    motor?.bloquear(false);
    controles.habilitar(true);
    tocarMusicaDaCena(mapa.musica, 1200);
    const ret = !o.semRetorno && cenaAberta ? mapa.retornos?.[cenaAberta] : undefined;
    cenaAberta = null;
    if (ret) { motor?.teleportar(ret.x, ret.y, ret.direcao); empurrarPara = null; }
    if (empurrarPara) { motor?.teleportar(empurrarPara.x, empurrarPara.y); empurrarPara = null; }
    motor?.seguirCamera();
    atualizar();
    controles.mostrarInteracao(motor?.proximo() != null);
    salvarPosicao();
    verificarContadores();
    verificarBaloes();
    verificarCompendio();
    aoFicarLivre();
  }
  let empurrarPara: { x: number; y: number } | null = null;
  let cenaAberta: string | null = null;

  /* ------------------------------------------------------------ interação */

  function interagir(alvo?: string) {
    if (!motor || ocupado || fecharPausa) return;
    const id = alvo ?? motor.proximo();
    if (!id) return;
    if (id.startsWith('npc:')) {
      const npc = id.slice(4);
      const reg = sprites.get(npc);
      if (reg) {
        // O morador vira para o herói.
        const hp = motor.posicao();
        const dx = hp.x - reg.s.x, dy = hp.y - reg.s.y;
        reg.s.setFrame(quadro(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : dy < 0 ? 'cima' : 'baixo'));
      }
      const cena = conversaDe(npc);
      if (cena) abrirCena(cena);
      return;
    }
    if (id.startsWith('obj:')) void usarObjeto(id.slice(4));
  }

  async function usarObjeto(oid: string) {
    const o = (mapa.objetos ?? []).find((x) => x.id === oid);
    if (!o || !motor) return;
    if (o.acao === 'ler' && o.livro) return abrirLivro(o);
    if (o.acao === 'esfregar' || o.acao === 'polir') {
      ocupado = true;
      motor.bloquear(true);
      controles.mostrarInteracao(false);
      await esfregar(o.acao === 'polir' ? 'dourado' : o.item === 'poeira' ? 'poeira' : 'espuma');
      ocupado = false;
      if (saiu) return;
      motor.bloquear(false);
      marcarColetado(o.id);
      if (o.contador) somarContador(o.contador);
      aplicarEfeitos(o.coletar);
      atualizar();
      desenharHud();
      verificarContadores();
      verificarBaloes();
      if (o.cena) abrirCena(o.cena);
      return;
    }
    if (!o.fica) marcarColetado(o.id);
    if (o.coletar) {
      audio.sfx('pegar-item');
      aplicarEfeitos(o.coletar);
    }
    atualizar();
    if (o.cena) abrirCena(o.cena);
  }

  /** O herói fica parado 1 s esfregando (balanço por código e partículas). */
  async function esfregar(tipo: 'espuma' | 'poeira' | 'dourado') {
    if (!motor || !phaser) return;
    audio.sfx('esfregar');
    const heroi = motor.heroi;
    const cena = motor.cena;
    const x0 = heroi.x;
    const tw = cena.tweens.add({ targets: heroi, x: x0 + 2, duration: 90, yoyo: true, repeat: 5 });
    const cor = tipo === 'poeira' ? 0xcbb89a : tipo === 'dourado' ? 0xffd25a : 0xffffff;
    for (let i = 0; i < 12; i++) {
      const c = cena.add.circle(heroi.x + (Math.random() - 0.5) * 30, heroi.y - 4 - Math.random() * 10, 2 + Math.random() * 3, cor, 0.85).setDepth(heroi.y + 1);
      cena.tweens.add({ targets: c, y: c.y - 14 - Math.random() * 12, alpha: 0, duration: 700 + Math.random() * 300, delay: i * 50, onComplete: () => c.destroy() });
    }
    await esperar(1000);
    tw.stop();
    heroi.x = x0;
    if (tipo === 'dourado') {
      const brilho = cena.add.circle(heroi.x, heroi.y - 30, 30, 0xffd25a, 0.5).setDepth(heroi.y + 2).setBlendMode(phaser.BlendModes.ADD);
      cena.tweens.add({ targets: brilho, scale: 2.4, alpha: 0, duration: 700, onComplete: () => brilho.destroy() });
    }
  }

  function verificarContadores() {
    for (const r of mapa.aoContador ?? []) {
      const chave = `cont:${idMapa}:${r.contador}:${r.valor}`;
      if (getEstado().campanha.usadas.includes(chave)) continue;
      if (contador(r.contador) < r.valor || !atende(r.requer)) continue;
      atualizarCampanha({ usadas: [...getEstado().campanha.usadas, chave] });
      if (!ocupado) abrirCena(r.cena);
      return;
    }
  }

  /** Painel de livro: duas colunas no computador, uma no celular, em pergaminho. */
  function abrirLivro(o: ObjetoMapa) {
    // Textos em src/data/livros.json (revisados com o Livro do Jogador). Cada livro marca a flag dele,
    // que libera páginas e anotações no Caderno de estudos.
    const l = (LIVROS as unknown as Record<string, { titulo: string; paragrafos: string[]; flag?: string }>)[o.livro!];
    if (!l || !motor) return;
    ocupado = true;
    motor.bloquear(true);
    audio.sfx('compendio');
    const fechar = botao(textos.cenas.fechar, () => {
      painel.remove();
      ocupado = false;
      motor?.bloquear(false);
      // Cada livro conta uma vez (o da guerra também conta quando a Nyme o mostra).
      aplicarEfeitos({ uma_vez: `livro-${o.livro}`, contador: { livros_lidos: 1 } });
      if (l.flag) aplicarEfeitos({ flag: l.flag });
      aplicarEfeitos(o.coletar);
      atualizar();
      verificarContadores();
    }, { classe: 'btn-principal livro-fechar' });
    const painel = h('div', { class: 'livro-fundo' },
      h('article', { class: 'livro', role: 'dialog', 'aria-label': l.titulo },
        h('h2', { class: 'livro-titulo' }, l.titulo),
        h('div', { class: 'livro-texto' }, ...l.paragrafos.map((t) => (/^\(.*\)$/.test(t) ? h('p', {}, h('em', {}, t)) : h('p', {}, t)))),
        fechar));
    el.append(painel);
    fechar.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------ gatilhos e pausa */

  /** Gatilhos de cena: só ao ENTRAR na área (o motor avisa a entrada) e uma vez por entrada. */
  function aoEntrarGatilho(id: string) {
    if (ocupado || palco || fecharPausa || gatilhosDentro.has(id)) return;
    gatilhosDentro.add(id);
    const g = (mapa.gatilhosCena ?? []).find((x) => x.id === id);
    if (!g || !atende(g.requer)) return;
    if (g.empurra) empurrarPara = g.empurra;
    abrirCena(g.cena);
  }

  function abrirPausa() {
    if (fecharPausa || ocupado || ajudaAberta || document.querySelector('.dica-tutorial')) return;
    salvarPosicao(); // um save manual na pausa grava a posição exata
    motor?.pausar(true);
    controles.habilitar(false);
    fecharPausa = abrirMenuPausa({
      aoFechar: () => { fecharPausa = null; motor?.pausar(false); controles.habilitar(true); },
      // Botão de emergência: fecha o menu e leva o herói ao ponto seguro mais próximo.
      destravar: () => { fecharPausa?.(); void resgatar('destravado pelo jogador', false); },
      ajuda: idMapa === 'fullmun' ? { rotulo: textos.ajudaFullmun.menu, abrir: () => window.setTimeout(abrirAjuda, 0) } : undefined,
    });
  }

  /* ------------------------------------------------------------ ajuda de Füllmun e dicas */

  let ajudaAberta = false;
  /** "Füllmun desperta": sozinha na primeira entrada (mesmo sem dicas) e pelo menu de pausa. */
  function abrirAjuda() {
    if (!motor || saiu || ajudaAberta) return;
    ajudaAberta = true;
    motor.pausar(true);
    controles.habilitar(false);
    abrirAjudaFullmun(() => {
      ajudaAberta = false;
      if (saiu) return;
      motor?.pausar(false);
      if (!ocupado) controles.habilitar(true);
      dicasDoMapa();
    });
  }

  /** Depois de entrar no mapa (ou de uma conversa): ajuda de Füllmun na primeira vez, senão as dicas. */
  function aoFicarLivre() {
    if (saiu || ocupado || palco) return;
    if (idMapa === 'fullmun' && !getEstado().config.ajudaFullmunVista) return abrirAjuda();
    dicasDoMapa();
  }

  function dicasDoMapa() {
    if (saiu || ocupado || ajudaAberta) return;
    void dicaTutorial('menu');
    if (idMapa === 'fullmun') void dicaTutorial('salvar');
    if (objetosVisiveis().some((o) => !o.semIcone && !o.acao)) void dicaTutorial('item-mapa');
  }

  /* ------------------------------------------------------------ vigia (herói preso ou sem controle) */

  /** Leva o herói ao ponto seguro mais próximo (fade rápido) e devolve câmera e controle. */
  async function resgatar(motivo: string, registrar = true) {
    if (!motor || saiu) return;
    const m = motor;
    const de = m.posicao();
    const alvo = m.pontoSeguro();
    m.pararMovimento();
    await m.piscar(() => m.teleportar(alvo.x, alvo.y));
    if (saiu) return;
    m.seguirCamera();
    if (!ocupado) { m.bloquear(false); controles.habilitar(true); }
    salvarPosicao();
    resgates++;
    if (registrar) registrarErro(new Error(`Herói ${motivo} em ${idMapa} (${Math.round(de.x)}, ${Math.round(de.y)})`), { mensagem: 'Vigia do mapa' });
  }
  let resgates = 0;
  let foraDesde = 0;
  let semControleDesde = 0;

  /** A cada segundo: herói dentro do mapa e fora de colisão? Controle ligado quando nada está aberto? */
  function vigiar() {
    if (!motor || saiu) return;
    // O destino também acompanha mudanças feitas fora de uma cena (ex.: flag marcada por outro caminho).
    atualizarDestino();
    const agora = performance.now();
    const algoAberto = ocupado || palco !== null || fecharPausa !== null || !!el.querySelector('.livro') || !!document.querySelector('.modal-fundo, .dica-tutorial, .ajuda-fullmun');
    if (!algoAberto && !motor.travado() && motor.foraDaArea()) {
      if (!foraDesde) foraDesde = agora;
      else if (agora - foraDesde >= 1000) { foraDesde = 0; void resgatar('fora da área'); }
    } else foraDesde = 0;
    const semControle = !controles.ativo || motor.travado();
    if (semControle && !algoAberto) {
      if (!semControleDesde) semControleDesde = agora;
      else if (agora - semControleDesde > 10_000) {
        semControleDesde = 0;
        motor.pararMovimento();
        motor.bloquear(false);
        controles.habilitar(true);
        motor.seguirCamera();
        registrarErro(new Error(`Controle desligado há mais de 10 s sem cena em ${idMapa}`), { mensagem: 'Vigia do mapa' });
      }
    } else semControleDesde = 0;
  }

  /* ------------------------------------------------------------ montagem */

  /** Tela de carregamento do mapa: só sai quando o Phaser já tem o chão e os personagens. */
  let telaCarregando: ReturnType<typeof mostrarCarregando> | null = null;
  let editor: { estado: () => unknown; exportar: () => string; destruir: () => void } | null = null;
  const aoMudarAnimacoes = () => motor?.definirAnimacoes(!animacoesReduzidas());

  async function montar() {
    telaCarregando = mostrarCarregando(el, textos.loading.mapa);
    await garantirEtapa(etapaDoCapitulo(), el, telaCarregando, itensDoMapa(idMapa));
    if (saiu) return;
    verificarCaderno();
    void audio.carregarEfeitos([...SFX_CAPITULO, ...SFX_FASE4, ...SFX_SONHO]);
    const raca = p.raca, genero = p.genero;
    const ids = new Set([...(mapa.npcs ?? []).map((n) => n.id), ...(mapa.seguidores ?? []).map((s) => s.id)]);
    const itens = new Set((mapa.objetos ?? []).filter((o) => !o.semIcone).map((o) => o.item));
    const [{ criarMotor, abrirEditor, Cenario, Phaser: phaserMod }, temSprite] = await Promise.all([
      importar(() => import('../exploracao/pacote')), existeAsset(ASSETS.spriteChibi(raca, genero), 'image'),
    ]);
    if (saiu) return;
    phaser = phaserMod;
    const salvo = getEstado().campanha.local;
    const inicio = prm.x !== undefined
      ? { x: prm.x, y: prm.y ?? 0, direcao: 'cima' as Direcao }
      : salvo.mapa === idMapa && salvo.x !== undefined ? { x: salvo.x, y: salvo.y ?? 0, direcao: (salvo.direcao ?? 'baixo') as Direcao } : undefined;
    // Objetos do cenário (Füllmun): atlas já em memória pela etapa; animações conforme as Opções.
    // No editor, cada objeto fica como sprite próprio (sem a textura dos rasteiros).
    Cenario.semAssar = new URLSearchParams(location.search).has('editor');
    let cenario: Parameters<typeof criarMotor>[0]['cenario'];
    if (base.objetosAtlas) {
      const info = await (await fetch(src(`${base.objetosAtlas}.json`))).json() as { imagem: string; quadros: Record<string, { x: number; y: number; w: number; h: number }> };
      cenario = {
        atlasUrl: src(info.imagem), quadros: info.quadros, objetos: base.cenario, animacoes: !animacoesReduzidas(),
        agua: (base.colisoesExtras ?? []).filter((c) => c.id === 'rio').map((c) => c.pontos),
      };
    }
    if (saiu) return;
    const m = await criarMotor({
      container: el,
      mapa,
      cenario,
      blocos: blocosDoChao(base).map((b) => ({ ...b, url: src(b.imagem) })),
      heroi: { raca, genero, spriteUrl: temSprite ? urlAsset(ASSETS.spriteChibi(raca, genero)) : null },
      entrada: () => controles.vetor(),
      debugPermitido: import.meta.env.DEV || new URLSearchParams(location.search).has('debug'),
      debugInicial: new URLSearchParams(location.search).has('debug'),
      alturasDeTela: base.alturasDeTela ?? 1.6,
      inicio,
      extras: [
        ...[...ids].map((id) => ({ chave: `npc-${id}`, url: src(ASSETS.chibi(id)), tipo: 'folha' as const })),
        ...[...itens].map((id) => ({ chave: `item-${id}`, url: src(ASSETS.item(id)), tipo: 'imagem' as const })),
      ],
      aoProximidade: (id) => {
        mostrarNome(ocupado ? null : id);
        controles.mostrarInteracao(id !== null && !ocupado);
        if (id !== null && !ocupado && !ajudaAberta) void dicaTutorial('interagir');
      },
      aoEntrarGatilho,
      aoSairGatilho: (id) => gatilhosDentro.delete(id),
      aoPasso: () => audio.sfx('step-marble', { taxa: 0.8 + Math.random() * 0.2, ganho: 0.3 }),
      aoAtualizar: () => { atualizarSeguidores(); atualizarSetaDestino(); atualizarIndicadores(); },
    });
    if (saiu) return m.destruir();
    motor = m;
    for (const n of mapa.npcs ?? []) criarNpc(n);
    atualizar();
    el.classList.add('pronto');
    telaCarregando?.fechar();
    telaCarregando = null;
    // Opções → Animações reduzidas: o mapa liga ou desliga as animações na hora.
    window.addEventListener('fdg:animacoes', aoMudarAnimacoes);
    aplicarTravaHorizontal(true);
    // Editor de mapa: em desenvolvimento ou com ?editor=1 (nada é salvo no servidor).
    if (m.cenario && (new URLSearchParams(location.search).has('editor'))) {
      const bruto = structuredClone(Object.values(MAPAS).find((x) => x.id === idMapa)) as unknown as Record<string, unknown>;
      editor = abrirEditor({
        raiz: el, cena: m.cena, cenario: m.cenario, bruto, tipos: TIPOS_OBJETOS,
        definirColisoes: (c) => { mapa.colisoes = c; },
        moradores: new Map([...sprites].map(([id, r]) => [id, r.s])),
        itens: new Map([...objetosSprites].map(([id, d]) => [id, d.img])),
        fantasmaUrl: base.fantasma ? src(base.fantasma) : undefined,
      });
      el.classList.add('com-editor');
    }
    tocarMusicaDaCena(mapa.musica, 1500);
    if (idMapa === 'fullmun') audio.volumeRelativo(1);
    salvarPosicao();
    registrarGanchosMapa();
    vigia = window.setInterval(vigiar, 1000);
    // Dica de tutorial aberta: o mapa para (e o controle volta ao fechar, se nada mais estiver aberto).
    desfazerPausador = definirPausador((sim) => {
      if (!motor || fecharPausa) return;
      motor.pausar(sim);
      controles.habilitar(!sim && !ocupado && !ajudaAberta);
    });
    if (mapa.espirros) {
      const espirrar = () => { if (!saiu) { if (!ocupado) audio.sfx('espirro', { ganho: 0.7 }); timers.push(window.setTimeout(espirrar, 14_000 + Math.random() * 12_000)); } };
      timers.push(window.setTimeout(espirrar, 9000));
    }
    if (prm.cena) return abrirCena(prm.cena);
    for (const a of mapa.aoEntrar ?? []) {
      const chave = `entrou:${a.umaVez ?? a.cena}`;
      if (a.umaVez && getEstado().campanha.usadas.includes(chave)) continue;
      if (!atende(a.requer)) continue;
      if (a.umaVez) atualizarCampanha({ usadas: [...getEstado().campanha.usadas, chave] });
      return abrirCena(a.cena);
    }
    verificarBaloes();
    aoFicarLivre();
  }

  const pararAtraso = aoMudarAtraso(() => { desenharHud(true); window.setTimeout(() => hud.classList.remove('piscando'), 1500); });

  function registrarGanchosMapa() {
    registrarGanchos({
      goto: (id: string) => abrirCena(id),
      avancar: () => palco?.tocar(),
      teleport: (x: number, y: number) => { motor?.teleportar(x, y); salvarPosicao(); },
      gotoMapa: (mid: string, x?: number, y?: number) => {
        if (mid === idMapa && x !== undefined) { motor?.teleportar(x, y ?? 0); salvarPosicao(); }
        else void irPara('mapa', { mapa: mid, x, y });
      },
      walkTo: async (x: number, y: number) => (motor ? motor.caminharAte(x, y) : false),
      editorExportar: () => editor?.exportar() ?? null,
      interact: () => interagir(),
      interactWith: (alvo: string) => {
        const i = mapa.interacoes.find((x) => x.id === alvo);
        if (!i || !motor) return false;
        motor.teleportar(i.x, i.y + 2);
        window.setTimeout(() => interagir(alvo), 60);
        return true;
      },
      /** Remonta marcadores, itens e interações depois de mudar o save por fora (testes). */
      refresh: () => atualizar(),
      completeMissao: (id: string) => {
        definirMissao(id, 'concluida');
        somarAtraso((MISSOES as Record<string, { atraso: number }>)[id]?.atraso ?? 0);
        atualizar();
      },
      state: () => ({
        ...estadoProgresso(),
        tela: 'mapa',
        mapa: idMapa,
        pronto: motor !== null,
        heroi: motor?.posicao() ?? null,
        camera: motor ? { x: Math.round(motor.cena.cameras.main.scrollX), y: Math.round(motor.cena.cameras.main.scrollY) } : null,
        cameraInfo: motor ? { x: motor.cena.cameras.main.worldView.x, y: motor.cena.cameras.main.worldView.y, w: motor.cena.cameras.main.worldView.width, h: motor.cena.cameras.main.worldView.height, zoom: motor.cena.cameras.main.zoom } : null,
        pv: pvAtual(),
        proximo: motor?.proximo() ?? null,
        npcs: npcsVisiveis().map((n) => ({ id: n.id, marcador: marcadorDe(n.id) })),
        objetos: objetosVisiveis().map((o) => o.id),
        seguidores: [...seguidores.entries()].map(([id, f]) => ({ id, x: Math.round(f.s.x), y: Math.round(f.s.y) })),
        palco: palco !== null,
        cena: palco?.cenaAtual()?.id ?? null,
        escolhas: palco?.escolhasVisiveis() ?? [],
        digitando: palco?.digitando() ?? false,
        fundo: palco?.fundo() ?? null,
        hud: hud.textContent?.trim() ?? '',
        dica: dica.hidden ? null : dica.textContent,
        balao: ultimoBalao,
        livroAberto: !!el.querySelector('.livro'),
        controle: controles.ativo && !(motor?.travado() ?? true),
        cameraSegue: motor ? (motor.cena.cameras.main as unknown as { _follow: unknown })._follow === motor.heroi : false,
        resgates,
        fora: motor?.foraDaArea() ?? null,
        heroiNaTela: motor ? motor.cena.cameras.main.worldView.contains(motor.heroi.x, motor.heroi.y) : null,
        ajudaAberta,
        escala,
        editor: editor?.estado() ?? null,
        cenario: motor?.cenario ? motor.cenario.sprites.length : 0,
        carregando: !!el.querySelector('.carregando-etapa'),
        profundidade: motor?.estadoProfundidade() ?? null,
        npcsCobertura: motor ? [...sprites.values()].filter((r) => r.s.visible).map((r) => ({ id: r.npc.id, x: r.npc.x, y: r.npc.y, coberto: Math.round(motor!.cobertura(r.s) * 100) / 100 })) : [],
        heroiCobertura: motor ? Math.round(motor.cobertura(motor.heroi) * 100) / 100 : null,
        heroiAltura: motor ? Math.round(motor.heroi.displayHeight) : null,
        destinoMarcaY: destino?.balao.corpo.y ?? null,
        destino: destino ? { id: destino.d.id, x: destino.d.x, y: destino.d.y, cor: destino.d.cor ?? 'vermelho', seta: !setaDestino.hidden } : null,
        nomeVisivel: rotuloNome?.text ?? null,
        marcadoresProfundidade: [...sprites.values()].filter((r) => r.marcador?.corpo.visible).map((r) => r.marcador!.corpo.depth),
        baloes: motor ? [
          ...[...sprites.values()].filter((r) => r.marcador?.corpo.visible).map((r) => ({ id: `npc:${r.npc.id}`, tipo: r.marcador!.tipo, alturaTela: Math.round(r.marcador!.corpo.displayHeight * motor!.pxTela() * 10) / 10, alturaRel: Math.round((r.marcador!.corpo.displayHeight / alturaHeroi) * 100) / 100 })),
          ...[...objetosMarcadores.entries()].map(([id, m]) => ({ id: `obj:${id}`, tipo: m.balao.tipo, alturaTela: Math.round(m.balao.corpo.displayHeight * motor!.pxTela() * 10) / 10, alturaRel: Math.round((m.balao.corpo.displayHeight / alturaHeroi) * 100) / 100, anel: !!m.anel })),
        ] : [],
        indicadores: indicadoresAtuais,
        itens: motor ? [...objetosSprites.entries()].map(([id, d]) => {
          const b = d.img.getBounds();
          return { id, profundidade: d.img.depth, alturaRel: Math.round((d.img.displayHeight / alturaHeroi) * 100) / 100, visivel: Math.round((1 - motor!.coberturaCaixa(b, d.img.depth)) * 100) / 100, escuro: d.img.isTinted, x: Math.round(d.img.x), y: Math.round(d.img.y) };
        }) : [],
        coleta: coletaAtual(),
        nitidez: motor?.nitidez() ?? null,
      }),
    });
  }

  return {
    el,
    aoEntrar() {
      montar().catch((erro) => {
        telaCarregando?.fechar();
        if (!ehErroDeModulo(erro)) { registrarErro(erro, { mensagem: 'O mapa não carregou' }); mostrarTelaDeErro(); }
      });
    },
    aoSair() {
      saiu = true;
      salvarPosicao();
      pararAtraso();
      timers.forEach(clearTimeout);
      clearInterval(vigia);
      desfazerPausador();
      palco?.destruir();
      controles.destruir();
      window.removeEventListener('fdg:animacoes', aoMudarAnimacoes);
      aplicarTravaHorizontal(false);
      editor?.destruir();
      motor?.destruir();
      motor = null;
      document.querySelectorAll('.modal-fundo, .compendio-fundo').forEach((m) => m.remove());
    },
  };
}
