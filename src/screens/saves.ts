import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { classePorId, nomeDaClasse } from '../core/classes';
import { emCena, salvarManual } from '../core/estado';
import { racaPorId } from '../core/regras';
import {
  SLOTS, agora, apagarSlot, aplicarCopia, formatarData, formatarTempo, lerCopia, lerSlot, listarSlots, montarCopia,
  nomeArquivoCopia, tempoRelativo, type IdSlot, type InfoSlot, type MetaSave, type RegistroSave,
} from '../core/saves';
import { fmt, textos } from '../core/textos';
import { avisar } from '../core/toasts';
import { botao, confirmar, h } from '../core/ui';

/**
 * Telas de Salvar (menu de pausa) e Carregar (menu inicial), com os 3 cards: o automático em cima,
 * só para consulta ao salvar, e os dois manuais. Na tela Carregar, a cópia de segurança (exportar e
 * importar os 3 slots num arquivo .json).
 */

const T = () => textos.saves;

/* ------------------------------ textos do card ------------------------------ */

export const nomeCapitulo = (n: number): string => (n > 0 ? fmt(T().capitulo, 'm', { n: String(n).padStart(2, '0') }) : T().prologo);

function racaEClasse(m: MetaSave): string {
  const raca = racaPorId(m.raca)?.nome ?? m.raca;
  const c = classePorId(m.classe);
  return c ? `${raca} · ${nomeDaClasse(c, m.genero)}` : raca;
}

const capituloELocal = (m: MetaSave): string => [nomeCapitulo(m.capitulo), m.local].filter(Boolean).join(' · ');

/** "Thaelion · Capítulo 01 · há 3 dias" (embaixo do Continuar). */
export const resumoContinuar = (m: MetaSave): string =>
  fmt(textos.menu.continuarInfo, m.genero, { nome: m.nomeHeroi, capitulo: nomeCapitulo(m.capitulo), quando: tempoRelativo(m.salvoEm) });

/* ------------------------------ ícones ------------------------------ */

const svg = (d: string) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('class', 'save-icone');
  el.innerHTML = d;
  return el;
};
/** Engrenagem (automático). */
const iconeAuto = () => svg('<path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.7h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/>');
/** Pena (manual). */
const iconePena = () => svg('<path fill="currentColor" d="M20.7 3.3c-5.9.2-10.3 3-12.8 7.7l-1.5 3-1.9 1.9a1 1 0 0 0 0 1.4l.2.2-1.9 1.9 1.4 1.4 1.9-1.9.2.2a1 1 0 0 0 1.4 0l1.9-1.9 3-1.5c4.7-2.5 7.5-6.9 7.7-12.8zM9.4 14.6l-.9-.9 1.1-2.2 1.7-.4-.3 1.7z"/>');

/* ------------------------------ card ------------------------------ */

function selo(slot: IdSlot): HTMLElement {
  return slot === 'auto'
    ? h('p', { class: 'save-selo' }, iconeAuto(), T().auto)
    : h('p', { class: 'save-selo' }, iconePena(), fmt(T().manual, 'm', { n: slot === 'manual1' ? '1' : '2' }));
}

