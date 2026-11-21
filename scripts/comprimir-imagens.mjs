// Compressão das ilustrações grandes (Fase 4F). Uso: node scripts/comprimir-imagens.mjs
//
// - Mapas navegáveis (assets-fonte/mapas/*.png): WebP q90. Se passar de 800 KB, vira blocos de 1024 px
//   (img/mapas/<id>/<coluna>-<linha>.webp), carregados conforme a câmera; o JSON do mapa ganha
//   `chao.blocos`. Senão, `chao.imagem` aponta para img/mapas/<id>.webp.
// - Fundos de batalha (assets-fonte/batalha-fundos/*.png): WebP q85, até 1920 px de largura.
// - Bustos e cenas já saem em WebP q85 do prepare-assets.mjs; sprites (chibis, folhas de batalha) ficam PNG.
//
// Os originais ficam em assets-fonte/ (fora do public/, então não vão para o site).
// Escreve a tabela de pesos em docs/pesos-assets.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONTE = path.join(ROOT, 'assets-fonte');
const PUB = path.join(ROOT, 'public', 'assets');
const LIMITE_MAPA = 800 * 1024;
const BLOCO = 1024;
const kb = (n) => `${Math.round(n / 1024).toLocaleString('pt-BR')} KB`;
const linhas = [];

/* ---------- mapas ---------- */
for (const arq of readdirSync(path.join(FONTE, 'mapas')).filter((f) => f.endsWith('.png'))) {
  const id = arq.replace(/\.png$/, '');
  const origem = path.join(FONTE, 'mapas', arq);
  const antes = statSync(origem).size;
  const { width: W, height: H } = await sharp(origem).metadata();
  const inteiro = await sharp(origem).webp({ quality: 90, effort: 6 }).toBuffer();
  const jsonPath = path.join(ROOT, 'src', 'data', 'mapas', `${id}.json`);
  const pasta = path.join(PUB, 'img', 'mapas', id);
  rmSync(pasta, { recursive: true, force: true });
  rmSync(path.join(PUB, 'img', 'mapas', `${id}.webp`), { force: true });
  let chao;
  let depois;
  if (inteiro.length <= LIMITE_MAPA) {
    writeFileSync(path.join(PUB, 'img', 'mapas', `${id}.webp`), inteiro);
    chao = { imagem: `img/mapas/${id}.webp` };
    depois = inteiro.length;
  } else {
    mkdirSync(pasta, { recursive: true });
    const blocos = [];
    depois = 0;
    for (let y = 0, l = 0; y < H; y += BLOCO, l++) {
      for (let x = 0, c = 0; x < W; x += BLOCO, c++) {
        const w = Math.min(BLOCO, W - x), h = Math.min(BLOCO, H - y);
        const buf = await sharp(origem).extract({ left: x, top: y, width: w, height: h }).webp({ quality: 90, effort: 6 }).toBuffer();
        writeFileSync(path.join(pasta, `${c}-${l}.webp`), buf);
        blocos.push({ imagem: `img/mapas/${id}/${c}-${l}.webp`, x, y, largura: w, altura: h });
        depois += buf.length;
      }
    }
    chao = { blocos };
  }
  // O chão vira a camada `chao` do JSON. Troca só a linha da imagem (o resto do arquivo fica como está).
  const texto = readFileSync(jsonPath, 'utf8');
  const linhaBloco = (b) => `   ${JSON.stringify(b).replace(/,"/g, ', "').replace(/":/g, '": ')}`;
  const chaoTxt = chao.blocos
    ? `"chao": {\n  "blocos": [\n${chao.blocos.map(linhaBloco).join(',\n')}\n  ]\n }`
    : `"chao": { "imagem": "${chao.imagem}" }`;
  // O bloco "chao" inteiro (com blocos ou imagem) ou, no formato antigo, a linha "imagem".
  const novoTexto = texto.replace(/"chao": \{\r?\n {2}"blocos"[\s\S]*?\r?\n \}|"chao": \{ "imagem": "[^"]+" \}|"imagem": "img\/mapas\/[^"]+"/, chaoTxt);
  if (novoTexto === texto && !texto.includes(chaoTxt)) throw new Error(`${id}.json: não achei "imagem" nem "chao"`);
  writeFileSync(jsonPath, novoTexto);
  linhas.push(['mapa', id, `${W}×${H}`, antes, depois, chao.blocos ? `${chao.blocos.length} blocos de ${BLOCO} px (q90)` : 'WebP q90']);
}

/* ---------- fundos de batalha ---------- */
for (const arq of readdirSync(path.join(FONTE, 'batalha-fundos')).filter((f) => f.endsWith('.png'))) {
  const id = arq.replace(/\.png$/, '');
  const origem = path.join(FONTE, 'batalha-fundos', arq);
  const destino = path.join(PUB, 'img', 'batalha', 'fundos', `${id}.webp`);
  await sharp(origem).resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 85, effort: 6 }).toFile(destino);
  const { width: W, height: H } = await sharp(origem).metadata();
  linhas.push(['fundo de batalha', id, `${W}×${H}`, statSync(origem).size, statSync(destino).size, 'WebP q85']);
}

/* ---------- o que já estava em WebP (só medição) ---------- */
const medir = (pasta, tipo, filtro = () => true) => {
  for (const arq of readdirSync(path.join(PUB, pasta)).filter((f) => f.endsWith('.webp') && filtro(f))) {
    const p = path.join(PUB, pasta, arq);
    linhas.push([tipo, arq.replace(/\.webp$/, ''), '', statSync(p).size, statSync(p).size, 'já em WebP q85 (sem mudança)']);
  }
};
medir('img/mapas', 'mapa', (f) => !/-objetos|-antigo/.test(f) && !linhas.some((l) => l[0] === 'mapa' && `${l[1]}.webp` === f));
medir('img/cenas', 'cena');
medir('img/retratos', 'busto');

const total = (i) => linhas.reduce((s, l) => s + l[i], 0);
let md = '# Pesos dos assets (Fase 4F)\n\nGerado por `node scripts/comprimir-imagens.mjs`.\n\n| Tipo | Arquivo | Tamanho | Antes | Depois | Formato |\n| --- | --- | --- | ---: | ---: | --- |\n';
for (const [tipo, id, dim, a, d, fmt] of linhas) md += `| ${tipo} | ${id} | ${dim} | ${kb(a)} | ${kb(d)} | ${fmt} |\n`;
md += `| **total** | | | **${kb(total(3))}** | **${kb(total(4))}** | |\n`;
if (!existsSync(path.join(ROOT, 'docs'))) mkdirSync(path.join(ROOT, 'docs'));
writeFileSync(path.join(ROOT, 'docs', 'pesos-assets.md'), md);
console.log(md);
