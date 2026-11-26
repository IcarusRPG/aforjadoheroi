import { classePorId, pmPrimeiroNivel, pvPrimeiroNivel } from './classes';
import COMPENDIO from '../data/compendio.json';
import ITENS from '../data/itens.json';
import NPCS from '../data/npcs.json';
import { lerDado, rolar } from './dados';
import { atualizarCampanha, getEstado, marcarFlag, temFlag, type EstadoMissao } from './estado';
import { pvAntesDaForjaDe } from './pericias';
import { textos } from './textos';
import { avisar } from './toasts';
import { dica } from './tutorial';

/**
 * Progresso da Fase 4: relações, relógio do atraso, inventário e Reais, missões e Compêndio.
 * Tudo é alterado por efeitos vindos dos dados (cenas e missões); nada de valores fixos no código.
 */

const T = () => textos.progresso;
const NOMES = NPCS as Record<string, { nome: string }>;
export const nomeDe = (id: string): string => NOMES[id]?.nome ?? id;

// ---------------------------------------------------------------- relações

export type IdNivel = 'ressentido' | 'frio' | 'neutro' | 'simpatico' | 'amigo' | 'leal';

export function nivelRelacao(pontos: number): IdNivel {
  if (pontos <= -2) return 'ressentido';
  if (pontos === -1) return 'frio';
  if (pontos === 0) return 'neutro';
  if (pontos <= 2) return 'simpatico';
  if (pontos <= 4) return 'amigo';
  return 'leal';
}
export const nomeNivel = (n: IdNivel): string => (T().niveis as Record<IdNivel, string>)[n];
export const relacao = (id: string): number => getEstado().campanha.relacoes[id] ?? 0;

export function mudarRelacao(id: string, delta: number): void {
  if (!delta) return;
  const c = getEstado().campanha;
  const antes = c.relacoes[id] ?? 0;
  const depois = antes + delta;
  atualizarCampanha({ relacoes: { ...c.relacoes, [id]: depois } });
  const sinal = delta > 0 ? `♥ +${delta}` : `♡ −${Math.abs(delta)}`;
  avisar(`${nomeDe(id)} ${sinal}`, delta > 0 ? 'toast-mais' : 'toast-menos', delta > 0 ? 'coracao-mais' : 'coracao-menos');
  void dica('relacao');
  const nAntes = nivelRelacao(antes), nDepois = nivelRelacao(depois);
  if (nAntes !== nDepois) avisar(T().agoraE.replace('{nome}', nomeDe(id)).replace('{nivel}', nomeNivel(nDepois)), 'toast-nivel');
}

// ---------------------------------------------------------------- atraso

export const MAX_ATRASO = 4;
export function nomeAtraso(marcas: number, genero: 'm' | 'f' = getEstado().personagem?.genero ?? 'm'): string {
  const e = T().atraso as Record<string, string>;
  const chave = marcas <= 0 ? '0' : marcas <= 2 ? '1' : marcas === 3 ? '3' : '4';
  return e[chave].replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_m, a: string, b: string) => (genero === 'f' ? b : a));
}
type OuvinteAtraso = (marcas: number) => void;
const ouvintesAtraso = new Set<OuvinteAtraso>();
export const aoMudarAtraso = (fn: OuvinteAtraso) => { ouvintesAtraso.add(fn); return () => ouvintesAtraso.delete(fn); };

export function somarAtraso(n: number): void {
  if (!n) return;
  const v = Math.max(0, Math.min(MAX_ATRASO, getEstado().campanha.atraso + n));
  atualizarCampanha({ atraso: v });
  ouvintesAtraso.forEach((f) => f(v));
}

/** Atraso que vale no Capítulo 02: uma marca a menos se o cesto de pães chegou intacto. */
export function atrasoFinal(): number {
  const c = getEstado().campanha;
  return Math.max(0, c.atraso - (cestoIntacto() ? 1 : 0));
}

// ---------------------------------------------------------------- inventário

export interface DefItem { nome: string; tipo: 'cura' | 'chave' | 'missao'; /** Item-chave que nunca sai do inventário (Caderno de estudos). */ permanente?: boolean; cura?: string; icone: string; texto?: string; grupo?: string; total?: number; missao?: string; contador?: { rotulo: string; total: number } }
export const ITENS_DEF = ITENS as Record<string, DefItem>;
export const qtdItem = (id: string): number => getEstado().campanha.inventario[id] ?? 0;

