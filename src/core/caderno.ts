import DADOS from '../data/caderno.json';
import { atualizarCampanha, getEstado } from './estado';
import { textos } from './textos';
import { avisar } from './toasts';

/**
 * Caderno de estudos do herói (Fase 4E): páginas dos deuses, anotações e perguntas sem resposta.
 * O que aparece sai dos gatilhos (src/data/caderno.json), calculados do progresso (flags, cenas,
 * capítulo). Por isso um save antigo já abre o caderno coerente com o que aconteceu.
 * No save fica só o que já foi anunciado (`anunciados`) e se há novidade (ponto dourado no menu).
 */

export interface Gatilho { inicio?: boolean; flag?: string; cena?: string; capituloMin?: number; parte?: 'templo' }
export interface PaginaCaderno {
  id: string;
  titulo?: string;
  deus?: { nome: string; grupo: 'alfar' | 'baldur'; dominio: string };
  /** Imagem em img/panteao/<id>.webp; null = moldura vazia com "?" (Odincia). */
  imagem?: string | null;
  gatilho: Gatilho;
  texto: string[];
  margem?: { texto: string; sublinhado?: number };
  /** Linha a mais para heróis de uma raça (Eternus e os Nyashi). */
  extra?: { raca: string; texto: string };
}
export interface AnotacaoCaderno { id: string; data?: string; gatilho: Gatilho; texto: string; sozinha?: boolean }
export interface PerguntaCaderno { id: string; gatilho: Gatilho; texto: string; respondida?: { gatilho: Gatilho; resposta: string } }

export const CADERNO = DADOS as unknown as { paginas: PaginaCaderno[]; anotacoes: AnotacaoCaderno[]; perguntas: PerguntaCaderno[] };

/** O gatilho já aconteceu? */
export function gatilhoCaderno(g: Gatilho): boolean {
  const e = getEstado();
  if (!e.personagem) return false;
  const c = e.campanha;
  if (g.flag && !c.flags.includes(g.flag)) return false;
  if (g.cena && !c.caminho.some((p) => p.cena === g.cena) && c.cena !== g.cena) return false;
  if (g.capituloMin !== undefined && c.capitulo < g.capituloMin) return false;
  // Parte do Capítulo 01 (ou qualquer capítulo depois dele).
  if (g.parte && !(c.capitulo > 1 || c.parte === g.parte)) return false;
  return true;
}

const chave = (tipo: 'p' | 'a' | 'q', id: string) => `${tipo}:${id}`;

/** Tudo o que já está liberado, com a chave usada no save. */
export function liberados() {
  const paginas = CADERNO.paginas.filter((p) => gatilhoCaderno(p.gatilho));
  const anotacoes = CADERNO.anotacoes.filter((a) => gatilhoCaderno(a.gatilho));
  const perguntas = CADERNO.perguntas.filter((q) => gatilhoCaderno(q.gatilho));
  const chaves = [...paginas.map((p) => chave('p', p.id)), ...anotacoes.map((a) => chave('a', a.id)), ...perguntas.map((q) => chave('q', q.id))];
  return { paginas, anotacoes, perguntas, chaves };
}

export const perguntaRespondida = (q: PerguntaCaderno): boolean => !!q.respondida && gatilhoCaderno(q.respondida.gatilho);

/**
 * Compara o que está liberado com o que já foi anunciado. Novidade: toast "Caderno atualizado" (na fila
 * dos outros avisos) e o ponto dourado no atalho do menu. Na primeira vez (jogo novo ou save antigo),
 * o que já existe entra sem aviso.
 */
export function verificarCaderno(): void {
  const e = getEstado();
  if (!e.personagem) return;
  const atual = e.campanha.caderno;
  const { chaves } = liberados();
  if (!atual) {
    atualizarCampanha({ caderno: { anunciados: chaves, novidade: false } });
    return;
  }
  const novas = chaves.filter((k) => !atual.anunciados.includes(k));
  if (!novas.length) return;
  atualizarCampanha({ caderno: { anunciados: [...atual.anunciados, ...novas], novidade: true } });
  avisar(textos.caderno.atualizado, 'toast-caderno', 'compendio');
}

/** Abriu o caderno: some o ponto dourado. */
export function marcarCadernoVisto(): void {
  const c = getEstado().campanha.caderno;
  if (c?.novidade) atualizarCampanha({ caderno: { ...c, novidade: false } });
}

export const cadernoTemNovidade = (): boolean => !!getEstado().campanha.caderno?.novidade;

/** Para os testes. */
export function estadoCaderno() {
  const l = liberados();
  return {
    paginas: l.paginas.map((p) => p.id),
    anotacoes: l.anotacoes.map((a) => a.id),
    perguntas: l.perguntas.map((q) => q.id),
    novidade: cadernoTemNovidade(),
  };
}
