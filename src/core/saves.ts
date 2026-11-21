/**
 * Saves do jogo: 1 slot automático e 2 manuais, compartilhados entre todas as aventuras.
 *
 * - Chaves: `fdg.save.auto`, `fdg.save.manual1`, `fdg.save.manual2` (as opções ficam em `fdg.opcoes`).
 * - Cada save é um retrato completo do jogo (herói, sonho, campanha, tempo de jogo) mais os metadados
 *   do card, que dá para montar sem mexer no estado do jogo.
 * - Gravação segura: grava numa chave temporária, confere o JSON e só então troca. Se algo falhar
 *   (cota cheia, por exemplo), o save anterior fica intacto.
 *
 * Este módulo não conhece o jogo: o estado entra pronto (src/core/estado.ts monta o retrato).
 */

export type IdSlot = 'auto' | 'manual1' | 'manual2';
export const SLOTS: readonly IdSlot[] = ['auto', 'manual1', 'manual2'];
/** 5 = Fase 4B (slots). A campanha dentro do save segue a migração da Fase 4. */
export const VERSAO_SAVE = 5;
const FORMATO_SAVE = 'forja-do-heroi-save';
const FORMATO_COPIA = 'forja-do-heroi-saves';
const CHAVE_TMP = 'fdg.save.tmp';
export const chaveSlot = (s: IdSlot): string => `fdg.save.${s}`;

export interface MetaSave {
  nomeHeroi: string;
  raca: string;
  variante: string | null;
  genero: 'm' | 'f';
  classe: string | null;
  /** 0 = antes do Capítulo 01 (prólogo e sonho). */
  capitulo: number;
  /** Nome legível do lugar: "Füllmun — Praça do mercado", "Templo de Sólem — Biblioteca". */
  local: string;
  /** Segundos de jogo (só com a aba visível). */
  tempoDeJogo: number;
  salvoEm: string;
  tipo: 'auto' | 'manual';
  versaoSave: number;
  /** Dado escolhido quando o jogo foi salvo (aparece no card). */
  dado?: string;
}

/** O retrato do jogo guardado no save (o formato interno é do estado do jogo). */
export interface DadosJogo {
  personagem: Record<string, unknown>;
  sonho: Record<string, unknown>;
  campanha: Record<string, unknown>;
  tempoDeJogo: number;
}

export interface RegistroSave {
  formato: typeof FORMATO_SAVE;
  versaoSave: number;
  meta: MetaSave;
  jogo: DadosJogo;
}

export type InfoSlot =
  | { slot: IdSlot; estado: 'vazio' }
  | { slot: IdSlot; estado: 'ok'; meta: MetaSave; registro: RegistroSave }
  | { slot: IdSlot; estado: 'danificado' };

/* ------------------------------ relógio ------------------------------ */

let relogioSimulado: number | null = null;
/** Data "de agora" (os testes podem simular outra, para conferir o "há 3 dias"). */
export const agora = (): Date => (relogioSimulado === null ? new Date() : new Date(relogioSimulado));
export function definirRelogio(iso: string | null): void {
  relogioSimulado = iso === null ? null : new Date(iso).getTime();
}

/* ------------------------------ formato ------------------------------ */

const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Confere o formato e a versão de um save (de um slot ou de um arquivo de cópia). */
export function validarRegistro(x: unknown): x is RegistroSave {
  if (!ehObjeto(x) || x.formato !== FORMATO_SAVE) return false;
  if (typeof x.versaoSave !== 'number' || x.versaoSave < 1 || x.versaoSave > VERSAO_SAVE) return false;
  const m = x.meta, j = x.jogo;
  if (!ehObjeto(m) || typeof m.salvoEm !== 'string' || Number.isNaN(Date.parse(m.salvoEm)) || typeof m.nomeHeroi !== 'string') return false;
  if (!ehObjeto(j) || !ehObjeto(j.personagem) || typeof j.personagem.nome !== 'string' || !ehObjeto(j.campanha) || !ehObjeto(j.sonho)) return false;
  return true;
}

export function montarRegistro(meta: Omit<MetaSave, 'versaoSave'>, jogo: DadosJogo): RegistroSave {
  return { formato: FORMATO_SAVE, versaoSave: VERSAO_SAVE, meta: { ...meta, versaoSave: VERSAO_SAVE }, jogo };
}

/* ------------------------------ slots ------------------------------ */

export function lerSlot(slot: IdSlot): InfoSlot {
  let bruto: string | null = null;
  try {
    bruto = localStorage.getItem(chaveSlot(slot));
  } catch {
    return { slot, estado: 'vazio' };
  }
  if (bruto === null) return { slot, estado: 'vazio' };
  try {
    const r: unknown = JSON.parse(bruto);
    return validarRegistro(r) ? { slot, estado: 'ok', meta: r.meta, registro: r } : { slot, estado: 'danificado' };
  } catch {
    return { slot, estado: 'danificado' };
  }
}

