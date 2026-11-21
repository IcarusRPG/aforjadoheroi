import Phaser from 'phaser';
import { h } from '../core/ui';
import type { Cenario, SpriteCenario } from './cenario';
import { colisoesMontadas, montarObjetos, type ObjetoCenario, type TipoObjeto } from './montagem';
import type { CamadaColisao, Ponto } from './tipos';

/**
 * Editor de mapa (Fase 5): só em desenvolvimento ou com ?editor=1. Nada é salvo no servidor.
 * Mostra o chão, os objetos, os pés (vermelho), as linhas de profundidade (amarelo), as interações (azul),
 * os gatilhos (roxo) e o mapa antigo como fantasma. Permite arrastar, duplicar, apagar e espelhar
 * objetos, ajustar o pé e a linha de profundidade de cada um, e mover moradores, itens e gatilhos.
 * "Exportar JSON" baixa o mapa atualizado; "Copiar" põe o JSON na área de transferência.
 */

export interface ContextoEditor {
  raiz: HTMLElement;
  cena: Phaser.Scene;
  cenario: Cenario;
  /** O JSON do mapa como está no arquivo (é a base do que o editor exporta). */
  bruto: Record<string, unknown>;
  tipos: Record<string, TipoObjeto>;
  /** Para o jogo usar as colisões novas na hora. */
  definirColisoes(c: CamadaColisao[]): void;
  /** Sprites dos moradores e dos itens (para arrastar junto). */
  moradores: Map<string, Phaser.GameObjects.Sprite>;
  itens: Map<string, Phaser.GameObjects.Image>;
  fantasmaUrl?: string;
}

type Selecao =
  | { tipo: 'objeto'; s: SpriteCenario }
  | { tipo: 'npc'; i: number }
  | { tipo: 'item'; i: number }
  | { tipo: 'gatilho'; i: number };

export const editorPedido = (): boolean => new URLSearchParams(location.search).has('editor');

