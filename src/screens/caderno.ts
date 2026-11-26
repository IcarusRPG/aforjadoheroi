import { src } from '../core/assets';
import { audio } from '../core/audio';
import { CADERNO, liberados, marcarCadernoVisto, marcarPaginasLidas, perguntaRespondida, verificarCaderno, type AnotacaoCaderno, type PaginaCaderno, type PerguntaCaderno } from '../core/caderno';
import { getEstado } from '../core/estado';
import { fmt, textos } from '../core/textos';
import { h } from '../core/ui';
import { interpolar } from '../narrativa/capitulo';

/**
 * Caderno de estudos (Fase 4E): um caderno de couro aberto. No desktop, duas páginas lado a lado; no
 * celular, uma página por vez, com deslize. Abas: Os deuses · Anotações · Perguntas. Imagens dos deuses
 * em sépia, como esboços colados; um toque mostra a imagem em cores, em tela cheia.
 */

export type AbaCaderno = 'deuses' | 'anotacoes' | 'perguntas';
const ABAS: AbaCaderno[] = ['deuses', 'anotacoes', 'perguntas'];
/** Anotações por folha (a "sozinha" ocupa uma folha inteira). */
const ANOTACOES_POR_FOLHA = 3;
const LARGURA_DUAS_PAGINAS = 760;

let aberto: { fechar: () => void } | null = null;
export const cadernoAberto = (): boolean => aberto !== null;

/** Texto com **negrito**, já com {nome} e {a|b} resolvidos. */
function rico(texto: string): Node[] {
  return interpolar(texto).split('**').map((parte, i) => (i % 2 ? h('strong', {}, parte) : document.createTextNode(parte)));
}

interface Folha { id: string; el: () => HTMLElement }

/** O esboço só aparece depois de carregado (nada pela metade). */
function imagemPronta(caminho: string): HTMLImageElement {
  const img = h('img', { alt: '', draggable: 'false' }) as HTMLImageElement;
  img.addEventListener('load', () => img.classList.add('pronta'), { once: true });
  img.src = src(caminho);
  if (img.complete && img.naturalWidth) img.classList.add('pronta');
  return img;
}

function folhaDeus(p: PaginaCaderno, abrirImagem: (p: PaginaCaderno) => void): Folha {
  return {
    id: p.id,
    el: () => {
      const T = textos.caderno;
      const pag = h('section', { class: 'caderno-pagina', 'data-pagina': p.id });
      if (!p.deus) {
        pag.classList.add('caderno-abertura');
        pag.append(h('h2', { class: 'caderno-titulo' }, p.titulo ?? ''));
      } else {
        const nome = p.deus.nome;
        const figura = p.imagem
          ? h('button', { type: 'button', class: 'caderno-esboco', 'aria-label': fmt(T.verEmCores, getEstado().personagem?.genero ?? 'm', { nome }) },
            imagemPronta(`img/panteao/${p.imagem}.webp`))
          : h('div', { class: 'caderno-esboco caderno-moldura-vazia', role: 'img', 'aria-label': fmt(T.semImagem, 'm', { nome }) }, h('span', {}, '?'));
        if (p.imagem) figura.addEventListener('click', () => abrirImagem(p));
        pag.append(figura,
          h('h2', { class: 'caderno-titulo' }, nome),
          h('p', { class: 'caderno-cabeca' },
            h('span', { class: `caderno-selo selo-${p.deus.grupo}` }, p.deus.grupo === 'alfar' ? T.alfar : T.baldur),
            h('span', { class: 'caderno-dominio' }, p.deus.dominio)));
      }
      for (const t of p.texto) pag.append(h('p', { class: 'caderno-mao' }, ...rico(t)));
      if (p.extra && getEstado().personagem?.raca === p.extra.raca) pag.append(h('p', { class: 'caderno-mao caderno-extra', 'data-extra': p.extra.raca }, ...rico(p.extra.texto)));
      if (p.margem) pag.append(h('p', { class: `caderno-margem${p.margem.sublinhado ? ` sublinhado-${p.margem.sublinhado}` : ''}` }, ...rico(p.margem.texto)));
      return pag;
    },
  };
}

