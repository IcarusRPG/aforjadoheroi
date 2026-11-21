import { getEstado } from './estado';
import { textos } from './textos';
import { h } from './ui';

/**
 * Tela cheia (Fase 5). Usa a Fullscreen API no documento inteiro (os menus e diálogos ficam no <body>,
 * então a raiz do jogo é a página toda). O ícone acompanha o Esc e o gesto de voltar pelo
 * `fullscreenchange`. iPhone e iPad (Safari) não têm tela cheia para sites: lá o botão não aparece e,
 * no lugar dele, a dica de "Adicionar à Tela de Início".
 */

/** iPhone, iPad ou iPod (inclusive o iPad que se apresenta como Mac). */
export function ehIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** O navegador deixa o site entrar em tela cheia? (Não no iPhone.) */
export const suportaTelaCheia = (): boolean => !ehIOS() && !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';
export const emTelaCheia = (): boolean => !!document.fullscreenElement;
/** Já está rodando como app (Adicionado à Tela de Início): não precisa de tela cheia nem da dica. */
export const comoApp = (): boolean => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export async function alternarTelaCheia(): Promise<void> {
  try {
    if (emTelaCheia()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { /* o navegador recusou (sem gesto do usuário, política): segue sem tela cheia */ }
}

/**
 * "Travar na horizontal" (Opções): em tela cheia, trava a tela deitada nos mapas e batalhas e destrava
 * nas outras telas. Navegadores sem suporte ignoram.
 */
export function aplicarTravaHorizontal(telaDeAcao: boolean): void {
  const o = (screen as unknown as { orientation?: { lock?: (t: string) => Promise<void>; unlock?: () => void } }).orientation;
  if (!o?.lock) return;
  if (telaDeAcao && emTelaCheia() && getEstado().config.travarHorizontal) void o.lock('landscape').catch(() => {});
  else { try { o.unlock?.(); } catch { /* sem trava */ } }
}

const ICONE_ENTRAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICONE_SAIR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Botão de tela cheia (menu inicial, pausa e Opções). Devolve null onde não há tela cheia (iPhone) ou
 * quando o jogo já roda como app.
 */
export function botaoTelaCheia(classe = '', comTexto = false): HTMLButtonElement | null {
  if (!suportaTelaCheia() || comoApp()) return null;
  const T = textos.telaCheia;
  const icone = h('span', { class: 'tela-cheia-icone', 'aria-hidden': 'true' });
  const rotulo = h('span', { class: 'tela-cheia-rotulo' });
  const b = h('button', { type: 'button', class: `btn-tela-cheia ${classe}`.trim() }, icone, comTexto ? rotulo : null) as HTMLButtonElement;
  const atualizar = () => {
    const dentro = emTelaCheia();
    icone.innerHTML = dentro ? ICONE_SAIR : ICONE_ENTRAR;
    rotulo.textContent = dentro ? T.sair : T.entrar;
    b.setAttribute('aria-label', dentro ? T.sair : T.entrar);
    b.setAttribute('aria-pressed', String(dentro));
    b.dataset.estado = dentro ? 'dentro' : 'fora';
  };
  b.addEventListener('click', () => void alternarTelaCheia());
  document.addEventListener('fullscreenchange', atualizar);
  // Quando o botão sai da tela, para de ouvir.
  new MutationObserver((_, obs) => { if (!b.isConnected) { document.removeEventListener('fullscreenchange', atualizar); obs.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
  atualizar();
  return b;
}

/** Dica do iPhone: "Compartilhar → Adicionar à Tela de Início" (com o ícone do Safari). */
export function dicaIphone(classe = ''): HTMLElement | null {
  if (!ehIOS() || comoApp()) return null;
  const icone = h('span', { class: 'dica-iphone-icone', 'aria-hidden': 'true' });
  icone.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3v11M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  return h('p', { class: `dica-iphone ${classe}`.trim(), role: 'note' }, icone, h('span', {}, textos.telaCheia.dicaIphone));
}
