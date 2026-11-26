/** Caminhos das mídias (relativos a public/assets) e resolução para URL final. */

export type Genero = 'm' | 'f';

const BASE = import.meta.env.BASE_URL;

/** URL pública de um asset (respeita o `base` do Vite, ex.: /aforjadoheroi/). */
export const urlAsset = (caminho: string): string => `${BASE}assets/${caminho}`;

/** Efeitos reais (gravações tratadas por scripts/prepare-audio.mjs), em MP3. */
const SFX_MP3 = new Set([
  'gritos-fullmun', 'flecha-nyme',
  // Fase 6 (Ato I): scripts/prepare-audio-ato1.mjs.
  'fogo-distante', 'madeira-estalando', 'cadeado-abrindo', 'cadeado-cai', 'alcapao-fecha', 'cadeado-tranca',
  'passos-afastando', 'gotejar', 'tocha', 'armadilha-estalo', 'tochas-acendendo', 'porta-antiga',
]);

export const ASSETS = {
  videoIntro: 'video/intro-icarus.mp4',
  videoPrologo: 'video/prologo.mp4',
  musicaMenu: 'music/the-first-choice.mp3',
  logoIcarus: 'img/logos/icarus.png',
  logoForja: 'img/logos/a-forja-do-heroi.png',
  wallpaperMenu: 'img/wallpapers/menu.webp',
  /** Música opcional do sonho: a primeira extensão que existir. */
  musicaSonho: ['music/sonho.mp3', 'music/sonho.ogg', 'music/sonho.m4a', 'music/sonho.wav'],
  spriteChibi: (raca: string, genero: Genero) => `sprites/chibi-${raca}-${genero}.png`,
  retrato: (raca: string, genero: Genero, classe = 'comum') => `img/herois/${raca}-${genero}-${classe}.webp`,
  /** Efeitos: WAV gerados por código; os reais (gravações, Fase 5C) em MP3. */
  sfx: (nome: string) => `sfx/${nome}.${SFX_MP3.has(nome) ? 'mp3' : 'wav'}`,
  musica: (id: string) => `music/${id}.mp3`,
  cena: (id: string) => `img/cenas/${id}.webp`,
  retratoNpc: (id: string, expressao?: string) => `img/retratos/npc-${id}${expressao ? `-${expressao}` : ''}.webp`,
  /** Busto do herói (olha para a esquerda; o Azakar usa o mesmo nas variantes Luz e Sombra). */
  bustoHeroi: (raca: string, genero: Genero, expressao?: string) =>
    `img/retratos/heroi-${raca}-${genero}${expressao && expressao !== 'normal' ? `-${expressao}` : ''}.webp`,
  ameaca: (id: string) => `img/ameacas/${id}.webp`,
  /** Fundos de batalha em WebP (originais em assets-fonte/batalha-fundos; scripts/comprimir-imagens.mjs). */
  fundoBatalha: (id: string) => `img/batalha/fundos/${id}.webp`,
  spriteBatalhaHeroi: (raca: string, genero: Genero) => `img/batalha/herois/${raca}-${genero}`,
  spriteBatalhaInimigo: (id: string) => `img/batalha/inimigos/${id}`,
  gameOver: 'img/telas/game-over.webp',
  item: (id: string) => `img/itens/${id}.png`,
  chibi: (id: string) => `sprites/chibi-${id}.png`,
} as const;

export const SFX = [
  'ui-hover', 'ui-click', 'ui-confirm', 'ui-back', 'ui-locked',
  'point-up', 'point-down', 'start', 'hero-confirm', 'transition', 'salvar',
] as const;
/** Efeitos do sonho: carregados só ao entrar na exploração. */
export const SFX_SONHO = [
  'step-marble', 'statue-glow', 'statue-awaken', 'divine-chord', 'thunder', 'text-blip', 'tremor',
] as const;
/** Efeitos do Capítulo 01 (cenas e batalha): carregados ao entrar no capítulo. */
export const SFX_CAPITULO = [
  'text-blip', 'dice-roll', 'dado-toc', 'grito-crianca', 'kick', 'miss', 'crit', 'pig-squeal', 'pig-charge', 'fall', 'tremor',
] as const;
/** Efeitos da Fase 4 (Füllmun, templo, tragédia). */
export const SFX_FASE4 = [
  'rato-guincho', 'abobora-splat', 'pegar-item', 'esfregar', 'espirro', 'espada-treino', 'rasteira',
  'coracao-mais', 'coracao-menos', 'compendio', 'gritos-longe', 'batida-coracao', 'flecha',
  // Fase 5C: a tragédia com os efeitos reais (gritos-longe e flecha ficam de reserva).
  'gritos-fullmun', 'flecha-nyme', 'espada-clang',
] as const;
/** Efeitos do Ato I (Fase 6): a Parte 1 (alçapão) e as fases laterais (túnel, símbolos, tochas). */
export const SFX_ATO1_PARTE1 = [
  'fogo-distante', 'madeira-estalando', 'cadeado-abrindo', 'cadeado-cai', 'alcapao-fecha', 'cadeado-tranca', 'passos-afastando', 'tremor',
] as const;
export const SFX_ATO1 = [
  'gotejar', 'tocha', 'armadilha-estalo', 'tochas-acendendo', 'porta-antiga', 'flecha-nyme', 'vento-sopro', 'fall', 'kick',
  'dice-roll', 'dado-toc', 'step-marble', 'divine-chord', 'statue-glow', 'statue-awaken', 'coracao-menos', 'coracao-mais',
] as const;
export type NomeSfx = (typeof SFX)[number] | (typeof SFX_SONHO)[number] | (typeof SFX_CAPITULO)[number] | (typeof SFX_FASE4)[number]
  | (typeof SFX_ATO1_PARTE1)[number] | (typeof SFX_ATO1)[number];

/** O arquivo existe e é do tipo esperado? (No dev server do Vite, um arquivo ausente pode voltar como HTML.) */
const existencias = new Map<string, Promise<boolean>>();
/** existeAsset com cache (para trocas de expressão, que se repetem). */
export function existeAssetCache(caminho: string, tipo: 'image' | 'audio' | 'video'): Promise<boolean> {
  let r = existencias.get(caminho);
  if (!r) existencias.set(caminho, (r = existeAsset(caminho, tipo)));
  return r;
}

export async function existeAsset(caminho: string, tipo: 'image' | 'audio' | 'video'): Promise<boolean> {
  try {
    const r = await fetch(urlAsset(caminho), { method: 'HEAD', cache: 'no-store' });
    return r.ok && (r.headers.get('content-type') ?? '').startsWith(`${tipo}/`);
  } catch {
    return false;
  }
}

export const RACAS_JOGAVEIS = ['arake', 'azakar', 'nyashi', 'ayoran'] as const;
export const CLASSES_RETRATO = ['comum', 'guerreiro', 'paladino', 'ladino', 'arcanista', 'monge'] as const;

/** URLs de objeto (blob:) dos arquivos já pré-carregados: usar estas evita baixar de novo. */
const blobs = new Map<string, string>();

export function registrarBlob(caminho: string, urlObjeto: string): void {
  blobs.set(caminho, urlObjeto);
}

/** Melhor URL para um asset: a cópia em memória, se houver, ou a URL pública. */
export const src = (caminho: string): string => blobs.get(caminho) ?? urlAsset(caminho);

export const jaCarregado = (caminho: string): boolean => blobs.has(caminho);
