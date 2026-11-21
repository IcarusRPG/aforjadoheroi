// Dados (Fase 5): assets-src/dados/Dado <Cor> 500x500.png → public/assets/img/dados/<id>.webp (+ -256 e -128).
// A face central vem com "20" impresso: aqui ele some (face limpa), para o número do jogo não brigar
// com o impresso. Só os pixels claros do número (e uma borda de 2 px) são trocados pela média da face
// em volta, o que mantém a textura e o gradiente. Conferência: tests/screenshots/dados-face-limpa.png.
// Uso: npm run sprites (roda junto) ou node scripts/build-dados.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = path.join(ROOT, 'assets-src', 'dados');
const DESTINO = path.join(ROOT, 'public', 'assets', 'img', 'dados');
const CONFERENCIA = path.join(ROOT, 'tests', 'screenshots', 'dados-face-limpa.png');
const DADOS = [{ id: 'azul', arq: 'Dado Azul 500x500.png' }, { id: 'vermelho', arq: 'Dado Vermelho 500x500.png' }];
/** Triângulo da face central (px da imagem de 500), um pouco para dentro das arestas. */
const FACE = [[250, 100], [374, 320], [126, 320]];

const dentro = (x, y) => {
  let d = false;
  for (let i = 0, j = FACE.length - 1; i < FACE.length; j = i++) {
    const [xi, yi] = FACE[i], [xj, yj] = FACE[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
};

await mkdir(DESTINO, { recursive: true });
const pares = [];
for (const d of DADOS) {
  const { data, info } = await sharp(path.join(ORIGEM, d.arq)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const px = new Uint8ClampedArray(data);
  const luz = (i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  // Pixels do número: claros, dentro da face; mais 2 px de borda (o antisserrilhado).
  const texto = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dentro(x, y) && luz((y * W + x) * 4) > 150) texto[y * W + x] = 1;
  const borda = new Uint8Array(texto);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (!texto[y * W + x]) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dentro(x + dx, y + dy)) borda[(y + dy) * W + x + dx] = 1;
  }
  // Preenche de fora para dentro: cada pixel marcado recebe a média dos vizinhos já limpos (anéis).
  let faltam = borda.reduce((s, v) => s + v, 0);
  for (let volta = 0; faltam > 0 && volta < 80; volta++) {
    const novos = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (!borda[p]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = (y + dy) * W + x + dx;
        if (borda[q]) continue;
        r += px[q * 4]; g += px[q * 4 + 1]; b += px[q * 4 + 2]; n++;
      }
      if (n >= 2) novos.push([p, r / n, g / n, b / n]);
    }
    for (const [p, r, g, b] of novos) { px[p * 4] = r; px[p * 4 + 1] = g; px[p * 4 + 2] = b; borda[p] = 0; faltam--; }
  }
  const limpo = sharp(Buffer.from(px.buffer), { raw: { width: W, height: H, channels: 4 } });
  const base = await limpo.png().toBuffer();
  await sharp(base).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(DESTINO, `${d.id}.webp`));
  for (const t of [256, 128]) await sharp(base).resize(t, t).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(DESTINO, `${d.id}-${t}.webp`));
  pares.push(await sharp(path.join(ORIGEM, d.arq)).resize(300, 300).png().toBuffer(), await sharp(base).resize(300, 300).png().toBuffer());
  console.log(`  ${d.arq} → dados/${d.id}.webp (+256, +128)`);
}
await writeFile(path.join(ROOT, 'src', 'data', 'dados.json'), `${JSON.stringify({ padrao: 'azul', dados: [
  { id: 'azul', nome: 'Dado azul', imagem: 'img/dados/azul' },
  { id: 'vermelho', nome: 'Dado vermelho', imagem: 'img/dados/vermelho' },
] }, null, 2)}\n`);
// Antes e depois, lado a lado.
await mkdir(path.dirname(CONFERENCIA), { recursive: true });
await sharp({ create: { width: 1240, height: 340, channels: 4, background: '#3a3a44' } })
  .composite(pares.map((b, i) => ({ input: b, left: 10 + i * 310, top: 20 })))
  .png().toFile(CONFERENCIA);
console.log('Conferência:', path.relative(ROOT, CONFERENCIA));
