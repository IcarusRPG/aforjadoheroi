// Bustos do herói com expressões (Fase 6) e a folha de conferência da orientação dos bustos.
//
//   node scripts/prepare-retratos.mjs                  (usa C:\Users\...\Documents\FdG)
//   node scripts/prepare-retratos.mjs --so-folha       (só a folha de conferência)
//
// - Copia (não move) os bustos de FdG\img\herois\portraits nos 5 estados (normal, choque, dor, raiva,
//   determinado) para public/assets/img/retratos/heroi-<raca>-<m|f>[-<expressao>].webp e imprime a
//   tabela das 8 combinações × 5 estados, com o que falta (sem o arquivo, o jogo usa o busto normal).
//   O busto normal do Nyashi masculino se chama "Nyashi-male-comun.png" (sem "-busto"), e as expressões
//   dele também vêm sem "-busto".
// - Gera tests/screenshots/retratos-orientacao.png: todos os bustos (NPCs, heróis em todas as
//   expressões e as divindades) com a orientação gravada em src/data/retratos.json, para conferir.
import sharp from 'sharp';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || process.env.FDG_DIR || 'C:\\Users\\AdamPauloCarrijoNeve\\Documents\\FdG';
const OUT = path.join('public', 'assets', 'img', 'retratos');
const RACAS = { 'araké': 'arake', arake: 'arake', azakar: 'azakar', nyashi: 'nyashi', ayoran: 'ayoran' };
const NOME_RACA = { arake: 'Araké', azakar: 'Azakar', nyashi: 'Nyashi', ayoran: 'Ayoran' };
const GENEROS = { male: 'm', female: 'f' };
const EXPRESSOES = ['normal', 'choque', 'dor', 'raiva', 'determinado'];
const chave = (s) => s.normalize('NFC').toLowerCase();

async function expressoes() {
  const dir = path.join(SRC, 'img', 'herois', 'portraits');
  await mkdir(OUT, { recursive: true });
  const achados = new Set();
  for (const f of (await readdir(dir)).filter((n) => /\.png$/i.test(n))) {
    const m = chave(path.parse(f).name).match(/^([a-zé]+)-(male|female)-comun(?:-busto)?(?:-(choque|dor|raiva|determinado))?$/);
    const r = m && RACAS[m[1]];
    if (!r) { console.warn(`  não reconhecido: ${f}`); continue; }
    const expr = m[3] ?? 'normal';
    const nome = `heroi-${r}-${GENEROS[m[2]]}${expr === 'normal' ? '' : `-${expr}`}`;
    await sharp(path.join(dir, f)).resize({ width: 768, withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 90 }).toFile(path.join(OUT, `${nome}.webp`));
    achados.add(`${r}-${GENEROS[m[2]]}-${expr}`);
  }
  console.log('\n| Herói | ' + EXPRESSOES.join(' | ') + ' |');
  console.log('| --- | ' + EXPRESSOES.map(() => '---').join(' | ') + ' |');
  const faltam = [];
  for (const r of ['arake', 'ayoran', 'azakar', 'nyashi']) for (const g of ['m', 'f']) {
    const linha = EXPRESSOES.map((e) => (achados.has(`${r}-${g}-${e}`) ? 'ok' : (faltam.push(`${r}-${g}-${e}`), 'falta')));
    console.log(`| ${NOME_RACA[r]} ${g === 'm' ? 'masculino' : 'feminino'} | ${linha.join(' | ')} |`);
  }
  console.log(faltam.length ? `\nFaltam: ${faltam.join(', ')}` : '\nNada falta: 8 × 5 = 40 bustos.');
}

/** Folha de conferência: cada busto como aparece no jogo (já espelhado), com a seta para onde ele olha. */
async function folha() {
  const dados = JSON.parse(await readFile(path.join('src', 'data', 'retratos.json'), 'utf8'));
  const itens = Object.entries(dados.bustos);
  const L = 180, A = 230, COLS = 8;
  const linhas = Math.ceil(itens.length / COLS);
  const comps = [];
  for (const [i, [id, info]] of itens.entries()) {
    const arq = path.join('public', 'assets', info.arquivo);
    if (!existsSync(arq)) continue;
    // Como aparece no jogo: o NPC (à esquerda) olha para a direita e o herói (à direita) para a esquerda;
    // o busto virado para o lado errado é espelhado. A seta mostra a direção DEPOIS do espelhamento.
    const lado = id.startsWith('heroi-') ? dados.lados.heroi : id.startsWith('npc-') ? dados.lados.npc : null;
    const espelha = !!lado && info.olhaPara !== 'frente' && info.olhaPara !== lado;
    const final = espelha ? lado : info.olhaPara;
    let base = sharp(arq).resize(L - 10, A - 50, { fit: 'contain', background: { r: 30, g: 26, b: 22, alpha: 1 } }).flatten({ background: '#1e1a16' });
    if (espelha) base = base.flop();
    const img = await base.png().toBuffer();
    const x = (i % COLS) * L, y = Math.floor(i / COLS) * A;
    const seta = final === 'esquerda' ? '← esquerda' : final === 'direita' ? '→ direita' : '• de frente';
    const svg = Buffer.from(`<svg width="${L}" height="44" xmlns="http://www.w3.org/2000/svg"><rect width="${L}" height="44" fill="#120f0c"/><text x="6" y="17" font-family="sans-serif" font-size="13" fill="#f2d48a">${id}</text><text x="6" y="36" font-family="sans-serif" font-size="14" font-weight="bold" fill="${final === 'esquerda' ? '#7fd1ff' : final === 'direita' ? '#ffb27f' : '#cfcfcf'}">${seta}${espelha ? ' (espelhado)' : ''}</text></svg>`);
    comps.push({ input: img, left: x + 5, top: y + 4 }, { input: svg, left: x, top: y + A - 46 });
  }
  await mkdir(path.join('tests', 'screenshots'), { recursive: true });
  const dest = path.join('tests', 'screenshots', 'retratos-orientacao.png');
  await sharp({ create: { width: COLS * L, height: linhas * A, channels: 3, background: '#2a241e' } }).composite(comps).png().toFile(dest);
  console.log(`\nFolha de conferência: ${dest} (${itens.length} bustos)`);
}

if (!process.argv.includes('--so-folha')) { console.log('Expressões dos bustos do herói…'); await expressoes(); }
if (process.argv.includes('--folha') || existsSync(path.join('src', 'data', 'retratos.json'))) await folha();
