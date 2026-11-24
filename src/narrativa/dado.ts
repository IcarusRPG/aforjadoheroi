import DADOS from '../data/dados.json';
import { src } from '../core/assets';
import { audio } from '../core/audio';
import { animacoesReduzidas, getEstado } from '../core/estado';
import { h } from '../core/ui';

/**
 * O d20 animado (Fase 5), com a imagem do dado escolhido (Opções → Dado; padrão azul). O resultado é
 * sorteado ANTES; a animação só encena o número:
 *   1. lançamento (~0,2 s): entra de baixo num arco, com a sombra oval no "chão";
 *   2. giro (~0,9 s): gira desacelerando, com o "tombo" falso (scaleX 1 ↔ 0,55), borrão no começo e
 *      números aleatórios piscando na face a cada tombo;
 *   3. quique (~0,3 s): dois saltos que diminuem ("toc" em cada um);
 *   4. resultado: o número grande na face, com um pulso. 20 natural: brilho dourado, partículas e
 *      "CRÍTICO!"; 1 natural: vermelho escuro, tremor curto e "FALHA!".
 * Um toque durante a animação pula para o resultado. Com "Animações reduzidas": só um fade.
 */

export interface DefDado { id: string; nome: string; imagem: string }
export const LISTA_DADOS = (DADOS as { padrao: string; dados: DefDado[] }).dados;
export const DADO_PADRAO = (DADOS as { padrao: string }).padrao;

export const dadoEscolhido = (): DefDado => LISTA_DADOS.find((d) => d.id === getEstado().config.dado) ?? LISTA_DADOS.find((d) => d.id === DADO_PADRAO)!;

/** URL da imagem do dado no tamanho mais próximo (500, 256 ou 128 px). */
export function imagemDoDado(d: DefDado, px: number): string {
  const sufixo = px <= 128 ? '-128' : px <= 256 ? '-256' : '';
  return src(`${d.imagem}${sufixo}.webp`);
}

export interface Dado {
  el: HTMLElement;
  /** Anima até `valor`. Resolve quando o número final está na face. */
  rolar(valor: number, o?: { curto?: boolean; silencioso?: boolean }): Promise<void>;
  /** Pula a animação (o número final aparece na hora). */
  pular(): void;
}

const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Cria um dado. `tamanho` em px; `cinza` para o dado de um adversário (o da Nyme na Rasteira);
 * `dado` para forçar um modelo (a prévia das Opções e da criação).
 */
