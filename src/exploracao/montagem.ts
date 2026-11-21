import type { CamadaColisao, Ponto } from './tipos';

/**
 * Montagem de mapas feitos de chão + objetos (Fase 5). O JSON do mapa traz:
 *   objetos: [{ id, x, y, espelhar?, pe?, linhaY? }]   (sprites do atlas; x, y = centro da base)
 *   colisoesExtras: água, bordas, o que não é objeto     itens, gatilhos (de cena), npcs, retornos…
 * e src/data/objetos.json traz, por tipo de objeto, o pé (retângulo que bloqueia, relativo à base),
 * a linha de profundidade, se tem copa e as animações. Aqui isso vira o formato que o jogo já usa:
 * `colisoes` (chão andável → extras bloqueados → pés → extras andáveis, como a ponte), `objetos`
 * (os itens de interação), `gatilhosCena` e `cenario` (os objetos para desenhar).
 * Sem `colisoesExtras`, o mapa está no formato antigo e volta como está.
 */

export interface Animacao {
  tipo: 'fumaca' | 'fogo' | 'lanterna' | 'varal' | 'balanco';
  /** Posição relativa à base do objeto, em frações da largura e da altura (x para a direita, y para cima negativo). */
  x?: number;
  y?: number;
  /** Raio do brilho (px), para fogo e lanterna. */
  raio?: number;
}
export interface TipoObjeto {
  largura: number;
  altura: number;
  /** [x0, y0, x1, y1] relativo à base (y para cima é negativo). */
  pe: [number, number, number, number];
  /** Linha de profundidade relativa à base (normalmente 0, a própria base). */
  linhaY: number;
  /** Árvore grande: a copa fica translúcida (60%) quando alguém passa atrás. */
  copa?: boolean;
  animacao?: Animacao[];
  /** Sem pé (cobre o chão, mas não bloqueia: o tapete de flores, por exemplo). */
  semColisao?: boolean;
}
export interface ObjetoCenario {
  id: string;
  x: number;
  y: number;
  espelhar?: boolean;
  /** Ajuste só desta instância (o editor grava aqui). */
  pe?: [number, number, number, number];
  linhaY?: number;
}
export interface ObjetoMontado extends ObjetoCenario {
  /** Índice no JSON (para o editor). */
  indice: number;
  peAbs: [number, number, number, number] | null;
  profundidade: number;
  copa: boolean;
  animacao: Animacao[];
}

/** Pé de uma instância, em coordenadas do mapa (espelhado se for o caso); null se não bloqueia. */
export function peDoObjeto(o: ObjetoCenario, tipos: Record<string, TipoObjeto>): [number, number, number, number] | null {
  const t = tipos[o.id];
  if (!t || t.semColisao) return null;
  let [x0, y0, x1, y1] = o.pe ?? t.pe;
  if (o.espelhar) [x0, x1] = [-x1, -x0];
  return [o.x + x0, o.y + y0, o.x + x1, o.y + y1];
}

export const retangulo = ([x0, y0, x1, y1]: [number, number, number, number]): Ponto[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function montarObjetos(objetos: ObjetoCenario[], tipos: Record<string, TipoObjeto>): ObjetoMontado[] {
  return objetos.map((o, indice) => {
    const t = tipos[o.id];
    return {
      ...o, indice,
      peAbs: peDoObjeto(o, tipos),
      profundidade: o.y + (o.linhaY ?? t?.linhaY ?? 0),
      copa: !!t?.copa,
      animacao: t?.animacao ?? [],
    };
  });
}

/** As colisões do mapa montado: chão andável → extras bloqueados → pés → extras andáveis. */
export function colisoesMontadas(extras: CamadaColisao[], objetos: ObjetoMontado[]): CamadaColisao[] {
  const chao = extras.filter((c) => c.id === 'chao');
  const bloqueios = extras.filter((c) => c.id !== 'chao' && c.tipo === 'bloqueado');
  const andaveis = extras.filter((c) => c.id !== 'chao' && c.tipo === 'andavel');
  const pes: CamadaColisao[] = objetos.filter((o) => o.peAbs).map((o) => ({ id: `pe:${o.id}#${o.indice}`, tipo: 'bloqueado', pontos: retangulo(o.peAbs!) }));
  return [...chao, ...bloqueios, ...pes, ...andaveis];
}

/** Normaliza um mapa do formato novo para o formato usado pelo jogo (e pelos testes da grade). */
export function montarMapa<T extends Record<string, unknown>>(m: T, tipos: Record<string, TipoObjeto>): T & { cenario: ObjetoMontado[] } {
  const r = m as Record<string, unknown>;
  if (!Array.isArray(r.colisoesExtras)) return { ...m, cenario: [] };
  const cenario = montarObjetos((r.objetos as ObjetoCenario[]) ?? [], tipos);
  return {
    ...m,
    cenario,
    colisoes: colisoesMontadas(r.colisoesExtras as CamadaColisao[], cenario),
    objetos: r.itens ?? [],
    gatilhosCena: r.gatilhos ?? [],
    gatilhos: [],
    interacoes: r.interacoes ?? [],
  };
}
