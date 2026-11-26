import { expect, type Page, type TestInfo } from '@playwright/test';
import { irAteMenu } from './ajudantes';

/* Ajudantes dos testes da Fase 6 (Prólogo + atos e o Ato I). */

export type Estado = Record<string, any>;
export const HEROI = {
  nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones',
  atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
  atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
  classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
};
export const CONFIG = { musica: 0.7, efeitos: 0.8, mudo: false, tutorial: false, ajudaFullmunVista: true };

/** Save no formato atual (versaoSave 7), direto no slot automático. */
export function semear(page: Page, campanha: Record<string, unknown>, o: { config?: Record<string, unknown>; heroi?: Record<string, unknown> } = {}) {
  return page.addInitScript(([h, c, cf]) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('fdg.opcoes', JSON.stringify(cf));
    const campanha = { ato: 1, parte: 1, cena: 'inicio', modo: 'falas', flags: ['fim_capitulo_02', 'nyme_caiu'], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null, local: { tela: 'capitulo' }, ...c };
    localStorage.setItem('fdg.save.auto', JSON.stringify({
      formato: 'forja-do-heroi-save', versaoSave: 7,
      meta: { nomeHeroi: h.nome, raca: h.raca, variante: null, genero: h.genero, classe: h.classe, ato: campanha.ato, parte: campanha.parte, local: '', tempoDeJogo: 60, salvoEm: new Date().toISOString(), tipo: 'auto', versaoSave: 7 },
      jogo: { personagem: h, sonho: { concluido: true, ouvidas: ['solem', 'justar', 'irae'] }, campanha, tempoDeJogo: 60 },
    }));
  }, [{ ...HEROI, ...(o.heroi ?? {}) }, campanha, { ...CONFIG, ...(o.config ?? {}) }] as const);
}

export const st = (page: Page): Promise<Estado> => page.evaluate(() => (window as unknown as { __fdg?: { state(): Estado } }).__fdg?.state() ?? {});
export const f = (page: Page, m: string, ...args: unknown[]) =>
  page.evaluate(([mm, aa]) => (window as unknown as { __fdg?: Record<string, (...x: unknown[]) => unknown> }).__fdg?.[mm as string]?.(...(aa as unknown[])), [m, args] as const);
export const foto = (page: Page, info: TestInfo, nome: string) => page.screenshot({ path: `tests/screenshots/${info.project.name}-fase6-${nome}.png` });
export const umAparelho = (info: TestInfo) => info.project.name === 'pixel-7';
export const textoFala = (page: Page) => page.locator('.palco-cena .cena-texto').last().innerText();
export const salvoAuto = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null'));

export async function continuar(page: Page) {
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Continuar' }).click();
}
export async function naCena(page: Page, id: string, timeout = 90_000) {
  await expect.poll(async () => (await st(page)).cena, { timeout }).toBe(id);
}
/** Espera a fala terminar de aparecer (sem tocar: um toque no instante em que ela termina pularia uma fala). */
export async function falaCompleta(page: Page) {
  await expect.poll(async () => (await st(page)).digitando, { timeout: 20_000, intervals: [150] }).toBe(false);
}
/** Avança as falas até aparecer o texto pedido (ou as escolhas). */
export async function ateFala(page: Page, trecho: string) {
  for (let i = 0; i < 40; i++) {
    await falaCompleta(page);
    if ((await textoFala(page)).includes(trecho)) return;
    await proximo(page);
  }
  throw new Error(`fala não apareceu: ${trecho}`);
}
/** Um passo: o botão "Continuar" do fim da cena, se estiver na tela; senão, avança a fala. */
export async function proximo(page: Page) {
  const seguir = page.locator('.cena-seguir:visible');
  if (await seguir.count()) await seguir.first().click().catch(() => undefined);
  else await f(page, 'avancar');
  await page.waitForTimeout(250);
}
export async function ateEscolhas(page: Page) {
  for (let i = 0; i < 30; i++) {
    if ((await st(page)).escolhas?.length) return;
    await falaCompleta(page);
    await proximo(page);
  }
  throw new Error('as escolhas não apareceram');
}
export const efeitosNomes = async (page: Page) => ((await st(page)).efeitos as { nome: string }[]).map((e) => e.nome);


/* ---------- fase lateral ---------- */
export const lat = async (page: Page) => (await st(page)).lateral as {
  x: number; y: number; z: number; noAr: boolean; escala: number; camX: number; camY: number;
  frente: { id: string; x: number }[]; luz: { x: number; y: number; raio: number; ambiente: number; acesa: boolean }; tochasAcesas: number; velocidade: number;
};
/** Abre a parte da fase lateral, espera o cartão e a primeira fala (se houver). */
export async function naLateral(page: Page, parte: number, extra: Record<string, unknown> = {}, o: { config?: Record<string, unknown> } = {}) {
  await semear(page, { parte, cena: 'inicio', local: { tela: 'lateral' }, ...extra }, o);
  await continuar(page);
  await expect.poll(async () => (await st(page)).tela, { timeout: 90_000 }).toBe('lateral');
  await expect.poll(async () => !!(await st(page)).lateral, { timeout: 60_000 }).toBe(true);
}
/** Espera uma fala por cima da fase (cena aberta). */
export async function cenaLateral(page: Page, id: string, timeout = 20_000) {
  await expect.poll(async () => (await st(page)).cena, { timeout }).toBe(id);
}
/** Fecha a fala aberta (avança até o fim e clica no Continuar). */
export async function fecharFala(page: Page) {
  const inicial = (await st(page)).cena;
  for (let i = 0; i < 40; i++) {
    const s = await st(page);
    // Fecha só a fala aberta agora (a seguinte, se vier logo depois, fica para o teste).
    if (!s.cena || s.cena !== inicial) return;
    const seguir = page.locator('.cena-seguir:visible');
    if (await seguir.count()) await seguir.first().click().catch(() => undefined);
    else if (!s.digitando) await f(page, 'avancar');
    else await f(page, 'avancar');
    await page.waitForTimeout(220);
  }
  throw new Error('a fala não fechou');
}
/** Leva o herói a (x, y) e espera o jogo processar a posição. */
export async function irA(page: Page, x: number, y?: number) {
  await f(page, 'teleportar', x, y);
  await page.waitForTimeout(250);
}
/** Espera o controle voltar (sem fala, rolagem ou ação em andamento). */
export async function livre(page: Page, timeout = 20_000) {
  await expect.poll(async () => { const s = await st(page); return !!s.pronto && !s.cena && !s.ocupado && !(await page.locator('.rolagem-fundo').count()); }, { timeout }).toBe(true);
}
