import type { Genero } from './assets';
import {
  VERSAO_SAVE, agora, gravarSlot, lerSlot, maisRecente, montarRegistro, pedirPersistencia,
  type DadosJogo, type IdSlot, type MetaSave, type RegistroSave,
} from './saves';

/**
 * Estado do jogo em memória. As opções ficam em `fdg.opcoes`; o resto (herói, sonho, campanha e tempo
 * de jogo) vai para os slots de save (src/core/saves.ts): o automático a cada mudança, os manuais só
 * quando o jogador escolhe.
 */

export const ATRIBUTOS = ['FOR', 'DES', 'CON', 'INT', 'SAB', 'CAR'] as const;
export type Atributo = (typeof ATRIBUTOS)[number];
export type MapaAtributos = Record<Atributo, number>;

export interface Personagem {
  nome: string;
  genero: Genero;
  raca: string;
  variante: string | null;
  origem: string;
  atributosComprados: MapaAtributos;
  bonusArake: Atributo[];
  atributosFinais: MapaAtributos;
  /** Id da classe. Saves de antes da escolha de classe têm null e retomam no passo Classe. */
  classe: string | null;
  pvMax?: number;
  pmMax?: number;
  /** Pedras da Forja (fase futura). */
  pedras?: { tolerancia: boolean; egide: boolean; verdade: boolean; preco: boolean };
  criadoEm: string;
}

export interface Config {
  /** 0 a 1 */
  musica: number;
  /** 0 a 1 */
  efeitos: number;
  mudo: boolean;
  /**
   * Tremores de tela (câmera) no sonho. Sem valor salvo, o padrão é ligado — ou desligado se o sistema
   * pede menos movimento (prefers-reduced-motion).
   */
  tremores?: boolean;
  /** Dicas de tutorial (Fase 4D). Sem valor = ainda não perguntado (saves antigos: sem dicas). */
  tutorial?: boolean;
  /** Ids das dicas já mostradas (valem para todas as aventuras). */
  dicasVistas?: string[];
  /** A tela de ajuda de Füllmun já apareceu sozinha uma vez. */
  ajudaFullmunVista?: boolean;
  /**
   * Animações reduzidas (Fase 5): o dado aparece com um fade, sem giro; o mapa fica sem fumaça, fogo,
   * lanternas, varal, copas e água; sem tremores. Sem valor salvo, segue o prefers-reduced-motion.
   */
  animacoesReduzidas?: boolean;
  /** Dado escolhido (src/data/dados.json). Padrão: "azul". */
  dado?: string;
  /** Em tela cheia, trava a tela na horizontal nos mapas e batalhas. */
  travarHorizontal?: boolean;
  /** A dica "Adicionar à Tela de Início" (iPhone) já apareceu no menu inicial. */
  dicaIphoneVista?: boolean;
}

/** Progresso do sonho dos deuses (primeira cena de exploração). */
export interface ProgressoSonho {
  concluido: boolean;
  /** Ids das estátuas cuja voz o herói já ouviu. */
  ouvidas: string[];
}

/** Um passo do caminho do jogador: a cena e, se houve, a escolha feita nela. */
export interface PassoCaminho {
  cena: string;
  escolha?: string;
  resultado?: string;
}

/**
 * Progresso nos capítulos. `cena` é a cena atual (null = início do capítulo, com o cartão de título);
 * `modo` diz se ela retoma nas falas ou direto nas escolhas.
 */
