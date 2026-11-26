// Gera as folhas de caminhada do herói a partir das folhas 2 × 2 de vistas paradas.
//
// Entrada: assets-src/sprites/<raca>-<m|f>.png — 4 vistas em grade 2 × 2:
//   superior esquerda = de frente (baixo), superior direita = esquerda,
//   inferior esquerda = direita, inferior direita = de costas (cima).
// Saída:   public/assets/sprites/chibi-<raca>-<m|f>.png — grade 4 × 4 de quadros 48 × 48
//          (linhas: baixo, esquerda, direita, cima; quadros: parado, passo A, parado, passo B).
// Prévias: tests/screenshots/sprites/<raca>-<m|f>-preview.png (6×) e <raca>-<m|f>-andando.gif.
//
// Uso: npm run sprites

import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { colar, idx, ler, limparFundo, nova, reduzir, reduzirPaleta, salvarPng } from './sprites-comum.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = path.join(ROOT, 'assets-src', 'sprites');
const SAIDA = path.join(ROOT, 'public', 'assets', 'sprites');
const PREVIAS = path.join(ROOT, 'tests', 'screenshots', 'sprites');

const QUADRO = 48;
const ALTURA_ALVO = 46;
/** Ampliação da folha lateral (Fase 6): quadros de 240 × 240. */
export const ESCALA_LATERAL = 5;

/**
 * Ordem das vistas em cada folha: [baixo, esquerda, direita, cima] → quadrante (coluna, linha).
 * Se alguma folha vier em outra ordem, ajuste só ela aqui.
 */
const ORDEM_PADRAO = { baixo: [0, 0], esquerda: [1, 0], direita: [0, 1], cima: [1, 1] };
const ORDEM_ESPECIAL = {};
const DIRECOES = ['baixo', 'esquerda', 'direita', 'cima'];

/**
 * 2. Separa as 4 vistas. Algumas folhas têm a cabeça de baixo invadindo a metade de cima (juba,
 * chifres), então não dá para cortar exatamente no meio: cada mancha de pixels conectados vai para
 * o quadrante onde fica o seu centro, e a vista é recortada pela caixa das suas manchas.
 */
function separarVistas(img) {
  const { w, h, d } = img;
  const rotulo = new Int32Array(w * h).fill(-1);
  const quadrante = []; // por mancha
  const fila = new Int32Array(w * h);
  for (let p0 = 0; p0 < w * h; p0++) {
    if (rotulo[p0] !== -1 || d[p0 * 4 + 3] === 0) continue;
    const id = quadrante.length;
    let ini = 0, fim = 0, sx = 0, sy = 0;
    fila[fim++] = p0; rotulo[p0] = id;
    while (ini < fim) {
      const p = fila[ini++];
      const x = p % w, y = (p - x) / w;
      sx += x; sy += y;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (rotulo[q] === -1 && d[q * 4 + 3] !== 0) { rotulo[q] = id; fila[fim++] = q; }
      }
    }
    quadrante.push((sx / fim < w / 2 ? 0 : 1) + (sy / fim < h / 2 ? 0 : 2));
  }
  return (qx, qy, nome) => {
    const alvo = qx + qy * 2;
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let p = 0; p < w * h; p++) {
      if (rotulo[p] === -1 || quadrante[rotulo[p]] !== alvo) continue;
      const x = p % w, y = (p - x) / w;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (maxX < 0) throw new Error(`${nome}: quadrante (${qx},${qy}) vazio`);
    const r = nova(maxX - minX + 1, maxY - minY + 1);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const p = (minY + y) * w + minX + x;
      if (rotulo[p] === -1 || quadrante[rotulo[p]] !== alvo) continue;
      const a = p * 4, b = idx(r, x, y);
      for (let c = 0; c < 4; c++) r.d[b + c] = d[a + c];
    }
    return r;
  };
}

/** 5–7. Monta os 4 quadros de uma direção. */
function quadrosDaDirecao(v, direcao) {
  const ox = Math.floor((QUADRO - v.w) / 2);
  const oy = QUADRO - 1 - v.h; // pés 1 px acima da base
  const quadros = [];
  const deLado = direcao === 'esquerda' || direcao === 'direita';
  const quadril = Math.round(v.h * (deLado ? 0.62 : 0.66));
  const meio = Math.round(v.w / 2);
  for (let f = 0; f < 4; f++) {
    const q = nova(QUADRO, QUADRO);
    const passo = f === 1 ? 'A' : f === 3 ? 'B' : null;
    if (!passo) { colar(q, v, ox, oy); quadros.push(q); continue; }
    const by = oy - 1; // balanço: o corpo sobe 1 px
    if (!deLado) {
      // Pernas primeiro (uma sobe 2 px), depois o tronco por cima.
      const sobe = passo === 'A' ? [0, meio] : [meio, v.w];
      const fica = passo === 'A' ? [meio, v.w] : [0, meio];
      colar(q, v, ox, by, { linhas: [quadril, v.h], colunas: fica });
      colar(q, v, ox, by - 2, { linhas: [quadril, v.h], colunas: sobe });
      colar(q, v, ox, by, { linhas: [0, quadril] });
    } else {
      // Cisalhamento das pernas: até ±3 px no pé, para a frente no passo A e para trás no B.
      const frente = direcao === 'esquerda' ? -1 : 1;
      const sinal = passo === 'A' ? frente : -frente;
      const desloc = (y) => (y < quadril ? 0 : Math.round((sinal * 3 * (y - quadril)) / Math.max(1, v.h - 1 - quadril)));
      colar(q, v, ox, by, { desloc });
    }
    quadros.push(q);
  }
  return quadros;
}

