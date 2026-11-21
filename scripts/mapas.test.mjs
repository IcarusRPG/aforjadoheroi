// Teste da grade dos mapas (Fase 4F): `node --test scripts/mapas.test.mjs`
// - todo ponto andável é alcançável a pé a partir do início (nenhum "ilhado");
// - início, retornos, pontos nomeados, moradores, itens e gatilhos ficam ao alcance;
// - os pés do herói nunca ficam numa área bloqueada (o ponto inicial e os de retorno são livres).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dentroDoPoligono, escalarPes, pesLivres } from '../src/exploracao/geometria.ts';
import { montarMapa } from '../src/exploracao/montagem.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(ROOT, 'src', 'data', 'mapas');
const PASSO = 4;

function grade(mapa) {
  escalarPes(mapa.escalaPersonagens ?? 1);
  const cols = Math.ceil(mapa.largura / PASSO), lins = Math.ceil(mapa.altura / PASSO);
  const livre = new Uint8Array(cols * lins);
  for (let l = 0; l < lins; l++) for (let c = 0; c < cols; c++) livre[l * cols + c] = pesLivres(mapa.colisoes, c * PASSO, l * PASSO) ? 1 : 0;
  // Inundação a partir do início (8 vizinhos, só por células livres).
  const alc = new Uint8Array(cols * lins);
  const c0 = Math.round(mapa.inicio.x / PASSO), l0 = Math.round(mapa.inicio.y / PASSO);
  const fila = [l0 * cols + c0];
  alc[fila[0]] = 1;
  while (fila.length) {
    const i = fila.pop();
    const c = i % cols, l = (i - c) / cols;
    for (let dl = -1; dl <= 1; dl++) for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc, ll = l + dl;
      if (cc < 0 || ll < 0 || cc >= cols || ll >= lins) continue;
      const j = ll * cols + cc;
      if (!alc[j] && livre[j]) { alc[j] = 1; fila.push(j); }
    }
  }
  const alcancavel = (x, y, raio = 0) => {
    const r = Math.ceil(raio / PASSO);
    const c = Math.round(x / PASSO), l = Math.round(y / PASSO);
    for (let dl = -r; dl <= r; dl++) for (let dc = -r; dc <= r; dc++) {
      if (Math.hypot(dc * PASSO, dl * PASSO) > raio) continue;
      const j = (l + dl) * cols + (c + dc);
      if (alc[j]) return true;
    }
    return false;
  };
  return { cols, lins, livre, alc, alcancavel };
}

const TIPOS = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'objetos.json'), 'utf8'));
// Mapas de chão + objetos são montados como no jogo (colisões pelos pés dos objetos).
const mapas = readdirSync(PASTA).filter((f) => f.endsWith('.json')).map((f) => montarMapa(JSON.parse(readFileSync(path.join(PASTA, f), 'utf8')), TIPOS));

for (const mapa of mapas) {
  test(`${mapa.id}: todo ponto andável é alcançável (nenhum ilhado)`, () => {
    const g = grade(mapa);
    assert.ok(pesLivres(mapa.colisoes, mapa.inicio.x, mapa.inicio.y), 'o início está numa área bloqueada');
    const ilhados = [];
    for (let i = 0; i < g.livre.length; i++) if (g.livre[i] && !g.alc[i]) ilhados.push([(i % g.cols) * PASSO, Math.floor(i / g.cols) * PASSO]);
    assert.equal(ilhados.length, 0, `pontos andáveis ilhados (ex.: ${JSON.stringify(ilhados.slice(0, 6))})`);
  });

  test(`${mapa.id}: início, retornos, pontos, moradores, itens e gatilhos ao alcance`, () => {
    const g = grade(mapa);
    const k = mapa.escalaPersonagens ?? 1;
    const alcance = Math.sqrt(k);
    for (const [id, r] of Object.entries(mapa.retornos ?? {})) assert.ok(pesLivres(mapa.colisoes, r.x, r.y), `retorno ${id} bloqueado`);
    // Saindo de um retorno, o herói consegue dar uns passos na direção em que fica virado (nada colado na porta).
    const DIR = { baixo: [0, 1], cima: [0, -1], esquerda: [-1, 0], direita: [1, 0] };
    for (const [id, r] of Object.entries(mapa.retornos ?? {})) {
      const [dx, dy] = DIR[r.direcao] ?? [0, 1];
      for (let d = 10; d <= 50; d += 10) assert.ok(pesLivres(mapa.colisoes, r.x + dx * d, r.y + dy * d), `saída do retorno ${id} bloqueada a ${d} px`);
    }
    for (const [id, p] of Object.entries(mapa.pontos ?? {})) assert.ok(g.alcancavel(p.x, p.y, 40 * k), `ponto ${id} fora de alcance`);
    for (const n of mapa.npcs ?? []) assert.ok(g.alcancavel(n.x, n.y + 8 * k, 58 * alcance - 4), `morador ${n.id} fora de alcance`);
    for (const o of mapa.objetos ?? []) {
      const p = o.interacao ?? o;
      assert.ok(g.alcancavel(p.x, p.y, 52 * alcance - 4), `item ${o.id} fora de alcance`);
    }
    for (const i of mapa.interacoes ?? []) assert.ok(g.alcancavel(i.x, i.y, i.raio - 4), `interação ${i.id} fora de alcance`);
    for (const gt of [...(mapa.gatilhos ?? []), ...(mapa.gatilhosCena ?? [])]) {
      let ok = false;
      for (let i = 0; i < g.alc.length && !ok; i++) {
        if (!g.alc[i]) continue;
        if (dentroDoPoligono((i % g.cols) * PASSO, Math.floor(i / g.cols) * PASSO, gt.pontos)) ok = true;
      }
      assert.ok(ok, `gatilho ${gt.id} fora de alcance`);
    }
  });
}
