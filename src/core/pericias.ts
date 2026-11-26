import ORIGENS_JSON from '../data/origens.json';
import { racaPorId } from './regras';
import type { Atributo, Personagem } from './estado';

/**
 * Perícias do sistema Icarus (as usadas até aqui) e o bônus do herói em cada uma.
 *
 * Antes da Forja o herói ainda não despertou a classe: o treino de classe NÃO conta. Contam o atributo,
 * o +2 da origem (se a perícia for a da origem), os bônus raciais de perícia (ex.: variantes Azakar) e
 * o bônus do próximo teste (ex.: a prece do Religioso).
 */
export const PERICIAS = {
  intimidacao: { nome: 'Intimidação', atributo: 'CAR' },
  adestramento: { nome: 'Adestramento', atributo: 'CAR' },
  luta: { nome: 'Luta', atributo: 'FOR' },
  cura: { nome: 'Cura', atributo: 'SAB' },
  investigacao: { nome: 'Investigação', atributo: 'INT' },
  iniciativa: { nome: 'Iniciativa', atributo: 'DES' },
  fortitude: { nome: 'Fortitude', atributo: 'CON' },
  misticismo: { nome: 'Misticismo', atributo: 'INT' },
  religiao: { nome: 'Religião', atributo: 'SAB' },
  diplomacia: { nome: 'Diplomacia', atributo: 'CAR' },
  intuicao: { nome: 'Intuição', atributo: 'SAB' },
  enganacao: { nome: 'Enganação', atributo: 'CAR' },
  furtividade: { nome: 'Furtividade', atributo: 'DES' },
  atletismo: { nome: 'Atletismo', atributo: 'FOR' },
  barganha: { nome: 'Barganha', atributo: 'CAR' },
  reflexos: { nome: 'Reflexos', atributo: 'DES' },
  // Fase 6 (Ato I): Núcleo do Icarus.
  audicao: { nome: 'Audição', atributo: 'SAB' },
  visao: { nome: 'Visão', atributo: 'SAB' },
  vontade: { nome: 'Vontade', atributo: 'SAB' },
} as const satisfies Record<string, { nome: string; atributo: Atributo }>;

export type IdPericia = keyof typeof PERICIAS;

interface Origem { id: string; pericia: string; bonusPericia: number }
const ORIGENS = ((ORIGENS_JSON as unknown as { origens?: Origem[] }).origens ?? (ORIGENS_JSON as unknown as Origem[]));

export interface ParteBonus { rotulo: string; valor: number }

/** Partes do bônus do herói na perícia (sem o d20). `extra` = bônus do próximo teste. */
export function bonusPericia(p: Personagem, pericia: IdPericia, extra = 0): { total: number; partes: ParteBonus[] } {
  const def = PERICIAS[pericia];
  const partes: ParteBonus[] = [{ rotulo: def.atributo, valor: p.atributosFinais[def.atributo] }];
  const origem = ORIGENS.find((o) => o.id === p.origem);
  if (origem && origem.pericia === def.nome) partes.push({ rotulo: 'origem', valor: origem.bonusPericia });
  const variante = racaPorId(p.raca)?.variantes?.find((v) => v.id === p.variante) as { pericias?: Record<string, number> } | undefined;
  const racial = variante?.pericias?.[def.nome];
  if (racial) partes.push({ rotulo: 'raça', valor: racial });
  if (extra) partes.push({ rotulo: 'bônus', valor: extra });
  return { total: partes.reduce((s, x) => s + x.valor, 0), partes };
}

/** PV e Defesa antes da Forja (sem classe). */
export const pvAntesDaForjaDe = (p: Personagem): number => 10 + p.atributosFinais.CON;
export const defesaDe = (p: Personagem): number => 10 + p.atributosFinais.DES;
