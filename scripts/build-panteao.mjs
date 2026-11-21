// Imagens do panteão (Fase 4E) para o Caderno de estudos. Uso: node scripts/build-panteao.mjs [pasta]
// Origem padrão: C:\Users\<você>\Documents\FdG\img\panteão\{Alfars,Baldurs}\<Nome>.png (copia, não move).
// Destino: public/assets/img/panteao/<id>.webp — id em minúsculas, sem acento; fundo branco → transparente
// (o mesmo flood fill dos sprites, que não apaga o branco das roupas); até 900 px de altura; WebP q85.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ler, limparFundo } from './sprites-comum.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = process.argv[2] ?? path.join(os.homedir(), 'Documents', 'FdG', 'img', 'panteão');
const DESTINO = path.join(ROOT, 'public', 'assets', 'img', 'panteao');
const ESPERADOS = ['solem', 'justar', 'aletris', 'amorina', 'bellica', 'etheria', 'floressa', 'logos', 'nocturna', 'odincia',
  'ardor', 'draconara', 'eternus', 'expiria', 'fraudulus', 'insidia', 'irae', 'mentis', 'paxus', 'valorus'];

/**
 * Bolsões de fundo fechados (entre o braço e a arma, por exemplo) que o flood fill das bordas não alcança:
 * regiões grandes de branco puro viram transparentes. O branco das roupas tem sombra e não chega a isso.
 */
function limparBolsoes(img, minimo = 1500) {
  const { w, h, d } = img;
  const puro = (p) => d[p * 4 + 3] > 0 && d[p * 4] >= 246 && d[p * 4 + 1] >= 246 && d[p * 4 + 2] >= 246;
  const visto = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (visto[s] || !puro(s)) continue;
    const regiao = [s];
    visto[s] = 1;
    for (let k = 0; k < regiao.length; k++) {
      const p = regiao[k], x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || visto[q] || !puro(q)) continue;
        visto[q] = 1;
        regiao.push(q);
      }
    }
    if (regiao.length < minimo) continue;
    // Brilho (centro de um sol, reflexo) é cercado de pixels claros; fundo é cercado pelo contorno escuro.
    let claros = 0, borda = 0;
    for (const p of regiao) {
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || puro(q)) continue;
        borda++;
        const luz = 0.299 * d[q * 4] + 0.587 * d[q * 4 + 1] + 0.114 * d[q * 4 + 2];
        if (luz > 200) claros++;
      }
    }
    if (borda && claros / borda > 0.6) continue;
    for (const p of regiao) d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = d[p * 4 + 3] = 0;
  }
}

const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
mkdirSync(DESTINO, { recursive: true });
const feitos = [];
for (const grupo of ['Alfars', 'Baldurs']) {
  const pasta = path.join(ORIGEM, grupo);
  if (!existsSync(pasta)) { console.warn(`Falta a pasta ${pasta}`); continue; }
  for (const arq of readdirSync(pasta).filter((f) => /\.png$/i.test(f))) {
    const id = semAcento(arq.replace(/\.png$/i, ''));
    const img = await ler(path.join(pasta, arq));
    limparFundo(img);
    limparBolsoes(img);
    const saida = path.join(DESTINO, `${id}.webp`);
    await sharp(Buffer.from(img.d.buffer), { raw: { width: img.w, height: img.h, channels: 4 } })
      .trim({ threshold: 0 })
      .resize({ height: 900, withoutEnlargement: true })
      .webp({ quality: 85, alphaQuality: 90, effort: 6 })
      .toFile(saida);
    feitos.push(id);
    console.log(`  ${grupo}/${arq} → panteao/${id}.webp`);
  }
}
// Conferência: as 20 imagens com o id embaixo (tests/screenshots/panteao-conferencia.png).
const CEL = 210, ROT = 26, COLS = 5;
const camadas = [];
for (const [i, id] of ESPERADOS.filter((x) => feitos.includes(x)).entries()) {
  const img = await sharp(path.join(DESTINO, `${id}.webp`)).resize({ width: CEL - 16, height: CEL - 16, fit: 'inside' }).png().toBuffer();
  const meta = await sharp(img).metadata();
  const cx = (i % COLS) * CEL, cy = Math.floor(i / COLS) * (CEL + ROT);
  camadas.push({ input: img, left: cx + Math.round((CEL - meta.width) / 2), top: cy + CEL - meta.height - 4 });
  camadas.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CEL}" height="${ROT}"><text x="${CEL / 2}" y="18" font-size="16" font-family="Arial" text-anchor="middle" fill="#fff">${id}</text></svg>`), left: cx, top: cy + CEL });
}
const CONF = path.join(ROOT, 'tests', 'screenshots', 'panteao-conferencia.png');
mkdirSync(path.dirname(CONF), { recursive: true });
await sharp({ create: { width: COLS * CEL, height: Math.ceil(feitos.length / COLS) * (CEL + ROT), channels: 4, background: '#3a2a1a' } }).composite(camadas).png().toFile(CONF);
console.log('Conferência:', path.relative(ROOT, CONF));

const faltam = ESPERADOS.filter((id) => !feitos.includes(id));
const sobram = feitos.filter((id) => !ESPERADOS.includes(id));
if (faltam.length) console.warn(`Faltam: ${faltam.join(', ')}`);
if (sobram.length) console.warn(`Nomes que não bateram: ${sobram.join(', ')}`);
console.log(`${feitos.length} imagens.`);