export function abrirEditor(ctx: ContextoEditor): { estado: () => unknown; exportar: () => string; destruir: () => void } {
  const { cena, cenario } = ctx;
  const objetos = ctx.bruto.objetos as ObjetoCenario[];
  const npcs = (ctx.bruto.npcs as { id: string; x: number; y: number }[]) ?? [];
  const itens = (ctx.bruto.itens as { id: string; x: number; y: number; interacao?: { x: number; y: number } }[]) ?? [];
  const gatilhos = (ctx.bruto.gatilhos as { id: string; pontos: Ponto[] }[]) ?? [];
  const extras = ctx.bruto.colisoesExtras as CamadaColisao[];

  const g = cena.add.graphics().setDepth(900_000);
  let fantasma: Phaser.GameObjects.Image | null = null;
  let selecao: Selecao | null = null;
  let arrastando: { dx: number; dy: number } | null = null;

  /* ------------------------------------------------------------ painel */
  const num = (rotulo: string, aoMudar: (v: number) => void) => {
    const inp = h('input', { type: 'number', class: 'editor-num', step: '1' }) as HTMLInputElement;
    inp.addEventListener('change', () => aoMudar(Number(inp.value)));
    return { el: h('label', { class: 'editor-campo' }, rotulo, inp), inp };
  };
  const titulo = h('p', { class: 'editor-sel' }, 'Toque num objeto, morador, item ou gatilho');
  const cx = num('x', (v) => mover(v, null)), cy = num('y', (v) => mover(null, v));
  const p0 = num('pé x0', (v) => mudarPe(0, v)), p1 = num('pé y0', (v) => mudarPe(1, v)), p2 = num('pé x1', (v) => mudarPe(2, v)), p3 = num('pé y1', (v) => mudarPe(3, v));
  const ly = num('linhaY', (v) => mudarLinha(v));
  const espelhar = h('button', { type: 'button', class: 'btn btn-discreto' }, 'Espelhar');
  const duplicar = h('button', { type: 'button', class: 'btn btn-discreto' }, 'Duplicar');
  const apagar = h('button', { type: 'button', class: 'btn btn-discreto' }, 'Apagar');
  const novo = h('select', { class: 'editor-novo' }, ...Object.keys(ctx.tipos).map((id) => h('option', { value: id }, id))) as HTMLSelectElement;
  const adicionar = h('button', { type: 'button', class: 'btn btn-discreto' }, 'Adicionar no centro');
  const chkFantasma = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const chkMarcas = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
  const exportarBtn = h('button', { type: 'button', class: 'btn btn-principal editor-exportar' }, 'Exportar JSON');
  const copiarBtn = h('button', { type: 'button', class: 'btn btn-discreto editor-copiar' }, 'Copiar para a área de transferência');
  const aviso = h('p', { class: 'editor-aviso', role: 'status' });
  const camposObjeto = h('div', { class: 'editor-objeto' }, p0.el, p1.el, p2.el, p3.el, ly.el, h('div', { class: 'editor-botoes' }, espelhar, duplicar, apagar));
  const painel = h('aside', { class: 'editor-mapa', 'aria-label': 'Editor de mapa' },
    h('p', { class: 'editor-titulo' }, 'Editor de mapa'),
    h('label', { class: 'editor-campo' }, chkFantasma, ' Mapa antigo (fantasma)'),
    h('label', { class: 'editor-campo' }, chkMarcas, ' Pés, profundidade, interações e gatilhos'),
    titulo, h('div', { class: 'editor-xy' }, cx.el, cy.el), camposObjeto,
    h('div', { class: 'editor-botoes' }, novo, adicionar),
    h('div', { class: 'editor-botoes' }, exportarBtn, copiarBtn), aviso);
  ctx.raiz.append(painel);
  for (const ev of ['pointerdown', 'keydown', 'wheel']) painel.addEventListener(ev, (e) => e.stopPropagation());

  /* ------------------------------------------------------------ desenho das marcas */
  function desenhar() {
    g.clear();
    if (!chkMarcas.checked) return;
    for (const s of cenario.sprites) {
      if (s.o.peAbs) {
        const [x0, y0, x1, y1] = s.o.peAbs;
        g.fillStyle(0xff2030, 0.28).fillRect(x0, y0, x1 - x0, y1 - y0).lineStyle(1.5, 0xff2030, 1).strokeRect(x0, y0, x1 - x0, y1 - y0);
      }
      const t = ctx.tipos[s.o.id];
      g.lineStyle(1.5, 0xffe000, 0.9).lineBetween(s.o.x - (t?.largura ?? 40) / 2, s.o.profundidade, s.o.x + (t?.largura ?? 40) / 2, s.o.profundidade);
    }
    for (const n of npcs) g.lineStyle(2, 0x30a0ff, 1).strokeCircle(n.x, n.y + 8, 58);
    for (const i of itens) g.lineStyle(2, 0x30a0ff, 1).strokeCircle(i.interacao?.x ?? i.x, i.interacao?.y ?? i.y, 52);
    for (const gt of gatilhos) {
      g.fillStyle(0xb040ff, 0.25).lineStyle(2, 0xb040ff, 1);
      const v = gt.pontos.map(([x, y]) => new Phaser.Math.Vector2(x, y));
      g.fillPoints(v, true).strokePoints(v, true);
    }
    if (selecao?.tipo === 'objeto') {
      const b = selecao.s.img.getBounds();
      g.lineStyle(2, 0xffffff, 1).strokeRect(b.x, b.y, b.width, b.height);
    }
  }

  /* ------------------------------------------------------------ seleção e edição */
  function preencher() {
    camposObjeto.hidden = selecao?.tipo !== 'objeto';
    if (!selecao) { titulo.textContent = 'Toque num objeto, morador, item ou gatilho'; return; }
    if (selecao.tipo === 'objeto') {
      const o = objetos[selecao.s.o.indice];
      const pe = o.pe ?? ctx.tipos[o.id].pe;
      titulo.textContent = `Objeto: ${o.id}${o.espelhar ? ' (espelhado)' : ''}`;
      cx.inp.value = String(o.x); cy.inp.value = String(o.y);
      [p0, p1, p2, p3].forEach((c, k) => { c.inp.value = String(pe[k]); });
      ly.inp.value = String(o.linhaY ?? ctx.tipos[o.id].linhaY ?? 0);
    } else {
      const alvo = selecao.tipo === 'npc' ? npcs[selecao.i] : selecao.tipo === 'item' ? itens[selecao.i] : null;
      const gt = selecao.tipo === 'gatilho' ? gatilhos[selecao.i] : null;
      titulo.textContent = `${selecao.tipo === 'npc' ? 'Morador' : selecao.tipo === 'item' ? 'Item' : 'Gatilho'}: ${alvo?.id ?? gt?.id}`;
      cx.inp.value = String(alvo?.x ?? gt?.pontos[0][0]); cy.inp.value = String(alvo?.y ?? gt?.pontos[0][1]);
    }
  }

  /** Remonta o objeto (sprite, pé, profundidade) depois de uma mudança, e as colisões do mapa. */
  function remontar(s: SpriteCenario): SpriteCenario {
    const i = s.o.indice;
    cenario.remover(s);
    const novoS = cenario.criar(montarObjetos(objetos, ctx.tipos)[i])!;
    atualizarColisoes();
    return novoS;
  }
  function atualizarColisoes() {
    const montados = montarObjetos(objetos, ctx.tipos);
    // Mantém os índices dos sprites em dia (apagar/duplicar mexem na lista).
    for (const s of cenario.sprites) s.o = montados[s.o.indice] ?? s.o;
    ctx.definirColisoes(colisoesMontadas(extras, montados));
  }

  function mover(x: number | null, y: number | null) {
    if (!selecao) return;
    if (selecao.tipo === 'objeto') {
      const o = objetos[selecao.s.o.indice];
      if (x !== null) o.x = Math.round(x);
      if (y !== null) o.y = Math.round(y);
      selecao = { tipo: 'objeto', s: remontar(selecao.s) };
    } else if (selecao.tipo === 'gatilho') {
      const gt = gatilhos[selecao.i];
      const dx = x === null ? 0 : Math.round(x - gt.pontos[0][0]), dy = y === null ? 0 : Math.round(y - gt.pontos[0][1]);
      gt.pontos = gt.pontos.map(([px, py]) => [px + dx, py + dy]);
    } else {
      const lista = selecao.tipo === 'npc' ? npcs : itens;
      const a = lista[selecao.i];
      if (x !== null) a.x = Math.round(x);
      if (y !== null) a.y = Math.round(y);
      const spr = selecao.tipo === 'npc' ? ctx.moradores.get(a.id) : ctx.itens.get(a.id);
      spr?.setPosition(a.x, a.y);
      if (selecao.tipo === 'npc') spr?.setDepth(a.y);
    }
    desenhar();
    preencher();
  }
  function mudarPe(k: number, v: number) {
    if (selecao?.tipo !== 'objeto') return;
    const o = objetos[selecao.s.o.indice];
    const pe = [...(o.pe ?? ctx.tipos[o.id].pe)] as [number, number, number, number];
    pe[k] = Math.round(v);
    o.pe = pe;
    selecao = { tipo: 'objeto', s: remontar(selecao.s) };
    desenhar();
  }
  function mudarLinha(v: number) {
    if (selecao?.tipo !== 'objeto') return;
    objetos[selecao.s.o.indice].linhaY = Math.round(v);
    selecao = { tipo: 'objeto', s: remontar(selecao.s) };
    desenhar();
  }
  espelhar.addEventListener('click', () => {
    if (selecao?.tipo !== 'objeto') return;
    const o = objetos[selecao.s.o.indice];
    if (o.espelhar) delete o.espelhar; else o.espelhar = true;
    selecao = { tipo: 'objeto', s: remontar(selecao.s) };
    desenhar(); preencher();
  });
  duplicar.addEventListener('click', () => {
    if (selecao?.tipo !== 'objeto') return;
    const o = objetos[selecao.s.o.indice];
    objetos.push({ ...o, x: o.x + 40, y: o.y + 20 });
    const s = cenario.criar(montarObjetos(objetos, ctx.tipos)[objetos.length - 1])!;
    atualizarColisoes();
    selecao = { tipo: 'objeto', s };
    desenhar(); preencher();
  });
  apagar.addEventListener('click', () => {
    if (selecao?.tipo !== 'objeto') return;
    const i = selecao.s.o.indice;
    cenario.remover(selecao.s);
    objetos.splice(i, 1);
    for (const s of cenario.sprites) if (s.o.indice > i) s.o = { ...s.o, indice: s.o.indice - 1 };
    atualizarColisoes();
    selecao = null;
    desenhar(); preencher();
  });
  adicionar.addEventListener('click', () => {
    const v = cena.cameras.main.worldView;
    objetos.push({ id: novo.value, x: Math.round(v.centerX), y: Math.round(v.centerY) });
    const s = cenario.criar(montarObjetos(objetos, ctx.tipos)[objetos.length - 1])!;
    atualizarColisoes();
    selecao = { tipo: 'objeto', s };
    desenhar(); preencher();
  });
  chkMarcas.addEventListener('change', desenhar);
  chkFantasma.addEventListener('change', () => {
    if (chkFantasma.checked && !fantasma && ctx.fantasmaUrl) {
      cena.load.image('editor-fantasma', ctx.fantasmaUrl);
      cena.load.once(Phaser.Loader.Events.COMPLETE, () => {
        const largura = (ctx.bruto.largura as number), altura = (ctx.bruto.altura as number);
        fantasma = cena.add.image(0, 0, 'editor-fantasma').setOrigin(0).setDisplaySize(largura, altura).setAlpha(0.45).setDepth(800_000);
      });
      cena.load.start();
    }
    fantasma?.setVisible(chkFantasma.checked);
  });

  /* ------------------------------------------------------------ toque, arrastar */
  function escolher(x: number, y: number): Selecao | null {
    const perto = (a: { x: number; y: number }, r = 26) => Math.hypot(a.x - x, a.y - y) < r;
    let k = npcs.findIndex((n) => perto(n) || perto({ x: n.x, y: n.y - 24 }));
    if (k >= 0) return { tipo: 'npc', i: k };
    k = itens.findIndex((i) => perto(i, 20));
    if (k >= 0) return { tipo: 'item', i: k };
    // O objeto de cima (maior profundidade) que tem pixel opaco no ponto.
    const objs = [...cenario.sprites].sort((a, b) => b.o.profundidade - a.o.profundidade);
    const s = objs.find((o) => o.img.getBounds().contains(x, y) && cenario.opaco(o, x, y));
    if (s) return { tipo: 'objeto', s };
    k = gatilhos.findIndex((gt) => {
      const xs = gt.pontos.map((p) => p[0]), ys = gt.pontos.map((p) => p[1]);
      return x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys);
    });
    return k >= 0 ? { tipo: 'gatilho', i: k } : null;
  }
  const posicao = (sel: Selecao) => sel.tipo === 'objeto' ? objetos[sel.s.o.indice]
    : sel.tipo === 'npc' ? npcs[sel.i] : sel.tipo === 'item' ? itens[sel.i] : { x: gatilhos[sel.i].pontos[0][0], y: gatilhos[sel.i].pontos[0][1] };

  const aoTocar = (p: Phaser.Input.Pointer) => {
    selecao = escolher(p.worldX, p.worldY);
    if (selecao) { const a = posicao(selecao); arrastando = { dx: a.x - p.worldX, dy: a.y - p.worldY }; }
    desenhar(); preencher();
  };
  const aoMover = (p: Phaser.Input.Pointer) => {
    if (!arrastando || !selecao || !p.isDown) return;
    const x = Math.round(p.worldX + arrastando.dx), y = Math.round(p.worldY + arrastando.dy);
    if (selecao.tipo === 'objeto') {
      // Durante o arraste só o sprite anda; o pé e as colisões se ajustam ao soltar.
      const o = objetos[selecao.s.o.indice];
      o.x = x; o.y = y;
      selecao.s.img.setPosition(x, y);
    } else mover(x, y);
  };
  const aoSoltar = () => {
    if (arrastando && selecao?.tipo === 'objeto') selecao = { tipo: 'objeto', s: remontar(selecao.s) };
    arrastando = null;
    desenhar(); preencher();
  };
  cena.input.on(Phaser.Input.Events.POINTER_DOWN, aoTocar);
  cena.input.on(Phaser.Input.Events.POINTER_MOVE, aoMover);
  cena.input.on(Phaser.Input.Events.POINTER_UP, aoSoltar);

  /* ------------------------------------------------------------ exportar */
  function exportar(): string {
    const saida = { ...ctx.bruto, objetos, npcs, itens, gatilhos };
    return `${JSON.stringify(saida, null, 1)}\n`;
  }
  exportarBtn.addEventListener('click', () => {
    const blob = new Blob([exportar()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${ctx.bruto.id}.json` }) as HTMLAnchorElement;
    document.body.append(a);
    a.click();
    a.remove();
    aviso.textContent = `${ctx.bruto.id}.json baixado.`;
  });
  copiarBtn.addEventListener('click', () => {
    void navigator.clipboard?.writeText(exportar()).then(() => { aviso.textContent = 'JSON copiado.'; }, () => { aviso.textContent = 'Não deu para copiar: use "Exportar JSON".'; });
  });

  preencher();
  desenhar();
  return {
    estado: () => ({ selecao: selecao ? { tipo: selecao.tipo, id: selecao.tipo === 'objeto' ? selecao.s.o.id : null } : null, objetos: objetos.length, fantasma: !!fantasma?.visible }),
    exportar,
    destruir: () => {
      cena.input.off(Phaser.Input.Events.POINTER_DOWN, aoTocar);
      cena.input.off(Phaser.Input.Events.POINTER_MOVE, aoMover);
      cena.input.off(Phaser.Input.Events.POINTER_UP, aoSoltar);
      g.destroy();
      fantasma?.destroy();
      painel.remove();
    },
  };
}
