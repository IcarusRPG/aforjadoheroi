import { h } from '../core/ui';

/**
 * A "memória perturbada" (Fase 6, Ato I, Parte 2: a lembrança de Liessa), sobre o fundo do palco:
 * - "memoria": o brilho tremula, fragmentos retangulares da imagem se deslocam alguns pixels e voltam,
 *   grão de filme e cinzas caindo devagar;
 * - "memoria-nitida": tudo para; a imagem fica nítida e estável;
 * - "memoria-estilhaca": a imagem se estilhaça; os fragmentos voam e somem no preto, em 0,8 s.
 * Os fragmentos são cópias da própria imagem de fundo recortadas com clip-path, então ficam exatamente
 * no lugar. Com animações reduzidas, nada disso: só a imagem parada (e um fade para o preto no fim).
 */

export type ModoMemoria = 'memoria' | 'memoria-nitida' | 'memoria-estilhaca';

interface EstadoMemoria { fx: HTMLElement; timer: number; modo: ModoMemoria }
const estados = new WeakMap<HTMLElement, EstadoMemoria>();

const fundoVisivel = (palco: HTMLElement) => palco.querySelector<HTMLImageElement>('.cena-fundo.visivel');

function copia(palco: HTMLElement, ret: [number, number, number, number]): HTMLImageElement | null {
  const base = fundoVisivel(palco);
  if (!base?.src) return null;
  const c = base.cloneNode() as HTMLImageElement;
  c.className = 'cena-fundo visivel memoria-fragmento';
  const [x0, y0, x1, y1] = ret;
  c.style.clipPath = `inset(${y0}% ${100 - x1}% ${100 - y1}% ${x0}%)`;
  return c;
}

export function efeitoMemoria(palco: HTMLElement, modo: ModoMemoria, reduzidas: boolean): void {
  let e = estados.get(palco);
  if (!e) {
    const cinzas = h('div', { class: 'memoria-cinzas' });
    for (let i = 0; i < 16; i++) {
      const s = h('span', {});
      s.style.left = `${(i * 61) % 100}%`;
      s.style.animationDelay = `${-(i * 0.73) % 9}s`;
      s.style.animationDuration = `${7 + (i % 5)}s`;
      cinzas.append(s);
    }
    const fx = h('div', { class: 'memoria-fx' }, h('div', { class: 'memoria-grao' }), cinzas);
    const fundoB = palco.querySelectorAll('.cena-fundo');
    (fundoB[fundoB.length - 1] ?? palco.firstChild)?.after(fx);
    e = { fx, timer: 0, modo };
    estados.set(palco, e);
  }
  const st = e;
  st.modo = modo;
  window.clearInterval(st.timer);
  palco.dataset.memoria = modo;
  palco.classList.toggle('memoria-ativa', modo === 'memoria' && !reduzidas);
  palco.classList.toggle('memoria-reduzida', reduzidas);
  st.fx.querySelectorAll('.memoria-fragmento.falha').forEach((f) => f.remove());

  if (modo === 'memoria' && !reduzidas) {
    // De tempos em tempos, 1 a 3 fragmentos se deslocam alguns pixels e voltam.
    st.timer = window.setInterval(() => {
      if (!palco.isConnected) return window.clearInterval(st.timer);
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const x0 = Math.random() * 80, y0 = Math.random() * 80;
        const f = copia(palco, [x0, y0, x0 + 6 + Math.random() * 22, y0 + 3 + Math.random() * 10]);
        if (!f) continue;
        f.classList.add('falha');
        f.style.transform = `translate(${(Math.random() * 2 - 1) * 9}px, ${(Math.random() * 2 - 1) * 4}px)`;
        st.fx.append(f);
        window.setTimeout(() => f.remove(), 90 + Math.random() * 140);
      }
    }, 650);
  }

  if (modo === 'memoria-estilhaca') {
    const base = fundoVisivel(palco);
    if (reduzidas || !base) {
      palco.classList.add('memoria-apaga');
      return;
    }
    // Grade de cacos (6 × 4) que voam e somem no preto.
    const cacos: HTMLImageElement[] = [];
    for (let l = 0; l < 4; l++) for (let c = 0; c < 6; c++) {
      const f = copia(palco, [c * (100 / 6), l * 25, (c + 1) * (100 / 6), (l + 1) * 25]);
      if (f) { f.classList.add('caco'); cacos.push(f); st.fx.append(f); }
    }
    palco.classList.add('memoria-quebrada');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const f of cacos) {
        const dx = (Math.random() * 2 - 1) * 260, dy = (Math.random() * 2 - 1) * 180 + 80;
        f.style.transform = `translate(${dx}px, ${dy}px) rotate(${(Math.random() * 2 - 1) * 28}deg) scale(0.85)`;
        f.style.opacity = '0';
      }
    }));
  }
}

/** Para os testes: o estado do efeito no palco. */
export function estadoMemoria(palco: HTMLElement | null) {
  if (!palco) return null;
  return {
    modo: palco.dataset.memoria ?? null,
    ativa: palco.classList.contains('memoria-ativa'),
    quebrada: palco.classList.contains('memoria-quebrada') || palco.classList.contains('memoria-apaga'),
    cacos: palco.querySelectorAll('.memoria-fragmento.caco').length,
  };
}