export interface Campanha {
  capitulo: number;
  /**
   * Parte do Capítulo 01 (Fase 5C): "fullmun" (quarto → vila → Mirtilo) ou "templo" (lâmina → treino →
   * biblioteca → tragédia). Ausente nos outros capítulos e em saves antigos (= "fullmun").
   */
  parte?: ParteCapitulo;
  cena: string | null;
  modo: 'falas' | 'escolhas';
  flags: string[];
  caminho: PassoCaminho[];
  /** Escolhas "uma vez só" já usadas ("cena#índice"). */
  usadas: string[];
  /** PV atuais do herói (null = cheio). */
  pvAtual: number | null;
  bonusProximoTeste: number;
  /** Cena com a escolha que levou à última batalha (Game Over → "Tentar novamente"). */
  cenaAntesDaBatalha: string | null;
  // ---- Fase 4 (versaoSave 4) ----
  /** Marcas do relógio do atraso (0 a 4). */
  atraso: number;
  missoes: Record<string, EstadoMissao>;
  /** Quantidade de cada item (cura, itens-chave, peças de missão). */
  inventario: Record<string, number>;
  reais: number;
  /** Pontos de relação por personagem. */
  relacoes: Record<string, number>;
  compendio: ProgressoCompendio;
  /** Caderno de estudos (Fase 4E): o que já foi anunciado e se há novidade. Ausente em saves antigos. */
  caderno?: { anunciados: string[]; novidade: boolean };
  /** Itens de mapa já recolhidos e pontos já usados (ids únicos: "fullmun:lenco", "salao:mancha-3"…). */
  coletados: string[];
  /** Contadores livres (abóboras quebradas, manchas limpas, estantes…). */
  contadores: Record<string, number>;
  /** Onde o jogo retoma: numa cena (tela de capítulo) ou num mapa, na posição salva. */
  local: LocalJogo;
}

export type ParteCapitulo = 'fullmun' | 'templo';

export type EstadoMissao = 'nao_iniciada' | 'aceita' | 'concluida' | 'recusada';

export interface LocalJogo {
  tela: 'capitulo' | 'mapa';
  mapa?: string;
  x?: number;
  y?: number;
  direcao?: string;
  /** Versão das coordenadas do mapa salvo (Füllmun 2: o mapa de chão + objetos, 2400 px de largura). */
  versaoMapa?: number;
}

/** Quantos parágrafos de cada ficha o jogador já viu, e o que ainda não abriu. */
export interface ProgressoCompendio {
  /** Personagens conhecidos (ficha liberada). */
  conhecidos: string[];
  /** Criaturas encontradas; `sabe` = "O que você sabe" liberado. */
  bestiario: Record<string, { sabe: boolean }>;
  /** Parágrafos já anunciados por ficha (para os avisos de novidade). */
  vistos: Record<string, number>;
  /** Há novidade não vista (ponto dourado no menu de pausa). */
  novidade: boolean;
}

/** Relações iniciais (Fase 4). Também usadas na migração de saves antigos. */
export const RELACOES_INICIAIS: Readonly<Record<string, number>> = {
  artho: 2, nyme: 2, aylin: 1, 'vo-hulda': 0, osric: 0, kobanu: 0, gerulf: 0, tobias: 0, selene: 0, dagna: 0,
};

export interface EstadoJogo {
  versao: 1;
  /** Formato do save (4 = Fase 4: atraso, missões, inventário, relações, Compêndio; 5 = slots). */
  versaoSave?: number;
  config: Config;
  personagem: Personagem | null;
  sonho: ProgressoSonho;
  campanha: Campanha;
  /** Segundos de jogo com a aba visível (seguem com o save). */
  tempoDeJogo: number;
}

/** Save único de antes da Fase 4B (migra para o slot automático). */
const CHAVE_ANTIGA = 'a-forja-do-heroi:estado';
const CHAVE_OPCOES = 'fdg.opcoes';
const configPadrao = (): Config => ({ musica: 0.7, efeitos: 0.8, mudo: false });

const padrao = (): EstadoJogo => ({
  versao: 1,
  versaoSave: VERSAO_SAVE,
  config: configPadrao(),
  personagem: null,
  sonho: { concluido: false, ouvidas: [] },
  campanha: campanhaNova(),
  tempoDeJogo: 0,
});

export const campanhaNova = (): Campanha => ({
  capitulo: 1, parte: 'fullmun', cena: null, modo: 'falas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null,
  atraso: 0, missoes: {}, inventario: {}, reais: 0, relacoes: { ...RELACOES_INICIAIS },
  compendio: { conhecidos: [], bestiario: {}, vistos: {}, novidade: false },
  coletados: [], contadores: {}, local: { tela: 'capitulo' },
});