export function criarDado(o: { tamanho?: number; cinza?: boolean; dado?: DefDado; classe?: string } = {}): Dado {
  const tamanho = o.tamanho ?? 132;
  const def = o.dado ?? dadoEscolhido();
  const numero = h('span', { class: 'dado-numero', 'aria-hidden': 'true' });
  const img = h('img', { class: 'dado-img', src: imagemDoDado(def, tamanho * (window.devicePixelRatio || 1)), alt: '', draggable: 'false' });
  const corpo = h('div', { class: 'dado-corpo' }, img, numero);
  const sombra = h('div', { class: 'dado-sombra' });
  const destaque = h('span', { class: 'dado-destaque', hidden: true });
  const brilho = h('div', { class: 'dado-brilho' });
  const el = h('div', { class: `dado${o.cinza ? ' dado-cinza' : ''}${o.classe ? ` ${o.classe}` : ''}`, 'data-dado': def.id, role: 'img', 'aria-label': 'd20' },
    sombra, brilho, corpo, destaque);
  el.style.setProperty('--tam', `${tamanho}px`);

  let pularAgora: (() => void) | null = null;
  const animacoes: Animation[] = [];
  const anima = (alvo: Element, k: Keyframe[], opt: KeyframeAnimationOptions) => {
    const a = alvo.animate(k, { fill: 'forwards', ...opt });
    animacoes.push(a);
    return a.finished.catch(() => {});
  };

  function finalizar(valor: number) {
    for (const a of animacoes.splice(0)) a.cancel();
    numero.textContent = String(valor);
    el.dataset.valor = String(valor);
    corpo.style.transform = '';
    corpo.style.filter = '';
    el.classList.remove('rolando');
    el.classList.add('parado');
    el.classList.toggle('dado-critico', valor === 20);
    el.classList.toggle('dado-falha', valor === 1);
    destaque.hidden = valor !== 20 && valor !== 1;
    destaque.textContent = valor === 20 ? 'CRÍTICO!' : valor === 1 ? 'FALHA!' : '';
    if (valor === 20 || valor === 1) el.setAttribute('aria-label', `d20: ${valor}, ${destaque.textContent}`);
    else el.setAttribute('aria-label', `d20: ${valor}`);
    // Pulso do número; partículas no crítico; tremor na falha.
    corpo.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
    if (valor === 20) faiscas();
    if (valor === 1) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 300 });
  }

  function faiscas() {
    for (let i = 0; i < 14; i++) {
      const f = h('span', { class: 'dado-faisca' });
      el.append(f);
      const ang = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
      const r = tamanho * (0.55 + Math.random() * 0.35);
      f.animate([{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * r}px), calc(-50% + ${Math.sin(ang) * r}px)) scale(0.3)`, opacity: 0 }],
        { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' }).finished.then(() => f.remove(), () => f.remove());
    }
  }

  async function rolar(valor: number, op: { curto?: boolean; silencioso?: boolean } = {}) {
    el.classList.remove('parado', 'dado-critico', 'dado-falha');
    destaque.hidden = true;
    el.dataset.valor = '';
    if (animacoesReduzidas()) {
      numero.textContent = '';
      el.classList.add('rolando');
      await anima(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
      finalizar(valor);
      return;
    }
    el.classList.add('rolando');
    let pulou = false;
    const pulo = new Promise<void>((ok) => { pularAgora = () => { pulou = true; ok(); }; });
    // Espaço e Enter também pulam (PC). Na captura, para a tecla não avançar a cena junto.
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      pularAgora?.();
    };
    window.addEventListener('keydown', tecla, true);
    const k = op.curto ? 0.6 : 1;
    if (!op.silencioso) audio.sfx('dice-roll', { ganho: 0.8 });
    const encenar = async () => {
      // 1. Lançamento: de baixo, num arco.
      void anima(sombra, [{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 0.45 }], { duration: 200 * k });
      await anima(corpo, [
        { transform: 'translate(-30%, 90%) rotate(-40deg) scale(0.6)', opacity: 0, filter: 'blur(2px)' },
        { transform: 'translate(-10%, -25%) rotate(40deg) scale(0.9)', opacity: 1, offset: 0.6, filter: 'blur(2px)' },
        { transform: 'translate(0, 0) rotate(90deg) scale(1)', opacity: 1, filter: 'blur(1.5px)' },
      ], { duration: 200 * k, easing: 'ease-out' });
      if (pulou) return;
      // 2. Giro: desacelera; "tombos" com scaleX e um número novo a cada um.
      const voltas = 5;
      const tombos = 6;
      const giro = 900 * k;
      void anima(corpo, Array.from({ length: tombos * 2 + 1 }, (_, i) => {
        const t = i / (tombos * 2);
        const ang = 90 + (360 * voltas - 90) * (1 - (1 - t) ** 3);
        return { transform: `rotate(${ang}deg) scaleX(${i % 2 ? 0.55 : 1})`, filter: `blur(${Math.max(0, 1.5 - t * 4)}px)` };
      }), { duration: giro, easing: 'linear' });
      for (let i = 0; i < tombos && !pulou; i++) {
        numero.textContent = String(1 + Math.floor(Math.random() * 20));
        // Os tombos ficam mais lentos (desaceleração).
        await Promise.race([esperar((giro / tombos) * (0.55 + (i / tombos) * 0.9)), pulo]);
      }
      if (pulou) return;
      numero.textContent = String(valor);
      // 3. Quique: dois saltos menores, parando reto.
      for (const [alt, dur] of [[0.16, 170 * k], [0.06, 130 * k]] as const) {
        if (pulou) return;
        await anima(corpo, [{ transform: 'translateY(0)' }, { transform: `translateY(${-alt * tamanho}px)` }, { transform: 'translateY(0)' }], { duration: dur, easing: 'ease-in-out' });
        if (!op.silencioso && !pulou) audio.sfx('dado-toc', { ganho: 0.7 });
      }
    };
    await Promise.race([encenar(), pulo]);
    window.removeEventListener('keydown', tecla, true);
    pularAgora = null;
    finalizar(valor);
  }

  return { el, rolar, pular: () => pularAgora?.() };
}