function folhasAnotacoes(lista: AnotacaoCaderno[]): Folha[] {
  const folhas: Folha[] = [];
  let atual: AnotacaoCaderno[] = [];
  const fecharFolha = () => {
    if (!atual.length) return;
    const grupo = atual;
    folhas.push({
      id: `anotacoes-${folhas.length + 1}`,
      el: () => h('section', { class: 'caderno-pagina caderno-anotacoes' },
        ...grupo.map((a) => h('article', { class: `caderno-anotacao${a.sozinha ? ' sozinha' : ''}`, 'data-anotacao': a.id },
          a.data ? h('p', { class: 'caderno-data' }, a.data) : null,
          h('p', { class: 'caderno-mao' }, ...rico(a.texto))))),
    });
    atual = [];
  };
  for (const a of lista) {
    if (a.sozinha) { fecharFolha(); atual = [a]; fecharFolha(); continue; }
    atual.push(a);
    if (atual.length === ANOTACOES_POR_FOLHA) fecharFolha();
  }
  fecharFolha();
  return folhas;
}

function folhaPerguntas(lista: PerguntaCaderno[]): Folha {
  return {
    id: 'perguntas',
    el: () => h('section', { class: 'caderno-pagina caderno-perguntas' },
      h('h2', { class: 'caderno-titulo' }, textos.caderno.abas.perguntas),
      h('ul', { class: 'caderno-lista-perguntas' }, ...lista.map((q) => {
        const ok = perguntaRespondida(q);
        return h('li', { class: ok ? 'respondida' : '', 'data-pergunta': q.id },
          h('span', { class: 'caderno-marca', 'aria-hidden': 'true' }, ok ? '◆' : '◇'),
          h('span', { class: 'caderno-mao' }, ...rico(q.texto)),
          ok && q.respondida ? h('span', { class: 'caderno-resposta caderno-mao' }, ...rico(q.respondida.resposta)) : null);
      })),
      h('p', { class: 'caderno-rodape-dica' }, textos.caderno.perguntasDica)),
  };
}

/**
 * Abre o caderno (na aba e, opcionalmente, na página pedida). Resolve quando ele fecha.
 */