export function darItem(id: string, qtd = 1): void {
  const inv = { ...getEstado().campanha.inventario };
  inv[id] = Math.max(0, (inv[id] ?? 0) + qtd);
  if (!inv[id]) delete inv[id];
  atualizarCampanha({ inventario: inv });
}

export function somarReais(n: number): void {
  atualizarCampanha({ reais: Math.max(0, getEstado().campanha.reais + n) });
}

export const cestoIntacto = (): boolean => qtdItem('cesto-paes') > 0 && !temFlag('comeu_pao');
/** PV máximos: antes da Forja, 10 + CON; depois (Ato I, Parte 6), os da classe. */
export const pvMaxAtual = (): number => {
  const p = getEstado().personagem;
  if (!p) return 10;
  const c = classePorId(p.classe);
  return temFlag('forjado') && c ? pvPrimeiroNivel(c, p.atributosFinais) : pvAntesDaForjaDe(p);
};
/** PM máximos: nenhum antes da Forja; depois, os da classe. */
export const pmMaxAtual = (): number => {
  const p = getEstado().personagem;
  const c = p ? classePorId(p.classe) : null;
  return p && c && temFlag('forjado') ? pmPrimeiroNivel(c, p.atributosFinais, p.raca) : 0;
};
export const pvAtual = (): number => getEstado().campanha.pvAtual ?? pvMaxAtual();

/** Rola a cura do item (sem passar do máximo) e devolve quantos PV voltaram. */
export function curarCom(dado: string, pvDe = pvAtual()): { novo: number; recuperou: number; rolagem: number } {
  const d = lerDado(dado);
  const rolagem = rolar(d.qtd, d.lados).reduce((a, b) => a + b, 0) + d.mod;
  const novo = Math.min(pvMaxAtual(), pvDe + rolagem);
  return { novo, recuperou: novo - pvDe, rolagem };
}

/** Usa um item de cura fora da batalha. */
export function usarItemCura(id: string): number {
  const def = ITENS_DEF[id];
  if (!def?.cura || qtdItem(id) <= 0) return 0;
  const r = curarCom(def.cura);
  darItem(id, -1);
  atualizarCampanha({ pvAtual: r.novo });
  return r.recuperou;
}

/** Come um pão do cesto: 1d4 PV, um pão a menos; na primeira vez o cesto deixa de estar intacto (Tobias −1). */
export function comerPao(): number {
  if (qtdItem('cesto-paes') <= 0) return 0;
  const r = curarCom('1d4');
  darItem('cesto-paes', -1);
  atualizarCampanha({ pvAtual: r.novo });
  if (!temFlag('comeu_pao')) {
    marcarFlag('comeu_pao');
    mudarRelacao('tobias', -1);
  }
  return r.recuperou;
}

// ---------------------------------------------------------------- missões

export const estadoMissao = (id: string): EstadoMissao => getEstado().campanha.missoes[id] ?? 'nao_iniciada';
export function definirMissao(id: string, estado: EstadoMissao): void {
  atualizarCampanha({ missoes: { ...getEstado().campanha.missoes, [id]: estado } });
}

export function somarContador(id: string, n = 1): number {
  const c = getEstado().campanha.contadores;
  const v = (c[id] ?? 0) + n;
  atualizarCampanha({ contadores: { ...c, [id]: v } });
  return v;
}
export const contador = (id: string): number => getEstado().campanha.contadores[id] ?? 0;

// ---------------------------------------------------------------- Compêndio

interface Gatilho { flag?: string; missao?: string; nivel?: IdNivel; relacaoMin?: number }
interface Paragrafo { texto?: string; gatilho?: Gatilho; variantes?: { texto: string; requer?: { flag?: string } }[] }
export interface FichaPersonagem { id: string; nome: string; raca: string; papel: string; paragrafos: Paragrafo[] }
export interface FichaBestiario { id: string; nome: string; tipo: string; imagem: { tipo: 'ilustracao' | 'sprite'; id: string }; texto: string; sabe: string }
export const COMPENDIO_DADOS = COMPENDIO as unknown as { personagens: FichaPersonagem[]; bestiario: FichaBestiario[]; vozes: { id: string; nomeDivindade: string | null }[] };