export const listarSlots = (): InfoSlot[] => SLOTS.map(lerSlot);

/** O save válido mais recente (pelo `salvoEm`), entre os três. */
export function maisRecente(): Extract<InfoSlot, { estado: 'ok' }> | null {
  let melhor: Extract<InfoSlot, { estado: 'ok' }> | null = null;
  for (const s of listarSlots()) {
    if (s.estado !== 'ok') continue;
    if (!melhor || Date.parse(s.meta.salvoEm) > Date.parse(melhor.meta.salvoEm)) melhor = s;
  }
  return melhor;
}

export const temAlgumSave = (): boolean => listarSlots().some((s) => s.estado !== 'vazio');

/** Gravação segura: temporária → confere → troca. Devolve false (e não mexe no slot) se falhar. */
export function gravarSlot(slot: IdSlot, registro: RegistroSave): boolean {
  try {
    const json = JSON.stringify(registro);
    localStorage.setItem(CHAVE_TMP, json);
    const volta = localStorage.getItem(CHAVE_TMP);
    if (volta !== json || !validarRegistro(JSON.parse(volta))) throw new Error('save conferido diferente do gravado');
    localStorage.setItem(chaveSlot(slot), json);
    localStorage.removeItem(CHAVE_TMP);
    return true;
  } catch (erro) {
    try { localStorage.removeItem(CHAVE_TMP); } catch { /* sem armazenamento */ }
    console.warn(`Não foi possível gravar o save ${slot}.`, erro);
    return false;
  }
}

export function apagarSlot(slot: IdSlot): void {
  try { localStorage.removeItem(chaveSlot(slot)); } catch { /* sem armazenamento */ }
}

/** Pede ao navegador para não limpar os saves por falta de espaço (uma vez por sessão). */
let persistenciaPedida = false;
export function pedirPersistencia(): void {
  if (persistenciaPedida) return;
  persistenciaPedida = true;
  const st = navigator.storage;
  if (!st?.persist) return;
  void st.persisted().then((ja) => (ja ? true : st.persist())).catch(() => {});
}

/* ------------------------------ cópia de segurança ------------------------------ */

export interface CopiaSaves {
  formato: typeof FORMATO_COPIA;
  versao: 1;
  exportadoEm: string;
  slots: Record<IdSlot, RegistroSave | null>;
}

export function montarCopia(): CopiaSaves {
  const slots = {} as Record<IdSlot, RegistroSave | null>;
  for (const s of listarSlots()) slots[s.slot] = s.estado === 'ok' ? s.registro : null;
  return { formato: FORMATO_COPIA, versao: 1, exportadoEm: agora().toISOString(), slots };
}

export const nomeArquivoCopia = (d = agora()): string =>
  `forja-do-heroi-saves-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;

/** Lê um arquivo de cópia. Devolve null se o formato, a versão ou algum save não for válido. */
export function lerCopia(texto: string): CopiaSaves | null {
  try {
    const c: unknown = JSON.parse(texto);
    if (!ehObjeto(c) || c.formato !== FORMATO_COPIA || c.versao !== 1 || !ehObjeto(c.slots)) return null;
    const slots = {} as Record<IdSlot, RegistroSave | null>;
    let algum = false;
    for (const s of SLOTS) {
      const r = c.slots[s] ?? null;
      if (r === null) { slots[s] = null; continue; }
      if (!validarRegistro(r)) return null;
      slots[s] = r;
      algum = true;
    }
    return algum ? { formato: FORMATO_COPIA, versao: 1, exportadoEm: String(c.exportadoEm ?? ''), slots } : null;
  } catch {
    return null;
  }
}

/** Troca os 3 slots pelos da cópia (slot vazio na cópia = slot apagado). */
export function aplicarCopia(c: CopiaSaves): boolean {
  let ok = true;
  for (const s of SLOTS) {
    const r = c.slots[s];
    if (r) ok = gravarSlot(s, r) && ok;
    else apagarSlot(s);
  }
  return ok;
}

/* ------------------------------ textos do card ------------------------------ */

/** "1h 12min", "12min". */
export function formatarTempo(seg: number): string {
  const min = Math.floor(Math.max(0, seg) / 60);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h ${String(min % 60).padStart(2, '0')}min` : `${min}min`;
}

/** "18/11/2026 · 15:20" */
export function formatarData(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "hoje", "ontem", "há 3 dias", "há 2 semanas", "há 3 meses" (pelo calendário, não por 24 h). */
export function tempoRelativo(iso: string, ref = agora()): string {
  const dia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const dias = Math.round((dia(ref) - dia(new Date(iso))) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 14) return `há ${dias} dias`;
  if (dias < 60) return `há ${Math.floor(dias / 7)} semanas`;
  if (dias < 730) return `há ${Math.floor(dias / 30)} meses`;
  return `há ${Math.floor(dias / 365)} anos`;
}
