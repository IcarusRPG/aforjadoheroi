// Calibra a grade de lajes com o piso pintado dos corredores (Fase 6B).
//
//   node scripts/calibrar-lajes.mjs corredor-1 corredor-2
//
// Mede no próprio painel (public/assets/img/lateral/<id>.webp):
// - as juntas horizontais (as linhas escuras entre as fileiras de lajes), pelo perfil de brilho;
// - as juntas verticais, que convergem em perspectiva: acha os vales escuros em várias alturas e
//   ajusta uma reta x = a + b·y para cada junta.
// Imprime, em px do painel, `fileiras` (y das 5 juntas horizontais, de 4 fileiras) e `juntas`
// ([x no topo, x na base] de cada junta vertical, da esquerda para a direita). Some o x do painel
// para levar ao mundo (src/data/lateral/ato1.json).
import sharp from 'sharp';

export async function calibrar(id) {
  const { data, info } = await sharp(`public/assets/img/lateral/${id}.webp`).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const px = (x, y) => data[y * W + x];

  // Juntas horizontais: os 5 vales mais escuros do perfil entre y 480 e 820 (afastados 30 px).
  const perfil = [];
  for (let y = 480; y < 820; y++) { let s = 0; for (let x = 300; x < 1450; x++) s += px(x, y); perfil.push({ y, v: s / 1150 }); }
  const vales = perfil.filter((p, i) => i > 3 && i < perfil.length - 4 && perfil.slice(i - 4, i + 5).every((q) => q.v >= p.v));
  const fileiras = [];
  for (const v of [...vales].sort((a, b) => a.v - b.v)) {
    if (fileiras.length < 5 && fileiras.every((y) => Math.abs(y - v.y) > 30)) fileiras.push(v.y);
  }
  fileiras.sort((a, b) => a - b);

  // Juntas verticais: vales escuros em cada altura (longe das juntas horizontais).
  const pontos = [];
  for (let y = fileiras[0] + 8; y < fileiras[4] - 6; y += 4) {
    if (fileiras.some((f) => Math.abs(f - y) < 8)) continue;
    const col = [];
    for (let x = 0; x < W; x++) { let s = 0; for (let k = -3; k <= 3; k++) s += px(x, y + k); col.push(s / 7); }
    const sm = col.map((_, x) => { let s = 0, n = 0; for (let k = -2; k <= 2; k++) if (col[x + k] !== undefined) { s += col[x + k]; n++; } return s / n; });
    for (let x = 30; x < W - 30; x++) {
      let menor = true;
      for (let k = -25; k <= 25; k++) if (sm[x + k] < sm[x]) { menor = false; break; }
      if (menor && (sm[x - 20] + sm[x + 20]) / 2 - sm[x] > 12) pontos.push({ x, y });
    }
  }
  // Agrupa por reta: começa no meio da altura e segue cada junta para cima e para baixo.
  const meio = (fileiras[2] + fileiras[3]) / 2;
  const sementes = pontos.filter((p) => Math.abs(p.y - meio) <= 4).map((p) => p.x).sort((a, b) => a - b);
  const juntas = [];
  for (const x0 of sementes) {
    if (juntas.some((j) => Math.abs(j.xMeio - x0) < 40)) continue;
    const grupo = [];
    let ultimo = { x: x0, y: meio };
    for (const dir of [1, -1]) {
      ultimo = { x: x0, y: meio };
      const ys = [...new Set(pontos.map((p) => p.y))].filter((y) => (dir > 0 ? y >= meio : y < meio)).sort((a, b) => dir * (a - b));
      for (const y of ys) {
        const cand = pontos.filter((p) => p.y === y && Math.abs(p.x - ultimo.x) <= 4 + Math.abs(y - ultimo.y) * 1.1);
        if (!cand.length) continue;
        const p = cand.reduce((a, b) => (Math.abs(a.x - ultimo.x) <= Math.abs(b.x - ultimo.x) ? a : b));
        grupo.push(p);
        ultimo = p;
      }
    }
    if (grupo.length < 8) continue;
    // Mínimos quadrados: x = a + b·y.
    const n = grupo.length, sy = grupo.reduce((s, p) => s + p.y, 0), sx = grupo.reduce((s, p) => s + p.x, 0);
    const syy = grupo.reduce((s, p) => s + p.y * p.y, 0), sxy = grupo.reduce((s, p) => s + p.x * p.y, 0);
    const b = (n * sxy - sx * sy) / (n * syy - sy * sy), a = (sx - b * sy) / n;
    const erro = Math.sqrt(grupo.reduce((s, p) => s + (p.x - (a + b * p.y)) ** 2, 0) / n);
    juntas.push({ xMeio: a + b * meio, topo: Math.round(a + b * fileiras[0]), base: Math.round(a + b * fileiras[4]), pontos: n, erro: Math.round(erro * 10) / 10 });
  }
  juntas.sort((a, b) => a.xMeio - b.xMeio);
  return { id, fileiras, juntas };
}

// Rodado direto (não importado pelo teste): calibra os painéis pedidos.
const principal = !!process.argv[1] && /calibrar-lajes\.mjs$/.test(process.argv[1]);
if (principal) for (const id of process.argv.slice(2)) {
  const r = await calibrar(id);
  console.log(`\n${r.id}: fileiras (y) = ${JSON.stringify(r.fileiras)}`);
  for (const j of r.juntas) console.log(`  junta: topo ${j.topo}, base ${j.base} (${j.pontos} pontos, erro ${j.erro} px)`);
  console.log(`  juntas = ${JSON.stringify(r.juntas.map((j) => [j.topo, j.base]))}`);
}
