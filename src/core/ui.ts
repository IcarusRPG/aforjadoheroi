import { audio } from './audio';
import type { NomeSfx } from './assets';

type Filho = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | undefined | null | EventListener>;

/** Cria um elemento: h('div', { class: 'x', onclick: fn }, 'texto', outroEl). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...filhos: Filho[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const f of filhos) if (f !== null && f !== undefined && f !== false) el.append(f);
  return el;
}

/** Som leve ao passar o mouse (não toca em toque, onde não existe hover). */
export function somHover(el: HTMLElement): HTMLElement {
  el.addEventListener('pointerenter', (e) => {
    if ((e as PointerEvent).pointerType === 'mouse' && !el.hasAttribute('disabled')) audio.sfx('ui-hover');
  });
  return el;
}

export interface OpcoesBotao {
  classe?: string;
  som?: NomeSfx | null;
  desabilitado?: boolean;
}

/**
 * Botão MENU (Fase 5B): pílula com ☰ e "MENU", sempre no canto superior direito das telas de jogo
 * (mapas, sonho, cenas, batalha). Abre o painel "Menu" (o antigo "Pausa"); Esc também abre e fecha.
 */
export function botaoMenu(classe = ''): HTMLButtonElement {
  return h('button', { type: 'button', class: `btn-pausa btn-menu ${classe}`.trim(), 'aria-label': 'Menu' },
    h('span', { class: 'btn-menu-icone', 'aria-hidden': 'true' }, '☰'),
    h('span', { class: 'btn-menu-texto' }, 'MENU')) as HTMLButtonElement;
}

export function botao(texto: string, aoClicar: () => void, opcoes: OpcoesBotao = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `btn ${opcoes.classe ?? ''}`.trim(), disabled: opcoes.desabilitado }, texto);
  b.addEventListener('click', () => {
    if (b.disabled) return;
    if (opcoes.som !== null) audio.sfx(opcoes.som ?? 'ui-click');
    aoClicar();
  });
  somHover(b);
  return b;
}

/** Janela modal simples (Opções, Créditos). Esc ou clique fora fecham. */
export function abrirModal(titulo: string, conteudo: Node, textoFechar: string, aoFechar?: () => void): () => void {
  const anterior = document.activeElement as HTMLElement | null;
  const fechar = () => {
    fundo.classList.add('saindo');
    window.removeEventListener('keydown', teclado);
    setTimeout(() => fundo.remove(), 250);
    anterior?.focus?.();
    aoFechar?.();
  };
  const teclado = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      audio.sfx('ui-back');
      fechar();
    }
  };
  const btnFechar = botao(textoFechar, fechar, { som: 'ui-back' });
  const caixa = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    h('h2', { class: 'modal-titulo' }, titulo),
    h('div', { class: 'modal-corpo' }, conteudo),
    h('div', { class: 'modal-acoes' }, btnFechar),
  );
  const fundo = h('div', { class: 'modal-fundo' }, caixa);
  fundo.addEventListener('pointerdown', (e) => {
    if (e.target === fundo) {
      audio.sfx('ui-back');
      fechar();
    }
  });
  window.addEventListener('keydown', teclado);
  document.body.append(fundo);
  btnFechar.focus();
  return fechar;
}

/**
 * Pergunta de confirmação por cima de tudo (Substituir / Cancelar, Apagar / Cancelar…). Esc e toque
 * fora cancelam. Devolve true se o jogador confirmou.
 */
export function confirmar(o: { texto: Node | string; ok: string; cancelar: string; classe?: string; perigo?: boolean }): Promise<boolean> {
  return new Promise((resolver) => {
    const anterior = document.activeElement as HTMLElement | null;
    const fechar = (sim: boolean) => {
      window.removeEventListener('keydown', teclado, true);
      fundo.classList.add('saindo');
      setTimeout(() => fundo.remove(), 200);
      anterior?.focus?.();
      resolver(sim);
    };
    const teclado = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      audio.sfx('ui-back');
      fechar(false);
    };
    const btnCancelar = botao(o.cancelar, () => fechar(false), { som: 'ui-back' });
    const btnOk = botao(o.ok, () => fechar(true), { classe: o.perigo ? 'btn-perigo' : 'btn-principal', som: 'ui-confirm' });
    const caixa = h('div', { class: `modal confirmar ${o.classe ?? ''}`.trim(), role: 'alertdialog', 'aria-modal': 'true' },
      h('div', { class: 'confirmar-texto' }, o.texto),
      h('div', { class: 'modal-acoes confirmar-acoes' }, btnCancelar, btnOk),
    );
    const fundo = h('div', { class: 'modal-fundo confirmar-fundo' }, caixa);
    fundo.addEventListener('pointerdown', (e) => { if (e.target === fundo) fechar(false); });
    window.addEventListener('keydown', teclado, true);
    document.body.append(fundo);
    btnCancelar.focus();
  });
}

export const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
