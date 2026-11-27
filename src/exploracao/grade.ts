/**
 * Grade de lajes da fase lateral (Fase 6B), alinhada com o piso pintado dos corredores.
 *
 * O piso é desenhado em perspectiva: as juntas horizontais (`fileiras`, 5 valores de y para 4 fileiras)
 * são retas, e as juntas verticais convergem; cada uma é uma reta dada pelo x no topo da grade e pelo
 * x na base (`juntas`). Uma laje lógica é a região entre duas juntas verticais vizinhas e duas
 * fileiras — exatamente uma laje pintada. Medidas por scripts/calibrar-lajes.mjs.
 *
 * Funções puras (sem Phaser), usadas pelo motor, pela tela e pelos testes.
 */

export interface GradeLajes {
  /** y das juntas horizontais, de cima (fundo) para baixo (frente): fileiras.length − 1 fileiras. */
  fileiras: number[];
  /** Juntas verticais, da esquerda para a direita: [x no topo, x na base]. colunas = juntas.length − 1. */
  juntas: [number, number][];
  /** Uma string por fileira (0 = fundo), uma letra por coluna (S J A X E M I). */
  tabuleiro: string[];
  /** Lajes quebradas (buraco): [coluna, fileira]. */
  quebradas?: [number, number][];
}

export const colunas = (g: GradeLajes): number => g.juntas.length - 1;
export const linhas = (g: GradeLajes): number => g.fileiras.length - 1;

/** x da junta vertical `i` na altura y (reta entre o topo e a base da grade). */
export function juntaX(g: GradeLajes, i: number, y: number): number {
  const [topo, base] = g.juntas[i];
  const y0 = g.fileiras[0], y1 = g.fileiras[g.fileiras.length - 1];
  return topo + ((base - topo) * (y - y0)) / (y1 - y0);
}

/** Fileira do y (−1 acima da grade; linhas(g) abaixo). */
export function fileiraDoY(g: GradeLajes, y: number): number {
  if (y < g.fileiras[0]) return -1;
  for (let l = 0; l < linhas(g); l++) if (y < g.fileiras[l + 1]) return l;
  return linhas(g);
}

/** Coluna do ponto (x, y): −1 antes da primeira junta, colunas(g) depois da última. */
export function colunaEm(g: GradeLajes, x: number, y: number): number {
  if (x < juntaX(g, 0, y)) return -1;
  for (let c = 0; c < colunas(g); c++) if (x < juntaX(g, c + 1, y)) return c;
  return colunas(g);
}

/** Laje sob o ponto (os pés do herói), ou null fora da grade. */
export function lajeEm(g: GradeLajes, x: number, y: number): { col: number; lin: number } | null {
  const lin = fileiraDoY(g, y);
  if (lin < 0 || lin >= linhas(g)) return null;
  const col = colunaEm(g, x, y);
  if (col < 0 || col >= colunas(g)) return null;
  return { col, lin };
}

/** Centro, largura e altura de uma laje (a largura medida na altura do centro). */
export function centroLaje(g: GradeLajes, col: number, lin: number): { x: number; y: number; largura: number; altura: number } {
  const y = (g.fileiras[lin] + g.fileiras[lin + 1]) / 2;
  const xa = juntaX(g, col, y), xb = juntaX(g, col + 1, y);
  return { x: (xa + xb) / 2, y, largura: xb - xa, altura: g.fileiras[lin + 1] - g.fileiras[lin] };
}

/** Os 4 cantos de uma laje (para o contorno do modo de calibração). */
export function cantosLaje(g: GradeLajes, col: number, lin: number): [number, number][] {
  const ya = g.fileiras[lin], yb = g.fileiras[lin + 1];
  return [[juntaX(g, col, ya), ya], [juntaX(g, col + 1, ya), ya], [juntaX(g, col + 1, yb), yb], [juntaX(g, col, yb), yb]];
}

/** O herói já passou da grade (à direita da última junta, na altura dele)? */
export const depoisDaGrade = (g: GradeLajes, x: number, y: number, folga = 0): boolean => x > juntaX(g, colunas(g), y) + folga;

/** A grade inteira fica dentro da faixa de chão andável [yMin, yMax]? (cada fileira alcançável pelos pés) */
export const dentroDaFaixa = (g: GradeLajes, chao: [number, number]): boolean =>
  g.fileiras.slice(0, -1).every((y, l) => Math.max(y, chao[0]) < Math.min(g.fileiras[l + 1], chao[1]));

export const ehQuebrada = (g: GradeLajes, col: number, lin: number): boolean => !!g.quebradas?.some(([c, l]) => c === col && l === lin);

/**
 * Caminho de uma ponta à outra só por lajes que `pode` aceita (andando entre lajes vizinhas, sem
 * diagonal): o menor número de trocas de fileira, ou null se não houver caminho.
 */
export function menorTrocas(g: GradeLajes, pode: (letra: string, col: number, lin: number) => boolean): number | null {
  const C = colunas(g), L = linhas(g);
  const dist = new Map<string, number>();
  const fila: [number, number, number][] = [];
  for (let l = 0; l < L; l++) if (pode(g.tabuleiro[l][0], 0, l)) { fila.push([0, 0, l]); dist.set(`0,${l}`, 0); }
  while (fila.length) {
    fila.sort((a, b) => a[0] - b[0]);
    const [d, c, l] = fila.shift()!;
    if (c === C - 1) return d;
    for (const [dc, dl, w] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]]) {
      const cc = c + dc, ll = l + dl;
      if (cc < 0 || cc >= C || ll < 0 || ll >= L || !pode(g.tabuleiro[ll][cc], cc, ll)) continue;
      const k = `${cc},${ll}`;
      if ((dist.get(k) ?? Infinity) > d + w) { dist.set(k, d + w); fila.push([d + w, cc, ll]); }
    }
  }
  return null;
}

/** Quantos caminhos simples existem de uma ponta à outra só por lajes que `pode` aceita (até `limite`). */
export function contarCaminhos(g: GradeLajes, pode: (letra: string, col: number, lin: number) => boolean, limite = 50): number {
  const C = colunas(g), L = linhas(g);
  let n = 0;
  const visto = new Set<string>();
  const ir = (c: number, l: number) => {
    if (n >= limite) return;
    if (c === C - 1) { n++; return; }
    for (const [dc, dl] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, ll = l + dl, k = `${cc},${ll}`;
      if (cc < 0 || cc >= C || ll < 0 || ll >= L || visto.has(k) || !pode(g.tabuleiro[ll][cc], cc, ll)) continue;
      visto.add(k); ir(cc, ll); visto.delete(k);
    }
  };
  for (let l = 0; l < L; l++) if (pode(g.tabuleiro[l][0], 0, l)) { visto.add(`0,${l}`); ir(0, l); visto.delete(`0,${l}`); }
  return n;
}
