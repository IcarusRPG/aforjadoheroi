import CAP01 from '../data/capitulos/cap01.json';
import CAP02 from '../data/capitulos/cap02.json';
import AMEACAS from '../data/ameacas.json';
import REGIOES from '../data/regioes.json';
import { ASSETS, jaCarregado } from './assets';
import { getEstado } from './estado';
import { preCarregar, preCarregarEmSegundoPlano, type ItemPreload } from './preloader';
import { mostrarCarregando, type TelaCarregando } from './carregando';

/**
 * Pré-carregamento por etapa (Fase 4F). Cada etapa tem o seu manifesto, montado a partir dos dados
 * (capítulos, mapas, batalhas), sem lista feita à mão:
 *   intro → sonho → cap01 → cap02.
 * - Ao começar uma etapa, `garantirEtapa` baixa o que falta, com a tela de carregamento e a barra.
 * - Enquanto o jogador está numa etapa, a próxima vem em segundo plano, com prioridade baixa.
 * - Os arquivos ficam em memória (blob:), então as telas e o Phaser abrem na hora.
 */

export type Etapa = 'intro' | 'sonho' | 'cap01' | 'cap02';
const ORDEM: Etapa[] = ['intro', 'sonho', 'cap01', 'cap02'];

const KB = 1024;
type MapaJson = { id: string; chao?: { imagem?: string; blocos?: { imagem: string }[] }; imagem?: string; npcs?: { id: string }[]; seguidores?: { id: string }[]; objetos?: { item?: string; semIcone?: boolean }[]; itens?: { item: string; semIcone?: boolean }[]; objetosAtlas?: string };
const MAPAS = import.meta.glob<MapaJson>('../data/mapas/*.json', { eager: true, import: 'default' });
const mapaJson = (id: string) => Object.values(MAPAS).find((m) => m.id === id);
type InimigoJson = { id: string; sprite: string };
const INIMIGOS = Object.values(import.meta.glob<InimigoJson>('../data/inimigos/*.json', { eager: true, import: 'default' }));
type BatalhaJson = { id: string; inimigos: string[]; regiao: string };
const BATALHAS = Object.values(import.meta.glob<BatalhaJson>('../data/batalhas/*.json', { eager: true, import: 'default' }));

/** Todos os valores de uma chave em qualquer profundidade do JSON. */
function valores(dado: unknown, chave: string, saida = new Set<string>()): Set<string> {
  if (Array.isArray(dado)) dado.forEach((d) => valores(d, chave, saida));
  else if (dado && typeof dado === 'object') {
    for (const [k, v] of Object.entries(dado)) {
      if (k === chave && typeof v === 'string') saida.add(v);
      else valores(v, chave, saida);
    }
  }
  return saida;
}

/** Chão em blocos, chibis dos moradores e seguidores, e ícones dos itens de um mapa. */
export function itensDoMapa(id: string): ItemPreload[] {
  const m = mapaJson(id);
  if (!m) return [];
  const itens: ItemPreload[] = [];
  const blocos = m.chao?.blocos?.map((b) => b.imagem) ?? [m.chao?.imagem ?? m.imagem].filter((x): x is string => !!x);
  for (const b of blocos) itens.push({ caminho: b, estimativa: 450 * KB });
  for (const n of new Set([...(m.npcs ?? []).map((x) => x.id), ...(m.seguidores ?? []).map((x) => x.id)])) itens.push({ caminho: ASSETS.chibi(n), estimativa: 8 * KB });
  // Itens de interação (no formato novo ficam em `itens`; `objetos` são os sprites do cenário).
  const deInteracao = m.itens ?? (m.objetos ?? []).filter((x): x is { item: string; semIcone?: boolean } => !!x.item);
  for (const o of new Set(deInteracao.filter((x) => !x.semIcone).map((x) => x.item))) itens.push({ caminho: ASSETS.item(o), estimativa: 15 * KB });
  if (m.objetosAtlas) itens.push({ caminho: `${m.objetosAtlas}.webp`, estimativa: 2400 * KB }, { caminho: `${m.objetosAtlas}.json`, estimativa: 4 * KB });
  return itens;
}