/** Card de um slot (ocupado, vazio ou danificado), com os botões passados. */
export function cardSave(info: InfoSlot, acoes: Node[] = [], aviso?: string): HTMLElement {
  const tipo = info.slot === 'auto' ? 'auto' : 'manual';
  const card = h('article', { class: `save-card ${tipo} ${info.estado}`, 'data-slot': info.slot, 'aria-label': T().nomeSlot[info.slot] });
  if (info.estado === 'vazio') {
    card.append(h('div', { class: 'save-busto save-busto-vazio', 'aria-hidden': 'true' }),
      h('div', { class: 'save-info' }, selo(info.slot), h('p', { class: 'save-nome' }, T().vazio), aviso ? h('p', { class: 'save-aviso' }, aviso) : null));
  } else if (info.estado === 'danificado') {
    card.append(h('div', { class: 'save-busto save-busto-vazio', 'aria-hidden': 'true' }, '!'),
      h('div', { class: 'save-info' }, selo(info.slot), h('p', { class: 'save-nome' }, T().danificado), h('p', { class: 'save-detalhe' }, T().danificadoInfo)));
  } else {
    const m = info.meta;
    card.append(
      h('div', { class: 'save-retratos' },
        h('img', { class: 'save-busto', src: src(ASSETS.bustoHeroi(m.raca, m.genero)), alt: '', draggable: 'false' }),
        h('img', { class: 'save-dado', src: src(`img/dados/${m.dado ?? 'azul'}-128.webp`), alt: '', 'data-dado': m.dado ?? 'azul', draggable: 'false' })),
      h('div', { class: 'save-info' },
        selo(info.slot),
        h('p', { class: 'save-nome' }, m.nomeHeroi),
        h('p', { class: 'save-detalhe' }, racaEClasse(m)),
        h('p', { class: 'save-detalhe save-local' }, capituloELocal(m)),
        h('p', { class: 'save-detalhe save-tempo' }, fmt(T().deJogo, 'm', { tempo: formatarTempo(m.tempoDeJogo) })),
        h('p', { class: 'save-detalhe save-data' }, `${formatarData(m.salvoEm)} · ${tempoRelativo(m.salvoEm)}`),
        h('p', { class: 'save-apoio' }, tipo === 'auto' ? T().apoioAuto : T().apoioManual),
        aviso ? h('p', { class: 'save-aviso' }, aviso) : null,
      ),
    );
  }
  if (acoes.length) card.append(h('div', { class: 'save-acoes' }, ...acoes));
  return card;
}

/* ------------------------------ moldura (tela cheia no celular) ------------------------------ */

