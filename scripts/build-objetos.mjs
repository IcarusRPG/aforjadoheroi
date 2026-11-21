// Recorta os objetos de Füllmun (Fase 5) das folhas em assets-src/objetos/fullmun/ e monta o atlas.
//
// 1. remove o fundo (como nos outros scripts);
// 2. acha cada objeto por componentes conectados do alfa, ignora ruídos e junta partes soltas próximas
//    (fumaça da chaminé, folhas soltas);
// 3. ordena pela grade da folha e dá o id da tabela;
// 4. normaliza a escala de cada folha pela do mapa antigo (assets-src/referencia/fullmun-antigo.png):
//    os objetos de referência da folha (largura medida no mapa antigo) dão o fator; a folha inteira usa
//    a mediana, para manter as proporções entre os objetos da mesma folha;
// 5. exporta o atlas (public/assets/img/mapas/fullmun-objetos.png + .json) e, para os objetos novos,
//    os valores iniciais de pé e profundidade em src/data/objetos.json (os já editados não mudam).
// Conferência: tests/screenshots/objetos-recortados.png. Se uma folha não bater com a grade, o script
// para com erro (e a folha de conferência mostra o que achou).
//
// Uso: npm run sprites (roda junto) ou node scripts/build-objetos.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ler, limparFundo } from './sprites-comum.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(ROOT, 'assets-src', 'objetos', 'fullmun');
const ATLAS = path.join(ROOT, 'public', 'assets', 'img', 'mapas', 'fullmun-objetos');
const DADOS = path.join(ROOT, 'src', 'data', 'objetos.json');
const CONFERENCIA = path.join(ROOT, 'tests', 'screenshots', 'objetos-recortados.png');

/** Folhas, grade (colunas × linhas) e ids na ordem da grade (linha a linha). */
const FOLHAS = [
  { arq: 'objetos-casas.png', cols: 2, lins: 2, ids: ['casa-heroi', 'casa-hulda', 'casa-aylin', 'casa-simples'] },
  { arq: 'objetos-oficios.png', cols: 2, lins: 2, ids: ['padaria', 'forja', 'curandeira', 'galpao-chiqueiro'] },
  { arq: 'objetos-mercado.png', cols: 2, lins: 2, ids: ['barraca-vermelha', 'barraca-azul', 'barraca-roxa', 'barraca-bege'] },
  { arq: 'objetos-arvores.png', cols: 3, lins: 2, ids: ['carvalho', 'arvore-media', 'arvore-rosa', 'pinheiro', 'arbusto-grande', 'arbusto-flor'] },
  { arq: 'objetos-props-a.png', cols: 3, lins: 3, ids: ['poco', 'poste-lampiao', 'pilar-lanterna', 'estandarte', 'banco', 'barris', 'caixotes', 'espantalho', 'placa'] },
  { arq: 'objetos-props-b.png', cols: 3, lins: 3, ids: ['cerca-h', 'cerca-v', 'cerca-canto', 'portao', 'varal', 'lenha', 'canteiro-rosa', 'canteiro-branco', 'pedra'] },
  { arq: 'objetos-plantacao.png', cols: 3, lins: 3, ids: ['abobora-grande', 'aboboras-pequenas', 'repolho', 'verduras', 'cocho', 'feno', 'banco-lago', 'lanterna-baixa', 'degraus'] },
  { arq: 'objetos-templo-fachada.png', cols: 1, lins: 1, ids: ['templo-fachada'] },
];

/**
 * Largura (px) de cada objeto no mapa antigo, medida em assets-src/referencia/fullmun-antigo.png. Só os
 * que existem lá; o fator da folha é a mediana destes.
 */
const LARGURA_ANTIGA = {
  'casa-heroi': 255, 'casa-hulda': 214, 'casa-aylin': 158,
  padaria: 300, forja: 410, curandeira: 340,
  'barraca-vermelha': 118, 'barraca-azul': 150, 'barraca-roxa': 128, 'barraca-bege': 122,
  carvalho: 155, 'arvore-media': 133, 'arvore-rosa': 97,
  poco: 93, 'pilar-lanterna': 34, banco: 80, 'poste-lampiao': 34,
  lenha: 73, 'canteiro-rosa': 95, pedra: 67, varal: 150,
  'banco-lago': 80, 'abobora-grande': 38,
  'templo-fachada': 196,
};