/**
 * Migração de saves anteriores à Fase 4. Um save parado em "Capítulo 02 · Em breve" (capítulo 2,
 * cena "inicio") entra no início do Capítulo 02 com as relações iniciais, atraso 2, sem cesto e com o
 * inventário vazio. Saves no meio do Capítulo 01 antigo recomeçam na soleira (a corrida virou o mapa).
 */
function migrar(c: Campanha, versao: number | undefined): Campanha {
  const base = campanhaNova();
  const m: Campanha = {
    ...base, ...c,
    relacoes: { ...base.relacoes, ...(c.relacoes ?? {}) },
    compendio: { ...base.compendio, ...(c.compendio ?? {}) },
    local: c.local ?? base.local,
  };
  // Fase 5: Füllmun ficou 2400/1672 maior (chão + objetos); a posição salva no mapa antigo acompanha.
  if (m.local?.mapa === 'fullmun' && m.local.x !== undefined && (m.local.versaoMapa ?? 1) < 2) {
    const k = 2400 / 1672;
    m.local = { ...m.local, x: Math.round(m.local.x * k), y: Math.round((m.local.y ?? 0) * k), versaoMapa: 2 };
  }
  if ((versao ?? 1) < 4) {
    if (m.capitulo >= 2) {
      Object.assign(m, { capitulo: 2, cena: null, modo: 'falas', atraso: 2, inventario: {}, reais: 0, relacoes: { ...RELACOES_INICIAIS }, local: { tela: 'capitulo' } });
    } else if (m.cena && ['c01-hulda', 'c01-osric', 'c01-kobanu'].includes(m.cena)) {
      Object.assign(m, { cena: 'c01-soleira', modo: 'escolhas' });
    }
  }
  // Fase 5C (versaoSave 6): um capítulo só, com duas partes. O antigo Capítulo 02 vira a parte "templo"
  // do Capítulo 01, na mesma cena ("inicio" = começo da parte); o antigo "Capítulo 03 · Em breve" vira o 02.
  if ((versao ?? 1) < 6) {
    if (m.capitulo === 2) {
      Object.assign(m, { capitulo: 1, parte: 'templo', cena: m.cena === 'inicio' ? null : m.cena });
      if (!m.flags.includes('chegou_templo')) m.flags = [...m.flags, 'chegou_templo'];
    } else if (m.capitulo >= 3) Object.assign(m, { capitulo: m.capitulo - 1, parte: undefined });
  }
  if (m.capitulo === 1 && !m.parte) m.parte = 'fullmun';
  return m;
}

/** Normaliza o jogo de um save (de qualquer versão) para o formato atual. */
function lerJogo(dados: Partial<EstadoJogo> & { versaoSave?: number }): Pick<EstadoJogo, 'personagem' | 'sonho' | 'campanha' | 'tempoDeJogo'> {
  const base = padrao();
  return {
    personagem: (dados.personagem as Personagem | undefined) ?? null,
    sonho: {
      concluido: dados.sonho?.concluido === true,
      ouvidas: Array.isArray(dados.sonho?.ouvidas) ? dados.sonho!.ouvidas.filter((x) => typeof x === 'string') : [],
    },
    campanha: dados.campanha ? migrar(dados.campanha as Campanha, dados.versaoSave) : base.campanha,
    tempoDeJogo: typeof dados.tempoDeJogo === 'number' && dados.tempoDeJogo >= 0 ? Math.floor(dados.tempoDeJogo) : 0,
  };
}

/** O jogo de um slot, com a versão do save (sem ela, a migração da Fase 4 trataria a campanha como antiga). */
const jogoDoRegistro = (r: RegistroSave) =>
  lerJogo({ ...(r.jogo as unknown as Partial<EstadoJogo>), versaoSave: r.versaoSave });

function lerOpcoes(): Config {
  try {
    const bruto = localStorage.getItem(CHAVE_OPCOES);
    return { ...configPadrao(), ...(bruto ? (JSON.parse(bruto) as Partial<Config>) : {}) };
  } catch {
    return configPadrao();
  }
}

function gravarOpcoes(c: Config): void {
  try { localStorage.setItem(CHAVE_OPCOES, JSON.stringify(c)); } catch (erro) { console.warn('Não foi possível salvar as opções.', erro); }
}