async function salvarGif(folha, arquivo) {
  // Um quadro do GIF = as 4 direções lado a lado, no mesmo passo, ampliadas 4×.
  const E = 4;
  const paginas = [];
  for (let f = 0; f < 4; f++) {
    const p = nova(QUADRO * 4, QUADRO);
    for (let i = 0; i < p.d.length; i += 4) { p.d[i] = 70; p.d[i + 1] = 92; p.d[i + 2] = 110; p.d[i + 3] = 255; }
    DIRECOES.forEach((_, linha) => {
      const q = nova(QUADRO, QUADRO);
      for (let y = 0; y < QUADRO; y++) for (let x = 0; x < QUADRO; x++) {
        const a = idx(folha, f * QUADRO + x, linha * QUADRO + y), b = idx(q, x, y);
        for (let c = 0; c < 4; c++) q.d[b + c] = folha.d[a + c];
      }
      colar(p, q, linha * QUADRO, 0);
    });
    paginas.push(await sharp(Buffer.from(p.d.buffer), { raw: { width: p.w, height: p.h, channels: 4 } })
      .resize(p.w * E, p.h * E, { kernel: 'nearest' }).png().toBuffer());
  }
  await sharp(paginas, { join: { animated: true } }).gif({ loop: 0, delay: [180, 180, 180, 180] }).toFile(arquivo);
}

async function processar(arquivo) {
  const nome = path.parse(arquivo).name;
  const avisos = [];
  const img = await ler(path.join(ENTRADA, arquivo));
  limparFundo(img);
  const ordem = ORDEM_ESPECIAL[nome] ?? ORDEM_PADRAO;
  const recortar = separarVistas(img);
  const brutas = DIRECOES.map((d) => recortar(ordem[d][0], ordem[d][1], nome));
  // 3. Escala única: a vista mais alta fica com 46 px (e nenhuma passa da largura do quadro).
  const altMax = Math.max(...brutas.map((v) => v.h));
  const largMax = Math.max(...brutas.map((v) => v.w));
  const fator = Math.min(ALTURA_ALVO / altMax, (QUADRO - 6) / largMax);
  const reduzidas = await reduzirPaleta(await Promise.all(brutas.map((v) => reduzir(v, fator))));

  const folha = nova(QUADRO * 4, QUADRO * 4);
  DIRECOES.forEach((d, linha) => {
    quadrosDaDirecao(reduzidas[linha], d).forEach((q, col) => colar(folha, q, col * QUADRO, linha * QUADRO));
  });
  await salvarPng(folha, path.join(SAIDA, `chibi-${nome}.png`));
  // Fase 6 (fase lateral): as linhas de baixo (parado), esquerda e direita, já na escala final
  // (5×, filtro nearest), para o herói do túnel ficar nítido com ~20% da altura do painel.
  if (/-(m|f)$/.test(nome)) {
  const lateral = nova(QUADRO * 4, QUADRO * 3);
  for (let linha = 0; linha < 3; linha++) for (let y = 0; y < QUADRO; y++) for (let x = 0; x < QUADRO * 4; x++) {
    const a = idx(folha, x, linha * QUADRO + y), b = idx(lateral, x, linha * QUADRO + y);
    for (let c = 0; c < 4; c++) lateral.d[b + c] = folha.d[a + c];
  }
  await salvarPng(lateral, path.join(SAIDA, `lateral-${nome}.png`), ESCALA_LATERAL);
  }
  await salvarPng(folha, path.join(PREVIAS, `${nome}-preview.png`), 6);
  await salvarGif(folha, path.join(PREVIAS, `${nome}-andando.gif`));
  console.log(`  ${nome}: vistas ${reduzidas.map((v) => `${v.w}×${v.h}`).join(', ')} (fator ${fator.toFixed(4)})`);
  return avisos;
}

await mkdir(SAIDA, { recursive: true });
await mkdir(PREVIAS, { recursive: true });
// Heróis: <raca>-<m|f>.png; NPCs: <id>.png (artho, nyme…). Saída: chibi-<nome>.png.
const arquivos = (await readdir(ENTRADA)).filter((f) => /^[a-z]+(-[a-z]+)*\.png$/.test(f)).sort();
const herois = arquivos.filter((f) => /-[mf]\.png$/.test(f));
if (herois.length !== 8) console.warn(`  Atenção: esperava 8 folhas de herói, achei ${herois.length}.`);
const avisos = [];
for (const f of arquivos) avisos.push(...(await processar(f)));
if (avisos.length) console.warn('  AVISOS:\n   - ' + avisos.join('\n   - '));
console.log(`Pronto: ${arquivos.length} folhas em public/assets/sprites/.`);