function abrirPainel(titulo: string, classe: string): { corpo: HTMLElement; rodape: HTMLElement; fechar: () => void } {
  const anterior = document.activeElement as HTMLElement | null;
  const fechar = () => {
    window.removeEventListener('keydown', teclado);
    fundo.classList.add('saindo');
    setTimeout(() => fundo.remove(), 220);
    anterior?.focus?.();
  };
  const teclado = (e: KeyboardEvent) => {
    // Uma confirmação aberta por cima cuida do próprio Esc.
    if (e.key === 'Escape' && !document.querySelector('.confirmar-fundo')) { audio.sfx('ui-back'); fechar(); }
  };
  const btnFechar = botao(T().fechar, fechar, { som: 'ui-back', classe: 'saves-fechar' });
  const corpo = h('div', { class: 'saves-lista' });
  const rodape = h('div', { class: 'saves-rodape' });
  const caixa = h('section', { class: `saves ${classe}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    h('header', { class: 'saves-topo' }, h('h2', {}, titulo), btnFechar), corpo, rodape);
  const fundo = h('div', { class: 'saves-fundo' }, caixa);
  window.addEventListener('keydown', teclado);
  document.body.append(fundo);
  btnFechar.focus({ preventScroll: true });
  return { corpo, rodape, fechar };
}

/* ------------------------------ Salvar ------------------------------ */

/** Tela Salvar (menu de pausa). No meio de uma cena, o save volta ao começo dela. */
export function abrirSalvar(): void {
  audio.sfx('ui-click');
  const { corpo } = abrirPainel(T().tituloSalvar, 'saves-salvar');
  const aviso = emCena() ? T().inicioCena : undefined;
  const montar = (piscar?: IdSlot) => {
    corpo.replaceChildren(...SLOTS.map((slot) => {
      const info = lerSlot(slot);
      if (slot === 'auto') return cardSave(info);
      const card = cardSave(info, [botao(T().salvarAqui, () => void salvarEm(slot), { classe: 'btn-principal save-btn-salvar' })], aviso);
      if (slot === piscar) card.classList.add('piscando');
      return card;
    }));
  };
  const salvarEm = async (slot: Exclude<IdSlot, 'auto'>) => {
    const atual = lerSlot(slot);
    if (atual.estado === 'ok') {
      const m = atual.meta;
      const sim = await confirmar({
        texto: fmt(T().substituirPergunta, m.genero, { nome: m.nomeHeroi, capitulo: nomeCapitulo(m.capitulo), local: m.local || '—', quando: tempoRelativo(m.salvoEm) }),
        ok: T().substituir, cancelar: T().cancelar, classe: 'confirmar-substituir',
      });
      if (!sim) return;
    }
    if (!salvarManual(slot)) { avisar(T().falhou, 'toast-erro'); return; }
    audio.sfx('salvar');
    avisar(fmt(T().salvo, 'm', { slot: T().nomeSlot[slot] }));
    montar(slot);
  };
  montar();
}

/* ------------------------------ Carregar ------------------------------ */

/** Tela Carregar (menu inicial). `aoCarregar` recebe o slot escolhido (o jogo carrega e retoma). */
export function abrirCarregar(aoCarregar: (slot: IdSlot) => void): void {
  audio.sfx('ui-click');
  const painel = abrirPainel(T().tituloCarregar, 'saves-carregar');
  const { corpo, rodape } = painel;
  const montar = () => {
    corpo.replaceChildren(...listarSlots().map((info) => {
      const acoes: HTMLElement[] = [];
      if (info.estado === 'ok') acoes.push(botao(T().carregar, () => { painel.fechar(); aoCarregar(info.slot); }, { classe: 'btn-principal save-btn-carregar', som: 'ui-confirm' }));
      // Os manuais (e qualquer save danificado) podem ser apagados; o automático é do jogo.
      if (info.estado === 'danificado' || (info.estado === 'ok' && info.slot !== 'auto')) {
        acoes.push(botao(T().apagar, async () => {
          if (!(await confirmar({ texto: T().apagarPergunta, ok: T().apagar, cancelar: T().cancelar, perigo: true, classe: 'confirmar-apagar' }))) return;
          apagarSlot(info.slot);
          montar();
        }, { classe: 'save-btn-apagar' }));
      }
      return cardSave(info, acoes);
    }));
  };
  const link = h('button', { type: 'button', class: 'saves-link' }, T().copia);
  link.addEventListener('click', () => abrirCopia(montar));
  rodape.append(link);
  montar();
}

/* ------------------------------ cópia de segurança ------------------------------ */

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const a = h('a', { href: url, download: nome, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Cópia de segurança (exportar e importar). Também aberta do menu inicial quando não há saves. */
export function abrirCopia(aoMudar: () => void): void {
  const painel = abrirPainel(T().copiaTitulo, 'saves-copia');
  const arquivo = h('input', { type: 'file', accept: 'application/json,.json', class: 'saves-arquivo', hidden: true }) as HTMLInputElement;
  const erro = h('p', { class: 'saves-erro', role: 'alert', hidden: true }, T().invalido);
  painel.corpo.append(
    h('p', { class: 'saves-texto' }, T().copiaTexto),
    botao(T().exportar, () => baixar(nomeArquivoCopia(agora()), JSON.stringify(montarCopia(), null, 1)), { classe: 'btn-principal saves-exportar' }),
    botao(T().importar, () => { erro.hidden = true; arquivo.value = ''; arquivo.click(); }, { classe: 'saves-importar' }),
    arquivo, erro,
  );
  arquivo.addEventListener('change', async () => {
    const f = arquivo.files?.[0];
    if (!f) return;
    const copia = lerCopia(await f.text());
    if (!copia) { erro.hidden = false; audio.sfx('ui-locked'); return; }
    const lista = h('div', { class: 'saves-lista saves-previa' },
      ...SLOTS.map((s) => {
        const r: RegistroSave | null = copia.slots[s];
        return cardSave(r ? { slot: s, estado: 'ok', meta: r.meta, registro: r } : { slot: s, estado: 'vazio' });
      }));
    const sim = await confirmar({ texto: h('div', {}, h('p', {}, T().importarPergunta), lista), ok: T().substituir, cancelar: T().cancelar, classe: 'confirmar-importar' });
    if (!sim) return;
    aplicarCopia(copia);
    avisar(T().importarOk);
    painel.fechar();
    aoMudar();
  });
}