/* ---------- metadados do card (o nome legível do lugar vem de quem conhece mapas e capítulos) ---------- */

type ConstrutorLocal = (e: Pick<EstadoJogo, 'personagem' | 'sonho' | 'campanha'>) => { capitulo: number; local: string };
let construirLocal: ConstrutorLocal = (e) => ({ capitulo: e.sonho.concluido ? e.campanha.capitulo : 0, local: '' });
export function definirConstrutorLocal(fn: ConstrutorLocal): void { construirLocal = fn; }

function metaDe(jogo: Pick<EstadoJogo, 'personagem' | 'sonho' | 'campanha' | 'tempoDeJogo'>, tipo: 'auto' | 'manual'): Omit<MetaSave, 'versaoSave'> {
  const p = jogo.personagem!;
  return {
    nomeHeroi: p.nome, raca: p.raca, variante: p.variante, genero: p.genero, classe: p.classe,
    ...construirLocal(jogo),
    tempoDeJogo: jogo.tempoDeJogo,
    salvoEm: agora().toISOString(),
    tipo,
    dado: estado.config.dado ?? 'azul',
  };
}

const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Migra o save único antigo (`a-forja-do-heroi:estado`) para o slot automático, e as opções dele para
 * `fdg.opcoes`. Os manuais começam vazios. A chave antiga sai depois de migrada.
 */
function migrarSaveAntigo(): void {
  let bruto: string | null = null;
  try { bruto = localStorage.getItem(CHAVE_ANTIGA); } catch { return; }
  if (bruto === null) return;
  try {
    const dados = JSON.parse(bruto) as Partial<EstadoJogo> & { versaoSave?: number };
    try {
      if (dados.config && localStorage.getItem(CHAVE_OPCOES) === null) gravarOpcoes({ ...configPadrao(), ...dados.config });
    } catch { /* sem armazenamento */ }
    const jogo = lerJogo(dados);
    if (jogo.personagem && lerSlot('auto').estado === 'vazio') {
      const reg = montarRegistro(metaDe(jogo, 'auto'), copia(jogo) as unknown as DadosJogo);
      if (dados.personagem?.criadoEm) reg.meta.salvoEm = new Date(Math.max(Date.parse(dados.personagem.criadoEm) || 0, 0)).toISOString();
      if (!gravarSlot('auto', reg)) return;
    }
    localStorage.removeItem(CHAVE_ANTIGA);
  } catch (erro) {
    console.warn('Save antigo ilegível; ficou onde estava.', erro);
  }
}

const estado: EstadoJogo = padrao();
estado.config = lerOpcoes();

/**
 * Abre o jogo: migra o save antigo e carrega as opções e o save mais recente (para o Compêndio do
 * menu e o Continuar). O main.ts chama uma vez, depois de registrar o construtor dos nomes de lugar.
 */
export function iniciarEstado(): void {
  migrarSaveAntigo();
  estado.config = lerOpcoes();
  const recente = maisRecente();
  if (recente) Object.assign(estado, jogoDoRegistro(recente.registro));
}

export const getEstado = (): Readonly<EstadoJogo> => estado;

/** Autosave: grava o jogo atual no slot automático (sempre por cima). Sem herói, não há o que salvar. */
function salvar(): void {
  if (!estado.personagem) return;
  gravarSlot('auto', montarRegistro(metaDe(estado, 'auto'), copia(retratoAtual(false)) as unknown as DadosJogo));
}

/* ---------- início da cena: um save manual no meio de uma cena volta para o começo dela ---------- */

/** Campanha de quando a cena atual começou (antes dos efeitos de entrada). null = fora de cena. */
let inicioCena: Campanha | null = null;

/** O palco chama ao entrar numa cena, antes de aplicar os efeitos de entrada. */
export function marcarInicioCena(cena: string, modo: 'falas' | 'escolhas'): void {
  inicioCena = copia({ ...estado.campanha, cena, modo });
}
export function limparInicioCena(): void { inicioCena = null; }
export const emCena = (): boolean => inicioCena !== null;

