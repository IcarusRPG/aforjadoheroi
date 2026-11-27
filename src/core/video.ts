import { audio } from './audio';
import type { Tela } from './telas';
import { ehToque, textos } from './textos';
import { h } from './ui';
import { turbo } from './turbo';

/** Segundos até liberar o "pular". */
export const SEGUNDOS_PARA_PULAR = 5;
const segundosParaPular = (): number => (turbo() ? 0.3 : SEGUNDOS_PARA_PULAR);

/**
 * Regra de pular compartilhada: antes de `liberar()`, cliques e teclas não fazem nada;
 * depois, um clique/toque em qualquer ponto, Esc ou Espaço chamam `aoPular`.
 */
function regraDePular(area: HTMLElement, aoPular: () => void) {
  let liberado = false;
  const dica = h('div', { class: 'dica-pular', 'aria-live': 'polite' }, ehToque() ? textos.video.pularToque : textos.video.pular);
  const clique = (e: PointerEvent) => {
    if (!liberado || (e.pointerType === 'mouse' && e.button !== 0)) return;
    aoPular();
  };
  const tecla = (e: KeyboardEvent) => {
    if (!liberado || (e.key !== 'Escape' && e.key !== ' ' && e.code !== 'Space')) return;
    e.preventDefault();
    aoPular();
  };
  area.addEventListener('pointerup', clique);
  window.addEventListener('keydown', tecla);
  return {
    dica,
    get liberado() {
      return liberado;
    },
    liberar() {
      if (liberado) return;
      liberado = true;
      dica.classList.add('visivel');
    },
    destruir() {
      area.removeEventListener('pointerup', clique);
      window.removeEventListener('keydown', tecla);
    },
  };
}

export interface OpcoesVideo {
  /** URL do vídeo, ou um <video> já criado (e talvez já tocando, como na abertura). */
  video: string | HTMLVideoElement;
  aoTerminar: () => void;
  /** Se o vídeo não carregar ou não puder tocar. Padrão: o mesmo que aoTerminar. */
  aoFalhar?: () => void;
}

/** Tela de vídeo em tela cheia, com a regra dos 5 s para pular. Reutilizada na abertura e no prólogo. */
export function telaVideo(opcoes: OpcoesVideo): Tela {
  const video = typeof opcoes.video === 'string' ? criarElementoVideo(opcoes.video) : opcoes.video;
  const el = h('div', { class: 'tela-video' }, video);
  let encerrado = false;
  const encerrar = (falhou = false) => {
    if (encerrado) return;
    encerrado = true;
    pulo.destruir();
    (falhou ? opcoes.aoFalhar ?? opcoes.aoTerminar : opcoes.aoTerminar)();
  };
  const pulo = regraDePular(el, () => encerrar());
  el.append(pulo.dica);

  const tempo = () => {
    if (video.currentTime >= segundosParaPular()) pulo.liberar();
  };
  const fim = () => encerrar();
  const erro = () => {
    console.warn('Vídeo falhou ao carregar.', video.error);
    encerrar(true);
  };
  video.addEventListener('timeupdate', tempo);
  video.addEventListener('ended', fim);
  video.addEventListener('error', erro);
  if (video.error) queueMicrotask(erro);
  const desregistrar = audio.registrarVideo(video);

  return {
    el,
    aoEntrar() {
      if (video.paused && !video.ended) {
        video.play().catch((e) => {
          console.warn('O navegador não deixou o vídeo tocar.', e);
          encerrar(true);
        });
      }
    },
    aoSair() {
      encerrado = true;
      pulo.destruir();
      video.removeEventListener('timeupdate', tempo);
      video.removeEventListener('ended', fim);
      video.removeEventListener('error', erro);
      video.pause();
      desregistrar();
    },
  };
}

export function criarElementoVideo(url: string): HTMLVideoElement {
  const v = h('video', { class: 'video-cheio', playsinline: true, preload: 'auto' });
  v.setAttribute('webkit-playsinline', '');
  v.src = url;
  return v;
}

export interface OpcoesSequencia {
  linhas: string[];
  aoTerminar: () => void;
  /** Tempo de cada linha, em ms. */
  msPorLinha?: number;
}

/** Fallback do vídeo: tela preta com as linhas aparecendo uma a uma, com a mesma regra de pular. */
export function telaSequenciaTexto(opcoes: OpcoesSequencia): Tela {
  const { linhas, msPorLinha = 3000 } = opcoes;
  const caixa = h('div', { class: 'sequencia-linhas' });
  const el = h('div', { class: 'tela-video tela-sequencia' }, caixa);
  const timers: number[] = [];
  let encerrado = false;
  const encerrar = () => {
    if (encerrado) return;
    encerrado = true;
    timers.forEach(clearTimeout);
    pulo.destruir();
    opcoes.aoTerminar();
  };
  const pulo = regraDePular(el, encerrar);
  el.append(pulo.dica);

  return {
    el,
    aoEntrar() {
      timers.push(window.setTimeout(() => pulo.liberar(), segundosParaPular() * 1000));
      linhas.forEach((texto, i) => {
        timers.push(window.setTimeout(() => {
          const linha = h('p', { class: 'sequencia-linha' }, texto);
          if (i === linhas.length - 1) linha.classList.add('final');
          caixa.append(linha);
          requestAnimationFrame(() => linha.classList.add('visivel'));
        }, 800 + i * msPorLinha));
      });
      const fim = 800 + linhas.length * msPorLinha + 2500;
      timers.push(window.setTimeout(() => caixa.classList.add('apagando'), fim - 1500));
      timers.push(window.setTimeout(encerrar, fim));
    },
    aoSair() {
      encerrado = true;
      timers.forEach(clearTimeout);
      pulo.destruir();
    },
  };
}
