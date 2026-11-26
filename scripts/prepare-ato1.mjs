// Prepara as imagens do Ato I (Fase 6) a partir da pasta FdG (copia, não move).
//
//   node scripts/prepare-ato1.mjs                  (usa C:\Users\...\Documents\FdG)
//   node scripts/prepare-ato1.mjs "D:\outra\FdG"
//
// - Painéis laterais (túnel, corredor, tochas): todos na mesma altura, WebP q90, emendados com crossfade
//   de XF px na junção. Cada painel (menos o último) leva no seu fim a mistura com o começo do seguinte, e
//   cada painel (menos o primeiro) começa XF px depois; lado a lado, com passo (largura − XF), formam um
//   nível contínuo. Tira de conferência em tests/screenshots/ato1-tira-paineis.png.
// - Camada da frente (tunel-frente.png, grade 3 × 3, fundo branco): cada peça recortada pelo fundo claro
//   ligado às bordas da célula (componentes conectados), com um leve desfoque.
// - Símbolos dos deuses (grade 3 × 3, fundo preto): o preto vira transparência pela luminância.
// - Mapa do Salão da Forja e as cenas do Ato I.
import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const SRC = process.argv[2] || process.env.FDG_DIR || 'C:\\Users\\AdamPauloCarrijoNeve\\Documents\\FdG';
const OUT = path.join('public', 'assets');
const PAINEIS = [
  ['tunel-1', 'tunel-1'], ['tunel-2', 'tunel-2'], ['tunel-3', 'tunel-3'],
  ['corredor-1', 'corredor-1'], ['corredor-2', 'corredor-2'],
  // No FdG, "tocha" no singular.
  ['tocha-1', 'tochas-1'], ['tocha-2', 'tochas-2'],
];
export const ALTURA = 887;
export const XF = 24;
const FRENTE = [
  'pilar', 'estalactites', 'raizes',
  'pedras', 'coluna', 'teias',
  'musgo', 'estalagmite', 'borda',
];
const SIMBOLOS = [
  'solem', 'justar', 'ardor',
  'expiria', 'eternus', 'mentis',
  'irae', 'solem-rachado', 'rachaduras',
];
const CENAS = [
  'cena-artho-alcapao-aberto', 'cena-memoria-maes', 'cena-porta-solem', 'cena-salao-forja',
  'cena-reliquia-guerreiro', 'cena-reliquia-paladino', 'cena-reliquia-ladino', 'cena-reliquia-arcanista', 'cena-reliquia-monge',
];

const kb = async (p) => `${Math.round((await stat(p)).size / 1024)} KB`;
const garantir = (p) => mkdir(p, { recursive: true });