export function abrirCaderno(o: { aba?: AbaCaderno; pagina?: string } = {}): Promise<void> {
  aberto?.fechar();
  // Um caderno que ainda está saindo (animação de 200 ms) sai na hora: nunca dois na tela.
  document.querySelectorAll('.caderno-fundo.saindo').forEach((e) => e.remove());
  verificarCaderno();
  marcarCadernoVisto();
  const T = textos.caderno;
  return new Promise<void>((resolver) => {
    let aba: AbaCaderno = o.aba ?? 'deuses';
    let indice = 0;
    let folhas: Folha[] = [];

    const abas = h('div', { class: 'caderno-abas', role: 'tablist' }, ...ABAS.map((a) => {
      const b = h('button', { type: 'button', class: 'caderno-aba', role: 'tab', 'data-aba': a }, T.abas[a]);
      b.addEventListener('click', () => { if (aba !== a) { aba = a; indice = 0; montarFolhas(); desenhar(true); } });
      return b;
    }));
    const fecharBtn = h('button', { type: 'button', class: 'caderno-fechar', 'aria-label': T.fechar }, '×');
    const spread = h('div', { class: 'caderno-spread' });
    const anterior = h('button', { type: 'button', class: 'caderno-nav caderno-anterior', 'aria-label': T.anterior }, '‹');
    const proxima = h('button', { type: 'button', class: 'caderno-nav caderno-proxima', 'aria-label': T.proxima }, '›');
    const indicador = h('p', { class: 'caderno-indicador', 'aria-live': 'polite' });
    const livro = h('div', { class: 'caderno', role: 'dialog', 'aria-modal': 'true', 'aria-label': T.titulo },
      h('div', { class: 'caderno-topo' }, abas, fecharBtn), spread,
      h('div', { class: 'caderno-base' }, anterior, indicador, proxima));
    const fundo = h('div', { class: 'caderno-fundo' }, livro);

    // Duas páginas no desktop e no celular deitado; uma (com deslize) no celular em pé.
    const porVez = () => (window.innerWidth >= LARGURA_DUAS_PAGINAS || matchMedia('(orientation: landscape) and (max-height: 500px)').matches ? 2 : 1);

    function montarFolhas() {
      const l = liberados();
      if (aba === 'deuses') folhas = l.paginas.map((p) => folhaDeus(p, abrirImagem));
      else if (aba === 'anotacoes') folhas = folhasAnotacoes(l.anotacoes);
      else folhas = [folhaPerguntas(l.perguntas)];
    }

    function desenhar(som = false) {
      const n = porVez();
      indice = Math.max(0, Math.min(indice - (indice % n), Math.max(0, folhas.length - 1)));
      const visiveis = folhas.slice(indice, indice + n);
      spread.replaceChildren(...visiveis.map((f) => f.el()));
      if (n === 2 && visiveis.length === 1) spread.append(h('section', { class: 'caderno-pagina caderno-pagina-vazia', 'aria-hidden': 'true' }));
      spread.classList.toggle('duas', n === 2);
      for (const b of abas.children) {
        const sel = (b as HTMLElement).dataset.aba === aba;
        b.classList.toggle('ativa', sel);
        b.setAttribute('aria-selected', String(sel));
      }
      anterior.disabled = indice === 0;
      proxima.disabled = indice + n >= folhas.length;
      const pagina = Math.floor(indice / n) + 1;
      const total = Math.max(1, Math.ceil(folhas.length / n));
      indicador.textContent = fmt(T.pagina, 'm', { n: pagina, total });
      fundo.dataset.aba = aba;
      fundo.dataset.pagina = visiveis.map((f) => f.id).join(' ');
      marcarPaginasLidas(visiveis.map((f) => f.id));
      if (som) audio.sfx('compendio', { ganho: 0.6 });
    }

    function virar(passo: number) {
      const n = porVez();
      const novo = indice + passo * n;
      if (novo < 0 || novo >= folhas.length) return;
      indice = novo;
      spread.classList.remove('virando-esq', 'virando-dir');
      void spread.offsetWidth;
      spread.classList.add(passo > 0 ? 'virando-esq' : 'virando-dir');
      desenhar(true);
    }

    let imagemAberta: HTMLElement | null = null;
    function abrirImagem(p: PaginaCaderno) {
      const fechar = h('button', { type: 'button', class: 'caderno-imagem-fechar', 'aria-label': T.fecharImagem }, '×');
      const cheia = h('div', { class: 'caderno-imagem-cheia', role: 'dialog', 'aria-label': p.deus?.nome ?? '' },
        h('img', { src: src(`img/panteao/${p.imagem}.webp`), alt: p.deus?.nome ?? '', draggable: 'false' }),
        h('p', { class: 'caderno-imagem-nome' }, p.deus?.nome ?? ''), fechar);
      const sair = () => { cheia.remove(); imagemAberta = null; };
      cheia.addEventListener('click', sair);
      fundo.append(cheia);
      imagemAberta = cheia;
      fechar.focus({ preventScroll: true });
    }

    // Deslize no celular (uma página por vez).
    let x0: number | null = null, y0 = 0;
    spread.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
    spread.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) virar(dx < 0 ? 1 : -1);
    });
    spread.addEventListener('pointercancel', () => { x0 = null; });

    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (imagemAberta) imagemAberta.click(); else fechar(); }
      else if (e.key === 'ArrowRight' && !imagemAberta) { e.stopImmediatePropagation(); virar(1); }
      else if (e.key === 'ArrowLeft' && !imagemAberta) { e.stopImmediatePropagation(); virar(-1); }
    };
    const redimensionar = () => desenhar();

    function fechar() {
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('resize', redimensionar);
      fundo.classList.add('saindo');
      window.setTimeout(() => fundo.remove(), 200);
      aberto = null;
      audio.sfx('ui-back');
      resolver();
    }

    anterior.addEventListener('click', () => virar(-1));
    proxima.addEventListener('click', () => virar(1));
    fecharBtn.addEventListener('click', () => fechar());
    fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('resize', redimensionar);

    montarFolhas();
    if (o.pagina) {
      const k = folhas.findIndex((f) => f.id === o.pagina);
      if (k >= 0) indice = k;
    }
    desenhar();
    document.body.append(fundo);
    requestAnimationFrame(() => fundo.classList.add('visivel'));
    audio.sfx('compendio', { ganho: 0.6 });
    fecharBtn.focus({ preventScroll: true });
    aberto = { fechar };
  });
}

/** Para os testes: o que está na tela do caderno. */
export function estadoTelaCaderno() {
  const f = document.querySelector<HTMLElement>('.caderno-fundo');
  if (!f) return null;
  return { aba: f.dataset.aba, paginas: (f.dataset.pagina ?? '').split(' ').filter(Boolean), total: CADERNO.paginas.length };
}
