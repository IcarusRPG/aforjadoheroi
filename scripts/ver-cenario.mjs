// Prévia de um mapa montado com objetos (Fase 5): chão + objetos na ordem de profundidade, com os pés
// (vermelho), as linhas de profundidade (amarelo), NPCs e itens. Opcional: o mapa antigo como fantasma.
// Uso: node scripts/ver-cenario.mjs [saida.png] [mapa=fullmun] [--fantasma] [--sem-marcas] [--zoom=0.5]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const saida = args.find((a) => a.endsWith('.png')) ?? path.join(ROOT, 'tests', 'screenshots', 'fullmun-cenario.png');
const id = args.find((a) => !a.startsWith('--') && !a.endsWith('.png')) ?? 'fullmun';
const fantasma = args.includes('--fantasma');
const marcas = !args.includes('--sem-marcas');
const zoom = Number(args.find((a) => a.startsWith('--zoom='))?.slice(7) ?? 0.5);

const mapa = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'mapas', `${id}.json`), 'utf8'));
const tipos = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'objetos.json'), 'utf8'));
const atlasInfo = JSON.parse(readFileSync(path.join(ROOT, 'public', 'assets', `${mapa.objetosAtlas}.json`), 'utf8'));
const atlas = path.join(ROOT, 'public', 'assets', atlasInfo.imagem);
const W = mapa.largura, H = mapa.altura;

const camadas = [];
const fonteChao = path.join(ROOT, 'assets-fonte', 'mapas', `${id}.png`);
camadas.push({ input: existsSync(fonteChao) ? await sharp(fonteChao).resize(W, H).png().toBuffer() : await sharp({ create: { width: W, height: H, channels: 3, background: '#5a7a3a' } }).png().toBuffer(), left: 0, top: 0 });
const ordem = [...mapa.objetos].map((o, i) => ({ ...o, i })).sort((a, b) => (a.y + (a.linhaY ?? tipos[a.id]?.linhaY ?? 0)) - (b.y + (b.linhaY ?? tipos[b.id]?.linhaY ?? 0)));
for (const o of ordem) {
  const q = atlasInfo.quadros[o.id];
  if (!q) { console.warn('sem quadro:', o.id); continue; }
  let s = sharp(atlas).extract({ left: q.x, top: q.y, width: q.w, height: q.h });
  if (o.espelhar) s = s.flop();
  const left = Math.round(o.x - q.w / 2), top = Math.round(o.y - q.h);
  // Recorta o que sai do mapa (o sharp não aceita camada fora da imagem).
  const l0 = Math.max(0, -left), t0 = Math.max(0, -top), l1 = Math.min(q.w, W - left), t1 = Math.min(q.h, H - top);
  if (l1 <= l0 || t1 <= t0) continue;
  const buf = await sharp(await s.png().toBuffer()).extract({ left: l0, top: t0, width: l1 - l0, height: t1 - t0 }).png().toBuffer();
  camadas.push({ input: buf, left: left + l0, top: top + t0 });
}
if (fantasma && mapa.fantasma) {
  const f = await sharp(path.join(ROOT, 'public', 'assets', mapa.fantasma)).resize(W, H).ensureAlpha(0.4).png().toBuffer();
  camadas.push({ input: f, left: 0, top: 0 });
}
if (marcas) {
  const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(' ');
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  for (const c of mapa.colisoesExtras ?? []) {
    const cor = c.tipo === 'andavel' ? '#00e05a' : '#ff8030';
    if (c.id !== 'chao') svg += `<polygon points="${pts(c.pontos)}" fill="${cor}" fill-opacity="0.12" stroke="${cor}" stroke-width="2"/>`;
  }
  for (const o of mapa.objetos) {
    const t = tipos[o.id]; if (!t) continue;
    let [x0, y0, x1, y1] = o.pe ?? t.pe;
    if (o.espelhar) [x0, x1] = [-x1, -x0];
    svg += `<rect x="${o.x + x0}" y="${o.y + y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#ff2030" fill-opacity="0.3" stroke="#ff2030"/>`;
    const ly = o.y + (o.linhaY ?? t.linhaY ?? 0);
    svg += `<line x1="${o.x - t.largura / 2}" y1="${ly}" x2="${o.x + t.largura / 2}" y2="${ly}" stroke="#ffe000" stroke-width="1.5" stroke-opacity="0.8"/>`;
  }
  for (const n of mapa.npcs ?? []) svg += `<circle cx="${n.x}" cy="${n.y}" r="8" fill="#ffd040" stroke="#000"/><text x="${n.x}" y="${n.y - 12}" font-size="16" text-anchor="middle" fill="#ffd040" stroke="#000" stroke-width="0.6">${n.id}</text>`;
  for (const o of mapa.itens ?? []) svg += `<rect x="${o.x - 6}" y="${o.y - 6}" width="12" height="12" fill="#40c0ff" stroke="#000"/>`;
  for (const g of mapa.gatilhos ?? []) svg += `<polygon points="${pts(g.pontos)}" fill="#b040ff" fill-opacity="0.25" stroke="#b040ff" stroke-width="2"/>`;
  svg += '</svg>';
  camadas.push({ input: Buffer.from(svg), left: 0, top: 0 });
}
const base = await sharp({ create: { width: W, height: H, channels: 4, background: '#000' } }).composite(camadas).png().toBuffer();
await sharp(base).resize(Math.round(W * zoom)).png().toFile(saida);
console.log('ok:', saida);