async function paineis() {
  const dir = path.join(SRC, 'img', 'mapas navegaveis');
  const out = path.join(OUT, 'img', 'lateral');
  await garantir(out);
  // RGB cru de cada painel, já na mesma altura.
  const crus = [];
  for (const [orig] of PAINEIS) {
    const { data, info } = await sharp(path.join(dir, `${orig}.png`)).resize({ height: ALTURA }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    crus.push({ data, w: info.width, h: info.height });
  }
  const pedacos = [];
  for (let i = 0; i < crus.length; i++) {
    const p = crus[i], prox = crus[i + 1];
    const ini = i === 0 ? 0 : XF;
    const larg = p.w - ini;
    const buf = Buffer.alloc(larg * ALTURA * 3);
    for (let y = 0; y < ALTURA; y++) {
      for (let x = 0; x < larg; x++) {
        const xs = x + ini;
        const o = (y * p.w + xs) * 3, d = (y * larg + x) * 3;
        // Últimos XF px: mistura com os XF primeiros do seguinte.
        const k = prox ? xs - (p.w - XF) : -1;
        for (let c = 0; c < 3; c++) {
          if (k >= 0) {
            const t = (k + 0.5) / XF;
            buf[d + c] = Math.round(p.data[o + c] * (1 - t) + prox.data[(y * prox.w + k) * 3 + c] * t);
          } else buf[d + c] = p.data[o + c];
        }
      }
    }
    const dest = path.join(out, `${PAINEIS[i][1]}.webp`);
    await sharp(buf, { raw: { width: larg, height: ALTURA, channels: 3 } }).webp({ quality: 90 }).toFile(dest);
    pedacos.push({ buf, larg });
    console.log(`  painel ${PAINEIS[i][0]} → lateral/${PAINEIS[i][1]}.webp (${larg} × ${ALTURA}, ${await kb(dest)})`);
  }
  // Tira de conferência (um quarto da altura).
  const total = pedacos.reduce((s, p) => s + p.larg, 0);
  const esc = 0.25;
  const comps = [];
  let x = 0;
  for (const p of pedacos) {
    const img = await sharp(p.buf, { raw: { width: p.larg, height: ALTURA, channels: 3 } }).resize({ width: Math.round(p.larg * esc), height: Math.round(ALTURA * esc), fit: 'fill' }).png().toBuffer();
    comps.push({ input: img, left: Math.round(x * esc), top: 0 });
    x += p.larg;
  }
  await garantir(path.join('tests', 'screenshots'));
  const tira = path.join('tests', 'screenshots', 'ato1-tira-paineis.png');
  await sharp({ create: { width: Math.round(total * esc) + 2, height: Math.round(ALTURA * esc), channels: 3, background: '#000' } }).composite(comps).png().toFile(tira);
  console.log(`  tira emendada: ${tira} (${total} px de nível)`);
}

/** Fundo claro (branco acinzentado e pouco saturado) ligado às bordas da célula vira transparente. */
async function frente() {
  const ent = path.join(SRC, 'img', 'sprites objetos', 'tunel-frente.png');
  const out = path.join(OUT, 'img', 'lateral');
  const { data, info } = await sharp(ent).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, cel = Math.floor(W / 3);
  for (let i = 0; i < 9; i++) {
    const cx = (i % 3) * cel, cy = Math.floor(i / 3) * cel;
    const pad = 12; // a moldura fina entre as células fica de fora
    const w = cel - pad * 2, hh = cel - pad * 2;
    const px = Buffer.alloc(w * hh * 4);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const o = ((cy + pad + y) * W + cx + pad + x) * 4, d = (y * w + x) * 4;
      data.copy(px, d, o, o + 4);
    }
    const fundo = (d) => {
      const r = px[d], g = px[d + 1], b = px[d + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      return mx > 150 && mx - mn < 46;
    };
    const visto = new Uint8Array(w * hh);
    const fila = [];
    for (let x = 0; x < w; x++) fila.push(x, (hh - 1) * w + x);
    for (let y = 0; y < hh; y++) fila.push(y * w, y * w + w - 1);
    while (fila.length) {
      const k = fila.pop();
      if (visto[k] || !fundo(k * 4)) continue;
      visto[k] = 1;
      const x = k % w, y = (k / w) | 0;
      if (x > 0) fila.push(k - 1); if (x < w - 1) fila.push(k + 1);
      if (y > 0) fila.push(k - w); if (y < hh - 1) fila.push(k + w);
    }
    for (let k = 0; k < w * hh; k++) if (visto[k]) px[k * 4 + 3] = 0;
    // Borda macia: pixels vizinhos do fundo ficam meio transparentes.
    for (let k = 0; k < w * hh; k++) {
      if (visto[k]) continue;
      const x = k % w, y = (k / w) | 0;
      const viz = [k - 1, k + 1, k - w, k + w].filter((v, j) => (j === 0 ? x > 0 : j === 1 ? x < w - 1 : j === 2 ? y > 0 : y < hh - 1) && visto[v]).length;
      if (viz) px[k * 4 + 3] = Math.round(255 * (1 - viz * 0.2));
    }
    const dest = path.join(out, `frente-${FRENTE[i]}.png`);
    await sharp(px, { raw: { width: w, height: hh, channels: 4 } }).trim({ threshold: 1 }).blur(1.1).png({ compressionLevel: 9 }).toFile(dest);
    console.log(`  frente ${FRENTE[i]} → lateral/frente-${FRENTE[i]}.png (${await kb(dest)})`);
  }
}

/** Preto → transparente pela luminância (o maior canal), mantendo o traço e a cor (cor dividida pelo alfa). */
async function simbolos() {
  const ent = path.join(SRC, 'img', 'sprites objetos', 'simbolos-deuses.png');
  const out = path.join(OUT, 'img', 'simbolos');
  await garantir(out);
  const { data, info } = await sharp(ent).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, cel = Math.floor(W / 3);
  for (let i = 0; i < 9; i++) {
    const cx = (i % 3) * cel, cy = Math.floor(i / 3) * cel;
    const px = Buffer.alloc(cel * cel * 4);
    for (let y = 0; y < cel; y++) for (let x = 0; x < cel; x++) {
      const o = ((cy + y) * W + cx + x) * 3, d = (y * cel + x) * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      const mx = Math.max(r, g, b);
      // Abaixo de 18: fundo; daí até ~110, rampa (a borda suave do traço).
      const a = Math.max(0, Math.min(1, (mx - 18) / 92));
      const k = a > 0 ? 1 / Math.max(a, mx / 255) : 0;
      px[d] = Math.min(255, Math.round(r * k)); px[d + 1] = Math.min(255, Math.round(g * k)); px[d + 2] = Math.min(255, Math.round(b * k));
      px[d + 3] = Math.round(a * 255);
    }
    const dest = path.join(out, `${SIMBOLOS[i]}.png`);
    await sharp(px, { raw: { width: cel, height: cel, channels: 4 } }).trim({ threshold: 1 }).resize({ width: 256, height: 256, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(dest);
    console.log(`  símbolo ${SIMBOLOS[i]} → simbolos/${SIMBOLOS[i]}.png (${await kb(dest)})`);
    // O brilho (desfoque do traço), pronto: o jogo só pinta na cor do deus e pulsa (sem filtro na hora).
    const brilho = path.join(out, `${SIMBOLOS[i]}-brilho.png`);
    await sharp(dest).extend({ top: 24, bottom: 24, left: 24, right: 24, background: { r: 0, g: 0, b: 0, alpha: 0 } }).blur(9).png({ compressionLevel: 9 }).toFile(brilho);
  }
}

async function mapaECenas() {
  const mapa = path.join(OUT, 'img', 'mapas', 'salao-forja.png');
  await sharp(path.join(SRC, 'img', 'mapas navegaveis', 'mapa-salao-forja.png')).png({ compressionLevel: 9 }).toFile(mapa);
  // Cópia em WebP para o jogo (o .png fica como o original pedido).
  await sharp(mapa).webp({ quality: 88 }).toFile(mapa.replace(/\.png$/, '.webp'));
  console.log(`  mapa salao-forja (${await kb(mapa)}; webp ${await kb(mapa.replace(/\.png$/, '.webp'))})`);
  const dir = path.join(SRC, 'img', 'cenas');
  for (const id of CENAS) {
    const ext = id === 'cena-salao-forja' ? 'jpeg' : 'png';
    const dest = path.join(OUT, 'img', 'cenas', `${id}.webp`);
    await sharp(path.join(dir, `${id}.${ext}`)).resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 85 }).toFile(dest);
    console.log(`  cena ${id}.${ext} → ${id}.webp (${await kb(dest)})`);
  }
}

console.log('Painéis laterais:');
await paineis();
console.log('Camada da frente:');
await frente();
console.log('Símbolos:');
await simbolos();
console.log('Mapa e cenas:');
await mapaECenas();