function retratoAtual(doInicioDaCena: boolean): Pick<EstadoJogo, 'personagem' | 'sonho' | 'campanha' | 'tempoDeJogo'> {
  const campanha = doInicioDaCena && inicioCena ? inicioCena : estado.campanha;
  return { personagem: estado.personagem, sonho: estado.sonho, campanha, tempoDeJogo: estado.tempoDeJogo };
}

/** Save manual: no meio de uma cena, grava o começo dela; no mapa, a posição exata. */
export function salvarManual(slot: Exclude<IdSlot, 'auto'>): boolean {
  if (!estado.personagem) return false;
  const jogo = copia(retratoAtual(true));
  const ok = gravarSlot(slot, montarRegistro(metaDe(jogo, 'manual'), jogo as unknown as DadosJogo));
  if (ok) pedirPersistencia();
  return ok;
}

/** Troca o jogo em memória pelo de um save (o automático só muda no próximo autosave). */
export function carregarSlot(slot: IdSlot): boolean {
  const info = lerSlot(slot);
  if (info.estado !== 'ok') return false;
  Object.assign(estado, jogoDoRegistro(info.registro));
  inicioCena = null;
  return true;
}

/* ---------- tempo de jogo: só com a aba visível e fora do menu e da criação ---------- */

let contando = false;
export function contarTempo(sim: boolean): void { contando = sim; }
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (contando && estado.personagem && document.visibilityState === 'visible') estado.tempoDeJogo++;
  }, 1000);
  // Ao esconder a aba (ou fechar), guarda o tempo de jogo no automático.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !contando || !estado.personagem) return;
    // Só guarda o tempo se o automático ainda é desta aventura (outra aba pode ter gravado outra).
    const auto = lerSlot('auto');
    if (auto.estado === 'ok' && JSON.stringify(auto.registro.jogo.personagem) !== JSON.stringify(estado.personagem)) return;
    salvar();
  });
}

const sistemaPedeMenosMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animações reduzidas? (Opções; sem valor salvo, o que o sistema pede.) */
export function animacoesReduzidas(): boolean {
  const salvo = estado.config.animacoesReduzidas;
  return typeof salvo === 'boolean' ? salvo : sistemaPedeMenosMovimento();
}

/** A câmera pode tremer? (Opções → "Tremores de tela"; desligados com animações reduzidas. O som toca de qualquer jeito.) */
export function tremoresLigados(): boolean {
  if (animacoesReduzidas()) return false;
  const salvo = estado.config.tremores;
  if (typeof salvo === 'boolean') return salvo;
  return !sistemaPedeMenosMovimento();
}

export function atualizarConfig(parcial: Partial<Config>): void {
  Object.assign(estado.config, parcial);
  gravarOpcoes(estado.config);
}

/** Salva um herói novo (e zera o progresso do sonho, que é dele). */
export function salvarPersonagem(p: Personagem): void {
  estado.personagem = p;
  estado.sonho = { concluido: false, ouvidas: [] };
  estado.campanha = campanhaNova();
  estado.tempoDeJogo = 0;
  inicioCena = null;
  // Primeiro autosave da aventura nova: só aqui o slot automático passa a ser dela.
  salvar();
}

/** Atualiza o progresso do capítulo e salva. */
export function atualizarCampanha(parcial: Partial<Campanha>): void {
  Object.assign(estado.campanha, parcial);
  salvar();
}

export function temFlag(flag: string): boolean {
  return estado.campanha.flags.includes(flag);
}

export function marcarFlag(flag: string): void {
  if (!temFlag(flag)) {
    estado.campanha.flags.push(flag);
    salvar();
  }
}

/** Registra uma voz ouvida no sonho (sem repetir). */
export function ouvirVoz(id: string): void {
  if (!estado.sonho.ouvidas.includes(id)) {
    estado.sonho.ouvidas.push(id);
    salvar();
  }
}

export function concluirSonho(): void {
  estado.sonho.concluido = true;
  salvar();
}

/** Há herói em memória (do save mais recente ou da aventura em andamento). */
export const temSave = (): boolean => estado.personagem !== null;
