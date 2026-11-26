// Sintetiza efeitos sonoros provisórios (.wav, 16 bits, mono, 44,1 kHz) em public/assets/sfx/.
// Serão trocados por versões definitivas; os nomes dos arquivos são estáveis.
// Uso: npm run sfx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'assets', 'sfx');
const SR = 44100;
const TAU = Math.PI * 2;

// Gerador pseudoaleatório determinístico: o mesmo script gera sempre os mesmos arquivos.
let seed = 1234567;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

const buffer = (seg) => new Float32Array(Math.ceil(seg * SR));

/** Envelope ataque/decaimento exponencial. */
const env = (t, ataque, decai) => (t < ataque ? t / ataque : Math.exp(-(t - ataque) / decai));

/** Soma um tom (com parciais) ao buffer. */
function tom(buf, { inicio = 0, freq, freqFim = freq, dur, amp = 0.5, ataque = 0.005, decai = 0.1, parciais = [[1, 1]], forma = 'sin' }) {
  const i0 = Math.floor(inicio * SR);
  const n = Math.min(buf.length - i0, Math.floor(dur * SR));
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = freq * Math.pow(freqFim / freq, t / dur);
    fase += f / SR;
    let s = 0;
    for (const [mult, a] of parciais) {
      const x = TAU * fase * mult;
      s += a * (forma === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(x)) : Math.sin(x));
    }
    buf[i0 + i] += amp * s * env(t, ataque, decai);
  }
}

/** Soma ruído filtrado (passa-baixa de 1 polo, com corte que pode varrer). */
function ruido(buf, { inicio = 0, dur, amp = 0.3, ataque = 0.005, decai = 0.05, corte = 2000, corteFim = corte, passaAlta = 0 }) {
  const i0 = Math.floor(inicio * SR);
  const n = Math.min(buf.length - i0, Math.floor(dur * SR));
  let lp = 0, hpPrev = 0, hp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fc = corte * Math.pow(corteFim / corte, t / dur);
    const a = 1 - Math.exp(-TAU * fc / SR);
    lp += a * (rand() - lp);
    let s = lp;
    if (passaAlta) {
      const b = Math.exp(-TAU * passaAlta / SR);
      hp = b * (hp + s - hpPrev);
      hpPrev = s;
      s = hp;
    }
    buf[i0 + i] += amp * s * env(t, ataque, decai);
  }
}

function normalizar(buf, pico = 0.85) {
  let max = 0;
  for (const s of buf) max = Math.max(max, Math.abs(s));
  if (max > 0) for (let i = 0; i < buf.length; i++) buf[i] *= pico / max;
  // Fade-out final de 5 ms para nunca terminar com estalo.
  const f = Math.floor(0.005 * SR);
  for (let i = 0; i < f; i++) buf[buf.length - 1 - i] *= i / f;
  return buf;
}

function wav(buf) {
  const dados = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) dados.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + dados.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(dados.length, 40);
  return Buffer.concat([h, dados]);
}