function itensDoCapitulo(cap: unknown): ItemPreload[] {
  const p = getEstado().personagem;
  const itens: ItemPreload[] = [];
  const fundos = new Set([...valores(cap, 'fundo'), ...valores(cap, 'fundoFim')]);
  for (const f of fundos) itens.push({ caminho: ASSETS.cena(f), estimativa: 350 * KB });
  for (const q of valores(cap, 'quem')) if (q !== 'heroi' && q !== 'pensamento') itens.push({ caminho: ASSETS.retratoNpc(q), estimativa: 120 * KB });
  // Expressões usadas (ex.: Aylin chorando).
  const falas = (cap as { cenas: { falas?: { quem?: string; expressao?: string }[] }[] }).cenas.flatMap((c) => c.falas ?? []);
  for (const f of falas) if (f.quem && f.expressao) itens.push({ caminho: ASSETS.retratoNpc(f.quem, f.expressao), estimativa: 130 * KB, opcional: true });
  if (p) itens.push({ caminho: ASSETS.bustoHeroi(p.raca, p.genero), estimativa: 110 * KB });
  for (const a of valores(cap, 'ameaca')) {
    const img = (AMEACAS as Record<string, { imagem?: string }>)[a]?.imagem;
    if (img) itens.push({ caminho: ASSETS.ameaca(img), estimativa: 60 * KB });
  }
  for (const m of valores(cap, 'mapa')) itens.push(...itensDoMapa(m));
  const batalhas = [...valores(cap, 'batalha')].map((id) => BATALHAS.find((b) => b.id === id)).filter((b): b is BatalhaJson => !!b);
  for (const b of batalhas) {
    const fundo = (REGIOES as Record<string, { fundo: string }>)[b.regiao]?.fundo;
    if (fundo) itens.push({ caminho: ASSETS.fundoBatalha(fundo), estimativa: 450 * KB });
    for (const i of b.inimigos) {
      const sprite = INIMIGOS.find((x) => x.id === i)?.sprite ?? i;
      itens.push({ caminho: `${ASSETS.spriteBatalhaInimigo(sprite)}.png`, estimativa: 40 * KB }, { caminho: `${ASSETS.spriteBatalhaInimigo(sprite)}.json`, estimativa: 2 * KB });
    }
  }
  if (p && batalhas.length) {
    const base = ASSETS.spriteBatalhaHeroi(p.raca, p.genero);
    itens.push({ caminho: `${base}.png`, estimativa: 25 * KB }, { caminho: `${base}.json`, estimativa: 2 * KB });
  }
  return itens;
}

/** O manifesto de uma etapa (sem repetidos). */
export function itensDaEtapa(e: Etapa): ItemPreload[] {
  const p = getEstado().personagem;
  let itens: ItemPreload[] = [];
  if (e === 'intro') {
    itens = [
      { caminho: ASSETS.cena('intro-fullmun'), estimativa: 450 * KB },
      { caminho: ASSETS.retratoNpc('artho'), estimativa: 110 * KB },
      { caminho: ASSETS.retratoNpc('nyme'), estimativa: 105 * KB },
    ];
  } else if (e === 'sonho') {
    itens = itensDoMapa('sonho');
    if (p) itens.push({ caminho: ASSETS.spriteChibi(p.raca, p.genero), estimativa: 8 * KB });
  } else if (e === 'cap01') {
    itens = itensDoCapitulo(CAP01);
    // Os sete deuses do Caderno de estudos (aberto a qualquer momento).
    for (const d of ['solem', 'justar', 'ardor', 'expiria', 'eternus', 'mentis', 'irae']) itens.push({ caminho: `img/panteao/${d}.webp`, estimativa: 150 * KB });
    if (p) itens.push({ caminho: ASSETS.spriteChibi(p.raca, p.genero), estimativa: 8 * KB });
  } else if (e === 'cap02') {
    itens = itensDoCapitulo(CAP02);
    for (const d of ['bellica', 'nocturna', 'draconara']) itens.push({ caminho: `img/panteao/${d}.webp`, estimativa: 150 * KB });
    if (p) itens.push({ caminho: ASSETS.spriteChibi(p.raca, p.genero), estimativa: 8 * KB });
  }
  const vistos = new Set<string>();
  return itens.filter((i) => !vistos.has(i.caminho) && vistos.add(i.caminho));
}

