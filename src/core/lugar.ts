import { ATOS, parteAtual } from '../narrativa/capitulo';
import type { EstadoJogo } from './estado';

/** Nome legível do lugar onde o jogo está, para os cards de save ("Füllmun — Praça do mercado"). */

interface DadosLugarMapa {
  id: string;
  nome?: string;
  /** Áreas nomeadas do mapa, em retângulos [x0, y0, x1, y1]; vale a primeira que contém o herói. */
  areas?: { nome: string; ret: [number, number, number, number] }[];
}

const MAPAS = Object.fromEntries(
  Object.values(import.meta.glob<DadosLugarMapa>('../data/mapas/*.json', { eager: true, import: 'default' })).map((m) => [m.id, m]),
);

export function lugarDoMapa(id: string, x?: number, y?: number): string {
  const m = MAPAS[id];
  if (!m) return '';
  const nome = m.nome ?? id;
  if (x === undefined || y === undefined) return nome;
  const area = m.areas?.find(({ ret: [x0, y0, x1, y1] }) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  return area ? `${nome} — ${area.nome}` : nome;
}

export function localDoJogo(e: Pick<EstadoJogo, 'personagem' | 'sonho' | 'campanha'>): { ato: number; parte?: string | number; local: string } {
  if (!e.personagem?.classe) return { ato: 0, local: 'Criação do herói' };
  if (!e.sonho.concluido) return { ato: 0, local: 'O sonho dos deuses' };
  const c = e.campanha;
  if (!ATOS[c.ato]) return { ato: c.ato, parte: c.parte, local: '' };
  // "Prólogo · Füllmun — Praça" ou "Ato I · Provação Sob a Luz — O túnel".
  const cap = parteAtual(c);
  const nomeParte = typeof c.parte === 'number' ? cap.nomesPartes?.[c.parte] : undefined;
  if (nomeParte) return { ato: c.ato, parte: c.parte, local: nomeParte };
  if (c.local.tela === 'mapa' && c.local.mapa) return { ato: c.ato, parte: c.parte, local: lugarDoMapa(c.local.mapa, c.local.x, c.local.y) };
  return { ato: c.ato, parte: c.parte, local: cap.lugar ?? '' };
}