/**
 * O mapa novo é o antigo ampliado (1672 → 2400 px de largura): assim a porta das casas fica com ~1,6× a
 * altura do herói (o herói com ~60% da porta), sem ampliar o sprite do herói.
 */
export const ESCALA_MUNDO = 2400 / 1672;
/**
 * Objetos que destoam da escala da própria folha (largura final, em px do mapa novo): o galpão do
 * chiqueiro e as plantas da horta vieram grandes demais para o lugar deles no mapa antigo.
 */
const LARGURA_FIXA = { 'galpao-chiqueiro': 190, 'casa-aylin': 240, 'abobora-grande': 60, 'aboboras-pequenas': 62, repolho: 44, verduras: 70, pedra: 96 };

/**
 * Profundidade do pé (fração da altura do sprite, a partir da base) e largura (fração da largura), por
 * tipo: a casa bloqueia a parede da frente (não o telhado); a árvore, só o tronco; o canteiro, quase todo.
 */
const PE = {
  construcao: { alto: 0.3, largo: 0.86 }, barraca: { alto: 0.34, largo: 0.84 }, arvore: { alto: 0.07, largo: 0.16 },
  arbusto: { alto: 0.32, largo: 0.8 }, poste: { alto: 0.08, largo: 0.3 }, prop: { alto: 0.3, largo: 0.84 },
  cerca: { alto: 0.22, largo: 0.96 }, plano: { alto: 0.6, largo: 0.9 }, templo: { alto: 0.35, largo: 0.8 },
};
const TIPO = (id) => /^casa|^padaria|^forja|^curandeira|^galpao/.test(id) ? 'construcao'
  : /^barraca/.test(id) ? 'barraca'
  : /^carvalho|^arvore|^pinheiro/.test(id) ? 'arvore'
  : /^arbusto/.test(id) ? 'arbusto'
  : /^poste|^pilar|^estandarte|^lanterna|^placa|^espantalho/.test(id) ? 'poste'
  : /^cerca|^portao|^varal/.test(id) ? 'cerca'
  : /^canteiro|^abobora|^repolho|^verduras|^degraus/.test(id) ? 'plano'
  : /^templo/.test(id) ? 'templo' : 'prop';

const RUIDO = 400; // px de alfa: abaixo disso é ruído (na folha original)
const JUNTAR = 28; // px: partes soltas a essa distância de um objeto fazem parte dele

function componentes(img) {
  const { w, h, d } = img;
  const rot = new Int32Array(w * h).fill(-1);
  const comps = [];
  const fila = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (rot[s] >= 0 || d[s * 4 + 3] < 24) continue;
    const c = { n: 0, x0: w, y0: h, x1: 0, y1: 0 };
    let ini = 0, fim = 0;
    fila[fim++] = s; rot[s] = comps.length;
    while (ini < fim) {
      const p = fila[ini++];
      const x = p % w, y = (p - x) / w;
      c.n++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (rot[q] < 0 && d[q * 4 + 3] >= 24) { rot[q] = comps.length; fila[fim++] = q; }
      }
    }
    comps.push(c);
  }
  return comps;
}

/** Junta os pedaços pequenos ao objeto grande mais próximo (se estiverem perto). */
function agrupar(comps) {
  const grandes = comps.filter((c) => c.n >= RUIDO * 6).map((c) => ({ ...c }));
  const perto = (a, b) => a.x0 - JUNTAR <= b.x1 && b.x0 - JUNTAR <= a.x1 && a.y0 - JUNTAR <= b.y1 && b.y0 - JUNTAR <= a.y1;
  // Grandes que se tocam (casa + escada separada) viram um só.
  for (let mudou = true; mudou;) {
    mudou = false;
    for (let i = 0; i < grandes.length && !mudou; i++) for (let j = i + 1; j < grandes.length && !mudou; j++) {
      const a = grandes[i], b = grandes[j];
      const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -6 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > -6;
      if (ov) { Object.assign(a, { n: a.n + b.n, x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }); grandes.splice(j, 1); mudou = true; }
    }
  }
  for (const c of comps) {
    if (c.n >= RUIDO * 6 || c.n < RUIDO / 8) continue;
    const alvo = grandes.find((g) => perto(g, c));
    if (alvo) Object.assign(alvo, { x0: Math.min(alvo.x0, c.x0), y0: Math.min(alvo.y0, c.y0), x1: Math.max(alvo.x1, c.x1), y1: Math.max(alvo.y1, c.y1) });
  }
  return grandes;
}