/** A etapa da campanha atual (pelo capítulo). */
export function etapaDoCapitulo(): Etapa {
  const c = getEstado().campanha;
  // A parte do templo do Prólogo (antigo Capítulo 02) carrega as cenas e mapas dela.
  return c.ato >= 1 || c.parte === 'templo' ? 'cap02' : 'cap01';
}

const prontas = new Set<Etapa>();
const emAndamento = new Map<Etapa, Promise<void>>();

/**
 * Garante que tudo da etapa está em memória antes de a tela aparecer. Se faltar algo, cobre `raiz` com a
 * tela de carregamento (barra de progresso). Se um arquivo falhar mesmo depois das novas tentativas,
 * mostra "Não foi possível carregar…" com "Tentar de novo" (nunca a tela vazia). Depois, a próxima
 * etapa começa a vir em segundo plano.
 */
export async function garantirEtapa(e: Etapa, raiz: HTMLElement = document.body, tela?: TelaCarregando, extras: ItemPreload[] = []): Promise<void> {
  const faltamExtras = extras.filter((i) => !jaCarregado(i.caminho));
  if (faltamExtras.length) await carregarItens(faltamExtras, raiz, tela);
  if (!prontas.has(e)) {
    let p = emAndamento.get(e);
    if (!p) {
      p = carregarComTela(e, raiz, tela).finally(() => emAndamento.delete(e));
      emAndamento.set(e, p);
    }
    await p;
  }
  preCarregarProxima(e);
}

/** Com `existente`, usa a tela de quem chamou (e não a fecha: o mapa ainda vai montar o Phaser). */
async function carregarComTela(e: Etapa, raiz: HTMLElement, existente?: TelaCarregando): Promise<void> {
  await carregarItens(itensDaEtapa(e).filter((i) => !jaCarregado(i.caminho)), raiz, existente);
  prontas.add(e);
}

async function carregarItens(itens: ItemPreload[], raiz: HTMLElement, existente?: TelaCarregando): Promise<void> {
  let faltam = itens;
  if (!faltam.length) return;
  const tela = existente ?? mostrarCarregando(raiz);
  try {
    for (;;) {
      // O que é opcional e não veio não segura a etapa (a tela usa a alternativa).
      const falhas = (await preCarregar(faltam, (f) => tela.progresso(f))).filter((i) => !i.opcional);
      if (!falhas.length) break;
      faltam = falhas;
      await tela.falhou();
    }
  } finally {
    if (!existente) tela.fechar();
  }
}

let fundo: Promise<void> | null = null;
/** Baixa a próxima etapa sem pressa, um arquivo por vez, com prioridade baixa. */
export function preCarregarProxima(e: Etapa): void {
  const proxima = ORDEM[ORDEM.indexOf(e) + 1];
  if (!proxima || prontas.has(proxima) || fundo) return;
  const itens = itensDaEtapa(proxima).filter((i) => !jaCarregado(i.caminho));
  fundo = preCarregarEmSegundoPlano(itens).finally(() => { fundo = null; });
}

/** Para os testes: o que já está em memória de cada etapa. */
export function estadoEtapas() {
  return Object.fromEntries(ORDEM.map((e) => {
    const itens = itensDaEtapa(e);
    return [e, { total: itens.length, carregados: itens.filter((i) => jaCarregado(i.caminho)).length }];
  }));
}