const sinos = [[1, 1], [2.76, 0.4], [5.4, 0.2]];
const efeitos = {
  // Tique metálico muito leve
  'ui-hover': (pico) => {
    const b = buffer(0.08);
    tom(b, { freq: 3200, dur: 0.08, amp: 0.25, ataque: 0.001, decai: 0.015, parciais: sinos });
    ruido(b, { dur: 0.02, amp: 0.1, decai: 0.004, corte: 9000, passaAlta: 3000 });
    return normalizar(b, 0.35);
  },
  // Clique de madeira e metal
  'ui-click': () => {
    const b = buffer(0.14);
    ruido(b, { dur: 0.05, amp: 0.8, ataque: 0.001, decai: 0.01, corte: 2500, passaAlta: 300 });
    tom(b, { freq: 420, freqFim: 380, dur: 0.08, amp: 0.6, ataque: 0.001, decai: 0.02, forma: 'tri' });
    tom(b, { freq: 2100, dur: 0.14, amp: 0.15, ataque: 0.001, decai: 0.04, parciais: sinos });
    return normalizar(b, 0.6);
  },
  // Acorde curto ascendente, brilhante
  'ui-confirm': () => {
    const b = buffer(0.5);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tom(b, { inicio: i * 0.045, freq: f, dur: 0.45 - i * 0.045, amp: 0.3, ataque: 0.004, decai: 0.16, parciais: [[1, 1], [2, 0.3], [3, 0.1]] }));
    return normalizar(b, 0.6);
  },
  // Tom curto descendente
  'ui-back': () => {
    const b = buffer(0.25);
    tom(b, { freq: 660, freqFim: 392, dur: 0.25, amp: 0.5, ataque: 0.004, decai: 0.08, parciais: [[1, 1], [2, 0.2]] });
    return normalizar(b, 0.55);
  },
  // Batida abafada, grave
  'ui-locked': () => {
    const b = buffer(0.3);
    tom(b, { freq: 110, freqFim: 70, dur: 0.3, amp: 0.9, ataque: 0.002, decai: 0.07 });
    ruido(b, { dur: 0.08, amp: 0.5, ataque: 0.001, decai: 0.02, corte: 400 });
    return normalizar(b, 0.7);
  },
  // Plim agudo
  'point-up': () => {
    const b = buffer(0.3);
    tom(b, { freq: 1318.5, dur: 0.3, amp: 0.5, ataque: 0.002, decai: 0.08, parciais: sinos });
    return normalizar(b, 0.5);
  },
  // Plim grave
  'point-down': () => {
    const b = buffer(0.3);
    tom(b, { freq: 659.25, dur: 0.3, amp: 0.5, ataque: 0.002, decai: 0.08, parciais: sinos });
    return normalizar(b, 0.5);
  },
  // Gongo suave com cauda longa
  'start': () => {
    const b = buffer(4.5);
    const parciais = [[1, 1], [1.48, 0.5], [2.02, 0.45], [2.74, 0.25], [3.6, 0.15], [4.9, 0.08]];
    tom(b, { freq: 98, freqFim: 96, dur: 4.5, amp: 0.7, ataque: 0.02, decai: 1.3, parciais });
    tom(b, { freq: 196.5, dur: 4.5, amp: 0.15, ataque: 0.05, decai: 0.9 });
    ruido(b, { dur: 0.25, amp: 0.25, ataque: 0.002, decai: 0.06, corte: 1500 });
    return normalizar(b, 0.75);
  },
  // Brilho mágico ascendente (~1,5 s)
  'hero-confirm': () => {
    const b = buffer(1.8);
    const escala = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568, 1760, 2093];
    escala.forEach((f, i) =>
      tom(b, { inicio: i * 0.09, freq: f, dur: 1.8 - i * 0.09, amp: 0.22, ataque: 0.005, decai: 0.35, parciais: sinos }));
    tom(b, { freq: 261.63, dur: 1.8, amp: 0.25, ataque: 0.4, decai: 0.6, parciais: [[1, 1], [1.5, 0.5], [2, 0.4]] });
    ruido(b, { dur: 1.6, amp: 0.08, ataque: 1.0, decai: 0.3, corte: 6000, corteFim: 12000, passaAlta: 4000 });
    return normalizar(b, 0.7);
  },
  // Whoosh de ar suave
  'transition': () => {
    const b = buffer(0.7);
    ruido(b, { dur: 0.7, amp: 0.8, ataque: 0.3, decai: 0.15, corte: 300, corteFim: 2500, passaAlta: 150 });
    return normalizar(b, 0.4);
  },

  /* ----- Sonho dos deuses ----- */

  // Passo no mármore: toque leve e limpo (a variação de tom é feita no jogo, pela velocidade)
  'step-marble': () => {
    const b = buffer(0.12);
    ruido(b, { dur: 0.05, amp: 0.7, ataque: 0.001, decai: 0.008, corte: 6000, passaAlta: 1200 });
    tom(b, { freq: 1050, freqFim: 980, dur: 0.1, amp: 0.35, ataque: 0.001, decai: 0.018, forma: 'tri' });
    tom(b, { freq: 2600, dur: 0.12, amp: 0.08, ataque: 0.001, decai: 0.03, parciais: sinos });
    return normalizar(b, 0.4);
  },
  // Shimmer suave e curto ao se aproximar de uma estátua
  'statue-glow': () => {
    const b = buffer(1.1);
    [1760, 2217.46, 2637.02, 3520].forEach((f, i) =>
      tom(b, { inicio: i * 0.06, freq: f, freqFim: f * 1.01, dur: 1.0, amp: 0.18, ataque: 0.12, decai: 0.22, parciais: [[1, 1], [2.01, 0.25]] }));
    ruido(b, { dur: 0.9, amp: 0.06, ataque: 0.2, decai: 0.25, corte: 9000, passaAlta: 5000 });
    return normalizar(b, 0.45);
  },
  // Acorde de sino cristalino, com cauda longa
  'statue-awaken': () => {
    const b = buffer(4);
    [880, 1108.73, 1318.51, 1760, 2217.46].forEach((f, i) =>
      tom(b, { inicio: i * 0.035, freq: f, dur: 3.9 - i * 0.035, amp: 0.28, ataque: 0.002, decai: 1.1 - i * 0.12, parciais: [[1, 1], [2.76, 0.35], [5.4, 0.15], [8.93, 0.06]] }));
    tom(b, { freq: 220, dur: 4, amp: 0.2, ataque: 0.3, decai: 1.2, parciais: [[1, 1], [1.5, 0.4], [2, 0.3]] });
    ruido(b, { dur: 0.3, amp: 0.12, ataque: 0.002, decai: 0.05, corte: 10000, passaAlta: 6000 });
    return normalizar(b, 0.7);
  },
  // Acorde coral sintetizado, crescendo (~4 s)
  'divine-chord': () => {
    const b = buffer(4.4);
    const coro = [[1, 1], [2, 0.45], [3, 0.25], [4, 0.12], [5, 0.08], [6, 0.04]];
    for (const f of [146.83, 220, 293.66, 369.99, 440, 587.33]) {
      for (const desafino of [0.996, 1, 1.004]) {
        tom(b, { freq: f * desafino, freqFim: f * desafino * 1.002, dur: 4.4, amp: 0.07, ataque: 3.1, decai: 0.7, parciais: coro });
      }
    }
    // Respiração do coro
    ruido(b, { dur: 4.2, amp: 0.05, ataque: 3.0, decai: 0.6, corte: 2500, passaAlta: 600 });
    return normalizar(b, 0.75);
  },
  // Estrondo grave com estalo inicial (~2,5 s)
  'thunder': () => {
    const b = buffer(2.6);
    ruido(b, { dur: 0.12, amp: 1, ataque: 0.001, decai: 0.025, corte: 9000, passaAlta: 800 });
    ruido(b, { inicio: 0.02, dur: 2.5, amp: 1.4, ataque: 0.04, decai: 0.75, corte: 260, corteFim: 120 });
    ruido(b, { inicio: 0.35, dur: 2.1, amp: 0.9, ataque: 0.1, decai: 0.6, corte: 180, corteFim: 90 });
    tom(b, { freq: 52, freqFim: 38, dur: 2.4, amp: 0.6, ataque: 0.03, decai: 0.7 });
    return normalizar(b, 0.9);
  },
  // Blip muito curto e baixo, para as letras na caixa de fala
  'text-blip': () => {
    const b = buffer(0.045);
    tom(b, { freq: 1250, dur: 0.045, amp: 0.4, ataque: 0.001, decai: 0.009, forma: 'tri' });
    return normalizar(b, 0.22);
  },
  // Tremor de terra: ronco grave e curto (~1 s), com um baque no começo
  'tremor': () => {
    const b = buffer(1.1);
    ruido(b, { dur: 1.05, amp: 1.2, ataque: 0.06, decai: 0.32, corte: 150, corteFim: 70 });
    ruido(b, { inicio: 0.02, dur: 0.25, amp: 0.5, ataque: 0.004, decai: 0.06, corte: 600, corteFim: 200 });
    tom(b, { freq: 46, freqFim: 34, dur: 1.0, amp: 0.55, ataque: 0.05, decai: 0.3 });
    return normalizar(b, 0.8);
  },

  // ---------- Capítulo 01 ----------
  // d20 rolando na mesa: batidinhas de madeira que vão espaçando, e o assentar final (~1 s)
  'dice-roll': () => {
    const b = buffer(1.1);
    let t = 0, intervalo = 0.045;
    while (t < 0.9) {
      const f = 1400 + rand() * 900;
      ruido(b, { inicio: t, dur: 0.05, amp: 0.55, ataque: 0.001, decai: 0.012, corte: 5000, passaAlta: 700 });
      tom(b, { inicio: t, freq: f, freqFim: f * 0.8, dur: 0.05, amp: 0.25, ataque: 0.001, decai: 0.015, forma: 'tri' });
      t += intervalo;
      intervalo *= 1.16;
    }
    ruido(b, { inicio: 0.95, dur: 0.12, amp: 0.7, ataque: 0.001, decai: 0.03, corte: 2500, passaAlta: 300 });
    return normalizar(b, 0.7);
  },
  // Grito agudo de criança, curto (~0,8 s): vogal aguda com vibrato e ruído de fôlego
  'grito-crianca': () => {
    const b = buffer(0.85);
    const n = b.length;
    let fase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = 980 + 260 * Math.sin(Math.min(1, t / 0.12) * Math.PI / 2) - 180 * (t / 0.85) + 18 * Math.sin(TAU * 7 * t);
      fase += f / SR;
      const x = TAU * fase;
      // Formantes aproximados de "ah" agudo
      const s = Math.sin(x) * 0.6 + Math.sin(2 * x) * 0.35 + Math.sin(3 * x) * 0.22 + Math.sin(4 * x) * 0.1;
      b[i] += s * env(t, 0.03, 0.45) * 0.6;
    }
    ruido(b, { dur: 0.8, amp: 0.12, ataque: 0.02, decai: 0.3, corte: 6000, passaAlta: 1500 });
    return normalizar(b, 0.8);
  },
  // Bicuda acertando: baque surdo com estalo
  'kick': () => {
    const b = buffer(0.32);
    tom(b, { freq: 150, freqFim: 55, dur: 0.3, amp: 1, ataque: 0.002, decai: 0.08 });
    ruido(b, { dur: 0.08, amp: 0.8, ataque: 0.001, decai: 0.02, corte: 3500, passaAlta: 400 });
    return normalizar(b, 0.9);
  },
  // Golpe que passa no ar: assobio de ar
  'miss': () => {
    const b = buffer(0.35);
    ruido(b, { dur: 0.33, amp: 0.8, ataque: 0.09, decai: 0.08, corte: 900, corteFim: 3800, passaAlta: 500 });
    return normalizar(b, 0.6);
  },
  // Crítico: baque forte + brilho metálico subindo
  'crit': () => {
    const b = buffer(0.7);
    tom(b, { freq: 120, freqFim: 45, dur: 0.35, amp: 1, ataque: 0.002, decai: 0.1 });
    ruido(b, { dur: 0.1, amp: 0.9, ataque: 0.001, decai: 0.025, corte: 6000, passaAlta: 600 });
    tom(b, { inicio: 0.04, freq: 880, freqFim: 1760, dur: 0.6, amp: 0.35, ataque: 0.005, decai: 0.25, parciais: [[1, 1], [2.01, 0.4], [3.02, 0.2]] });
    return normalizar(b, 0.85);
  },
  // Guincho do porco: ruído nasal com o tom subindo e descendo
  'pig-squeal': () => {
    const b = buffer(0.75);
    const n = b.length;
    let fase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = 620 + 520 * Math.sin(Math.PI * Math.min(1, t / 0.7)) + 40 * Math.sin(TAU * 23 * t);
      fase += f / SR;
      const x = TAU * fase;
      const serra = 2 * (fase % 1) - 1;
      b[i] += (serra * 0.5 + Math.sin(2 * x) * 0.3) * env(t, 0.02, 0.35) * 0.6;
    }
    ruido(b, { dur: 0.7, amp: 0.25, ataque: 0.02, decai: 0.3, corte: 4500, passaAlta: 800 });
    return normalizar(b, 0.75);
  },
  // Galope da Investida: cascos batendo cada vez mais perto
  'pig-charge': () => {
    const b = buffer(1.0);
    for (let k = 0; k < 8; k++) {
      const t = k * 0.11 + (k % 2) * 0.03;
      const amp = 0.4 + k * 0.08;
      tom(b, { inicio: t, freq: 110, freqFim: 60, dur: 0.09, amp, ataque: 0.001, decai: 0.03 });
      ruido(b, { inicio: t, dur: 0.06, amp: amp * 0.7, ataque: 0.001, decai: 0.015, corte: 1800, passaAlta: 150 });
    }
    return normalizar(b, 0.85);
  },
  // Queda: corpo batendo no chão de lama
  'fall': () => {
    const b = buffer(0.6);
    tom(b, { freq: 90, freqFim: 40, dur: 0.5, amp: 1, ataque: 0.004, decai: 0.13 });
    ruido(b, { dur: 0.4, amp: 0.7, ataque: 0.003, decai: 0.09, corte: 700, corteFim: 250 });
    ruido(b, { inicio: 0.12, dur: 0.3, amp: 0.25, ataque: 0.01, decai: 0.08, corte: 1500, passaAlta: 400 });
    return normalizar(b, 0.85);
  },

  // ---------- Fase 4 ----------
  // Guincho curtinho de ratazana
  'rato-guincho': () => {
    const b = buffer(0.32);
    tom(b, { freq: 2200, freqFim: 3100, dur: 0.12, amp: 0.6, ataque: 0.004, decai: 0.05, forma: 'tri' });
    tom(b, { inicio: 0.13, freq: 2600, freqFim: 1900, dur: 0.16, amp: 0.5, ataque: 0.004, decai: 0.06, forma: 'tri' });
    ruido(b, { dur: 0.3, amp: 0.12, ataque: 0.01, decai: 0.08, corte: 7000, passaAlta: 2500 });
    return normalizar(b, 0.6);
  },
  // Abóbora espatifando: baque úmido
  'abobora-splat': () => {
    const b = buffer(0.5);
    tom(b, { freq: 140, freqFim: 60, dur: 0.25, amp: 0.8, ataque: 0.002, decai: 0.06 });
    ruido(b, { dur: 0.45, amp: 0.9, ataque: 0.002, decai: 0.09, corte: 2200, corteFim: 500 });
    return normalizar(b, 0.75);
  },
  // Pegar item: dois toques subindo
  'pegar-item': () => {
    const b = buffer(0.35);
    tom(b, { freq: 880, dur: 0.15, amp: 0.5, ataque: 0.003, decai: 0.06, parciais: [[1, 1], [2, 0.3]] });
    tom(b, { inicio: 0.08, freq: 1320, dur: 0.25, amp: 0.5, ataque: 0.003, decai: 0.09, parciais: [[1, 1], [2, 0.3]] });
    return normalizar(b, 0.6);
  },
  // Esfregar: ruído raspando em vaivém
  'esfregar': () => {
    const b = buffer(0.9);
    for (let k = 0; k < 4; k++) ruido(b, { inicio: k * 0.22, dur: 0.2, amp: 0.7, ataque: 0.05, decai: 0.06, corte: 3500, corteFim: 1800, passaAlta: 900 });
    return normalizar(b, 0.55);
  },
  // Espirro: inspiração curta + "atchim"
  'espirro': () => {
    const b = buffer(0.7);
    ruido(b, { dur: 0.25, amp: 0.25, ataque: 0.15, decai: 0.05, corte: 2500, passaAlta: 800 });
    ruido(b, { inicio: 0.3, dur: 0.35, amp: 1, ataque: 0.004, decai: 0.07, corte: 6000, corteFim: 2500, passaAlta: 600 });
    tom(b, { inicio: 0.3, freq: 420, freqFim: 260, dur: 0.2, amp: 0.3, ataque: 0.004, decai: 0.05, forma: 'tri' });
    return normalizar(b, 0.7);
  },
  // Espada de treino: madeira batendo
  'espada-treino': () => {
    const b = buffer(0.3);
    tom(b, { freq: 520, freqFim: 380, dur: 0.12, amp: 0.8, ataque: 0.001, decai: 0.03, parciais: [[1, 1], [2.3, 0.5], [3.7, 0.25]] });
    ruido(b, { dur: 0.06, amp: 0.6, ataque: 0.001, decai: 0.012, corte: 5000, passaAlta: 900 });
    return normalizar(b, 0.75);
  },
  // Rasteira: deslize no chão e a queda
  'rasteira': () => {
    const b = buffer(0.8);
    ruido(b, { dur: 0.35, amp: 0.6, ataque: 0.03, decai: 0.15, corte: 1800, corteFim: 900, passaAlta: 300 });
    tom(b, { inicio: 0.38, freq: 100, freqFim: 45, dur: 0.35, amp: 1, ataque: 0.003, decai: 0.1 });
    ruido(b, { inicio: 0.38, dur: 0.25, amp: 0.6, ataque: 0.002, decai: 0.06, corte: 900 });
    return normalizar(b, 0.85);
  },
  // Relação sobe: sininho subindo
  'coracao-mais': () => {
    const b = buffer(0.45);
    tom(b, { freq: 988, dur: 0.18, amp: 0.4, ataque: 0.004, decai: 0.08, parciais: sinos });
    tom(b, { inicio: 0.1, freq: 1319, dur: 0.3, amp: 0.4, ataque: 0.004, decai: 0.12, parciais: sinos });
    return normalizar(b, 0.45);
  },
  // Relação desce: dois toques graves descendo
  'coracao-menos': () => {
    const b = buffer(0.45);
    tom(b, { freq: 440, dur: 0.18, amp: 0.4, ataque: 0.004, decai: 0.08, forma: 'tri' });
    tom(b, { inicio: 0.12, freq: 330, dur: 0.3, amp: 0.4, ataque: 0.004, decai: 0.12, forma: 'tri' });
    return normalizar(b, 0.45);
  },
  // Compêndio: página virando
  'compendio': () => {
    const b = buffer(0.45);
    ruido(b, { dur: 0.4, amp: 0.8, ataque: 0.08, decai: 0.12, corte: 5000, corteFim: 2000, passaAlta: 1200 });
    return normalizar(b, 0.4);
  },
  // Gritos abafados ao longe
  'gritos-longe': () => {
    const b = buffer(2.4);
    for (const [ini, f0] of [[0, 620], [0.35, 760], [0.9, 540], [1.3, 700]]) {
      tom(b, { inicio: ini, freq: f0, freqFim: f0 * 0.75, dur: 0.9, amp: 0.5, ataque: 0.06, decai: 0.4, parciais: [[1, 1], [2, 0.5], [3, 0.25]] });
    }
    ruido(b, { dur: 2.3, amp: 0.4, ataque: 0.2, decai: 1.2, corte: 600 });
    return normalizar(b, 0.55);
  },
  // Batida de coração lenta (um ciclo de ~1,4 s, para tocar em loop)
  'batida-coracao': () => {
    const b = buffer(1.4);
    tom(b, { freq: 60, freqFim: 40, dur: 0.18, amp: 1, ataque: 0.004, decai: 0.05 });
    tom(b, { inicio: 0.24, freq: 55, freqFim: 38, dur: 0.18, amp: 0.7, ataque: 0.004, decai: 0.05 });
    return normalizar(b, 0.8);
  },
  // Flecha: assobio curto e o impacto seco
  'flecha': () => {
    const b = buffer(0.45);
    ruido(b, { dur: 0.2, amp: 0.6, ataque: 0.02, decai: 0.06, corte: 2000, corteFim: 6000, passaAlta: 1500 });
    tom(b, { inicio: 0.2, freq: 260, freqFim: 140, dur: 0.12, amp: 0.8, ataque: 0.001, decai: 0.03 });
    ruido(b, { inicio: 0.2, dur: 0.08, amp: 0.7, ataque: 0.001, decai: 0.015, corte: 4000 });
    return normalizar(b, 0.8);
  },
  // Salvar: pena riscando o papel (três traços curtos e um respiro)
  'salvar': () => {
    const b = buffer(0.62);
    for (const [ini, dur, c0, c1] of [[0, 0.11, 2600, 4200], [0.15, 0.09, 3000, 4800], [0.27, 0.16, 2400, 3800]]) {
      ruido(b, { inicio: ini, dur, amp: 0.55, ataque: 0.012, decai: 0.05, corte: c0, corteFim: c1, passaAlta: 1800 });
    }
    tom(b, { inicio: 0.44, freq: 880, freqFim: 1320, dur: 0.16, amp: 0.12, ataque: 0.02, decai: 0.1, parciais: [[1, 1], [2, 0.3]] });
    return normalizar(b, 0.6);
  },
  // Fase 5: "toc" curto do dado quicando na mesa (madeira, sem cauda)
  'dado-toc': () => {
    const b = buffer(0.12);
    ruido(b, { dur: 0.04, amp: 0.6, ataque: 0.001, decai: 0.01, corte: 4200, passaAlta: 600 });
    tom(b, { freq: 1500, freqFim: 1150, dur: 0.06, amp: 0.3, ataque: 0.001, decai: 0.014, forma: 'tri' });
    return normalizar(b, 0.6);
  },
  // Fase 5C: a espada da Nyme batendo no chão de pedra. Clang metálico (parciais inarmônicos), um
  // segundo toque mais fraco (o quique) e reverb de salão (ecos difusos que se apagam).
  'espada-clang': () => {
    const b = buffer(2.6);
    const metal = [[1, 1], [2.32, 0.7], [3.87, 0.45], [5.11, 0.3], [6.93, 0.18]];
    tom(b, { freq: 690, freqFim: 682, dur: 1.6, amp: 0.55, ataque: 0.001, decai: 0.42, parciais: metal });
    tom(b, { freq: 1240, freqFim: 1228, dur: 1.1, amp: 0.25, ataque: 0.001, decai: 0.22, parciais: metal });
    ruido(b, { dur: 0.05, amp: 0.9, ataque: 0.0005, decai: 0.008, corte: 7000, passaAlta: 1200 });
    tom(b, { inicio: 0.19, freq: 702, freqFim: 694, dur: 0.9, amp: 0.22, ataque: 0.001, decai: 0.18, parciais: metal });
    ruido(b, { inicio: 0.19, dur: 0.03, amp: 0.35, ataque: 0.0005, decai: 0.006, corte: 6000, passaAlta: 1500 });
    tom(b, { freq: 110, freqFim: 70, dur: 0.12, amp: 0.35, ataque: 0.001, decai: 0.04 });
    // Reverb simples: ecos de pedra com atrasos primos, cada um mais fraco e mais escuro.
    const seco = Float32Array.from(b);
    for (const [ms, g] of [[37, 0.42], [53, 0.36], [79, 0.3], [113, 0.24], [167, 0.18], [241, 0.12], [331, 0.08]]) {
      const d = Math.floor((ms / 1000) * SR);
      let lp = 0;
      for (let i = d; i < b.length; i++) {
        lp += 0.35 * (seco[i - d] + 0.5 * b[i - d] - lp);
        b[i] += g * lp;
      }
    }
    return normalizar(b, 0.8);
  },
  // Fase 6 (provisório): a lufada de ar frio que apaga a tocha na Parte 5. Ruído que cresce e some, com o
  // filtro abrindo e fechando (o "fuuu" do vento num corredor de pedra).
  'vento-sopro': () => {
    const b = buffer(1.6);
    ruido(b, { dur: 1.6, amp: 0.7, ataque: 0.45, decai: 0.35, corte: 300, corteFim: 1400, passaAlta: 120 });
    ruido(b, { inicio: 0.25, dur: 1.2, amp: 0.35, ataque: 0.3, decai: 0.25, corte: 900, corteFim: 2600, passaAlta: 400 });
    return normalizar(b, 0.6);
  },
};

await mkdir(OUT, { recursive: true });
for (const [nome, gerar] of Object.entries(efeitos)) {
  const dados = wav(gerar());
  await writeFile(path.join(OUT, `${nome}.wav`), dados);
  console.log(`  ${nome}.wav (${(dados.length / 1024).toFixed(1)} KB)`);
}
console.log('Efeitos gerados em public/assets/sfx/.');