const recortes = [];
const erros = [];
for (const f of FOLHAS) {
  const img = await ler(path.join(PASTA, f.arq));
  limparFundo(img, 64);
  const achados = agrupar(componentes(img));
  // Ordem pela grade: célula do centro de cada objeto.
  const cw = img.w / f.cols, ch = img.h / f.lins;
  const celula = (c) => Math.min(f.lins - 1, Math.floor(((c.y0 + c.y1) / 2) / ch)) * f.cols + Math.min(f.cols - 1, Math.floor(((c.x0 + c.x1) / 2) / cw));
  achados.sort((a, b) => celula(a) - celula(b));
  const celulas = achados.map(celula);
  if (achados.length !== f.ids.length || new Set(celulas).size !== celulas.length) {
    erros.push(`${f.arq}: esperava ${f.ids.length} objetos (${f.cols}×${f.lins}), achei ${achados.length} nas células ${celulas.join(',')}`);
  }
  for (const [k, c] of achados.entries()) {
    const id = f.ids[celulas[k]] ?? `${f.arq}-${k}`;
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    const buf = await sharp(Buffer.from(img.d.buffer), { raw: { width: img.w, height: img.h, channels: 4 } })
      .extract({ left: c.x0, top: c.y0, width: w, height: h }).png().toBuffer();
    recortes.push({ id, folha: f.arq, w, h, buf });
  }
}

// Escala por folha: mediana de (largura no mapa antigo / largura no recorte).
const fatores = {};
for (const f of FOLHAS) {
  const r = recortes.filter((x) => x.folha === f.arq && LARGURA_ANTIGA[x.id] && !LARGURA_FIXA[x.id]).map((x) => (LARGURA_ANTIGA[x.id] * ESCALA_MUNDO) / x.w).sort((a, b) => a - b);
  fatores[f.arq] = r.length ? r[Math.floor(r.length / 2)] : null;
}
const geral = Object.values(fatores).filter(Boolean).sort((a, b) => a - b);
for (const k of Object.keys(fatores)) fatores[k] ??= geral[Math.floor(geral.length / 2)];

// Redimensiona e mede a base (faixa opaca mais baixa) de cada um.
const finais = [];
for (const r of recortes) {
  const k = LARGURA_FIXA[r.id] ? LARGURA_FIXA[r.id] / r.w : fatores[r.folha];
  const w = Math.max(1, Math.round(r.w * k)), h = Math.max(1, Math.round(r.h * k));
  const { data } = await sharp(r.buf).resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  // Limpa o alfa fraco do redimensionamento (sem halo branco).
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] < 20) data[i + 3] = 0;
  const buf = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  // Base: a linha opaca mais baixa e a faixa de x dos 12% de baixo.
  let fundo = h - 1;
  const opaco = (x, y) => data[(y * w + x) * 4 + 3] > 128;
  while (fundo > 0 && ![...Array(w).keys()].some((x) => opaco(x, fundo))) fundo--;
  const faixa = Math.max(3, Math.round(h * 0.12));
  let xa = w, xb = 0;
  for (let y = Math.max(0, fundo - faixa); y <= fundo; y++) for (let x = 0; x < w; x++) if (opaco(x, y)) { xa = Math.min(xa, x); xb = Math.max(xb, x); }
  finais.push({ id: r.id, folha: r.folha, w, h, buf, fundo, xa, xb, faixa, desvio: LARGURA_ANTIGA[r.id] ? w / (LARGURA_ANTIGA[r.id] * ESCALA_MUNDO) : null });
}