const ORDEM_NIVEIS: IdNivel[] = ['ressentido', 'frio', 'neutro', 'simpatico', 'amigo', 'leal'];

function gatilhoAtende(id: string, g: Gatilho | undefined): boolean {
  if (!g) return true;
  if (g.flag && !temFlag(g.flag)) return false;
  if (g.missao && estadoMissao(g.missao) !== 'concluida') return false;
  if (g.nivel && ORDEM_NIVEIS.indexOf(nivelRelacao(relacao(id))) < ORDEM_NIVEIS.indexOf(g.nivel)) return false;
  if (g.relacaoMin !== undefined && relacao(id) < g.relacaoMin) return false;
  return true;
}

/** Parágrafos liberados da ficha (null = personagem ainda não conhecido). */
export function paragrafosLiberados(f: FichaPersonagem): (string | null)[] | null {
  if (!getEstado().campanha.compendio.conhecidos.includes(f.id)) return null;
  return f.paragrafos.map((p) => {
    if (!gatilhoAtende(f.id, p.gatilho)) return null;
    if (p.variantes) return (p.variantes.find((v) => !v.requer?.flag || temFlag(v.requer.flag)) ?? p.variantes[p.variantes.length - 1]).texto;
    return p.texto ?? null;
  });
}

export function conhecer(id: string): void {
  const comp = getEstado().campanha.compendio;
  if (comp.conhecidos.includes(id)) return;
  atualizarCampanha({ compendio: { ...comp, conhecidos: [...comp.conhecidos, id] } });
  verificarCompendio();
}

/** Conhece o personagem sem aviso (intro de Füllmun): o que já está liberado conta como visto. */
export function conhecerEmSilencio(id: string): void {
  const comp = getEstado().campanha.compendio;
  if (comp.conhecidos.includes(id)) return;
  const f = COMPENDIO_DADOS.personagens.find((x) => x.id === id);
  const conhecidos = [...comp.conhecidos, id];
  atualizarCampanha({ compendio: { ...comp, conhecidos } });
  const n = f ? (paragrafosLiberados(f) ?? []).filter(Boolean).length : 0;
  atualizarCampanha({ compendio: { ...getEstado().campanha.compendio, vistos: { ...getEstado().campanha.compendio.vistos, [id]: n } } });
}

export function encontrarCriatura(id: string, sabe = false): void {
  const comp = getEstado().campanha.compendio;
  const atual = comp.bestiario[id];
  if (atual && (atual.sabe || !sabe)) return;
  atualizarCampanha({ compendio: { ...comp, bestiario: { ...comp.bestiario, [id]: { sabe: sabe || !!atual?.sabe } } } });
  const nome = COMPENDIO_DADOS.bestiario.find((b) => b.id === id)?.nome ?? id;
  avisar(T().compendioAtualizado.replace('{nome}', nome), 'toast-compendio', 'compendio');
  void dica('compendio');
  atualizarCampanha({ compendio: { ...getEstado().campanha.compendio, novidade: true } });
}

/** Compara o que está liberado com o que já foi anunciado e avisa as novidades. */
export function verificarCompendio(): void {
  const comp = getEstado().campanha.compendio;
  const vistos = { ...comp.vistos };
  let mudou = false;
  for (const f of COMPENDIO_DADOS.personagens) {
    const lib = paragrafosLiberados(f);
    if (!lib) continue;
    const n = lib.filter(Boolean).length;
    if (n > (vistos[f.id] ?? 0)) {
      vistos[f.id] = n;
      mudou = true;
      avisar(T().compendioAtualizado.replace('{nome}', f.nome), 'toast-compendio', 'compendio');
      void dica('compendio');
    }
  }
  if (mudou) atualizarCampanha({ compendio: { ...getEstado().campanha.compendio, vistos, novidade: true } });
}

export function marcarCompendioVisto(): void {
  atualizarCampanha({ compendio: { ...getEstado().campanha.compendio, novidade: false } });
}
