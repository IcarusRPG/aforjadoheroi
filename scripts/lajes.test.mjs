// Fase 6B: a grade lógica bate com o piso pintado dos corredores (node --test).
// Mede de novo as juntas no painel (scripts/calibrar-lajes.mjs) e compara com src/data/lateral/ato1.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calibrar } from './calibrar-lajes.mjs';

const D = JSON.parse(readFileSync('src/data/lateral/ato1.json', 'utf8'));
const casos = [['corredor-1', D.partes['3'].grade], ['corredor-2', D.partes['4'].grade]];

for (const [id, g] of casos) {
  test(`${id}: as juntas da grade caem sobre as juntas pintadas`, async () => {
    const painel = D.paineis.find((p) => p.id === id);
    const m = await calibrar(id);
    // As 5 juntas horizontais (4 fileiras), com 2 px de folga.
    assert.equal(g.fileiras.length, 5);
    g.fileiras.forEach((y, i) => assert.ok(Math.abs(y - m.fileiras[i]) <= 2, `fileira ${i}: ${y} × ${m.fileiras[i]}`));
    // Cada junta medida com boa confiança (erro < 3 px) tem uma junta da grade a até 6 px, no topo e na base.
    const boas = m.juntas.filter((j) => j.erro < 3);
    assert.ok(boas.length >= 7, `só ${boas.length} juntas confiáveis`);
    for (const j of boas) {
      const perto = g.juntas.some(([t, b]) => Math.abs(t - painel.x - j.topo) <= 6 && Math.abs(b - painel.x - j.base) <= 6);
      // Fora da grade (ou a borda escura do fim do painel, quase vertical): não precisa de par.
      const foraDaGrade = j.base > g.juntas.at(-1)[1] - painel.x + 20 || j.topo > g.juntas.at(-1)[0] - painel.x + 60 || j.topo < g.juntas[0][0] - painel.x - 20;
      assert.ok(perto || foraDaGrade, `junta pintada [${j.topo}, ${j.base}] sem par na grade`);
    }
    // As 4 fileiras ficam dentro da faixa de chão andável.
    for (let l = 0; l < 4; l++) assert.ok(Math.max(g.fileiras[l], painel.chao[0]) < Math.min(g.fileiras[l + 1], painel.chao[1]), `fileira ${l} fora do chão`);
  });
}