// Atlas: prateleiras de 2048 px de largura, 2 px de espaço.
const LARG = 4096, ESP = 2;
let x = 0, y = 0, altLinha = 0;
const ordem = [...finais].sort((a, b) => b.h - a.h);
for (const f of ordem) {
  if (x + f.w > LARG) { x = 0; y += altLinha + ESP; altLinha = 0; }
  f.ax = x; f.ay = y;
  x += f.w + ESP;
  altLinha = Math.max(altLinha, f.h);
}
const altura = y + altLinha;
await mkdir(path.dirname(ATLAS), { recursive: true });
await sharp({ create: { width: LARG, height: altura, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(finais.map((f) => ({ input: f.buf, left: f.ax, top: f.ay })))
  .webp({ lossless: true, effort: 6 }).toFile(`${ATLAS}.webp`);
const quadros = {};
for (const f of finais) quadros[f.id] = { x: f.ax, y: f.ay, w: f.w, h: f.h };
writeFileSync(`${ATLAS}.json`, `${JSON.stringify({ imagem: 'img/mapas/fullmun-objetos.webp', largura: LARG, altura, quadros }, null, 1)}\n`);

// Pé e profundidade iniciais (âncora: centro da base do sprite; y para cima é negativo).
const dados = existsSync(DADOS) ? JSON.parse(readFileSync(DADOS, 'utf8')) : {};
for (const f of finais) {
  if (dados[f.id]) continue;
  const t = PE[TIPO(f.id)];
  const cx = (f.xa + f.xb) / 2 - f.w / 2; // centro da base (o sprite pode ser assimétrico)
  const meia = ((f.xb - f.xa) * t.largo) / 2;
  const fundoAncora = f.fundo - (f.h - 1); // a âncora é a base do sprite; a base opaca pode subir um pouco
  const pe = [Math.round(cx - meia), Math.round(fundoAncora - f.h * t.alto), Math.round(cx + meia), Math.round(fundoAncora)];
  const extra = TIPO(f.id) === 'arvore' ? { copa: true } : {};
  dados[f.id] = { largura: f.w, altura: f.h, pe, linhaY: Math.round(fundoAncora), ...extra };
}
const ordenado = Object.fromEntries(FOLHAS.flatMap((fl) => fl.ids).filter((id) => dados[id]).map((id) => [id, dados[id]]));
writeFileSync(DADOS, `${JSON.stringify(ordenado, null, 1).replace(/\[\n\s+(-?\d+),\n\s+(-?\d+),\n\s+(-?\d+),\n\s+(-?\d+)\n\s+\]/g, '[$1, $2, $3, $4]')}\n`);

// Folha de conferência: cada recorte com o id embaixo.
const CEL = 220, ROT = 22, COLS = 8;
const linhas = Math.ceil(finais.length / COLS);
const camadas = [];
for (const [i, f] of finais.entries()) {
  const k = Math.min(1, (CEL - 10) / Math.max(f.w, f.h));
  const w = Math.max(1, Math.round(f.w * k)), h = Math.max(1, Math.round(f.h * k));
  const cx = (i % COLS) * CEL, cy = Math.floor(i / COLS) * (CEL + ROT);
  camadas.push({ input: await sharp(f.buf).resize(w, h).png().toBuffer(), left: cx + Math.round((CEL - w) / 2), top: cy + CEL - h - 4 });
  const txt = `${f.id} (${f.w}×${f.h})`;
  camadas.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CEL}" height="${ROT}"><text x="${CEL / 2}" y="16" font-size="13" font-family="Arial" text-anchor="middle" fill="#fff">${txt}</text></svg>`), left: cx, top: cy + CEL });
}
await mkdir(path.dirname(CONFERENCIA), { recursive: true });
await sharp({ create: { width: COLS * CEL, height: linhas * (CEL + ROT), channels: 4, background: '#3a4a30' } }).composite(camadas).png().toFile(CONFERENCIA);

console.log('Fatores de escala por folha:', Object.fromEntries(Object.entries(fatores).map(([k, v]) => [k, Math.round(v * 1000) / 1000])));
for (const f of finais) if (f.desvio && Math.abs(f.desvio - 1) > 0.25) console.log(`  ${f.id}: ${f.w} px (mapa antigo ampliado: ${Math.round(LARGURA_ANTIGA[f.id] * ESCALA_MUNDO)} px, ${Math.round(f.desvio * 100)}%)`);
console.log(`${finais.length} objetos → ${path.relative(ROOT, ATLAS)}.webp (${LARG}×${altura})`);
if (erros.length) { console.error(`\nFolhas fora da grade:\n${erros.join('\n')}`); process.exit(1); }
