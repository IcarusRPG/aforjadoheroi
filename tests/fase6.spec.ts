import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { irAteMenu } from './ajudantes';

/* Fase 6: Prólogo + atos e o Ato I inteiro (Partes 1 a 6). */

type Estado = Record<string, any>;
const HEROI = {
  nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones',
  atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
  atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
  classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
};
const CONFIG = { musica: 0.7, efeitos: 0.8, mudo: false, tutorial: false, ajudaFullmunVista: true };

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
const textoFala = (page: Page) => page.locator('.palco-cena .cena-texto').last().innerText();
const salvoAuto = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null'));

export async function continuar(page: Page) {
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Continuar' }).click();
}
async function naCena(page: Page, id: string, timeout = 90_000) {
  await expect.poll(async () => (await st(page)).cena, { timeout }).toBe(id);
}
/** Espera a fala terminar de aparecer (sem tocar: um toque no instante em que ela termina pularia uma fala). */
async function falaCompleta(page: Page) {
  await expect.poll(async () => (await st(page)).digitando, { timeout: 20_000, intervals: [150] }).toBe(false);
}
/** Avança as falas até aparecer o texto pedido (ou as escolhas). */
async function ateFala(page: Page, trecho: string) {
  for (let i = 0; i < 40; i++) {
    await falaCompleta(page);
    if ((await textoFala(page)).includes(trecho)) return;
    await proximo(page);
  }
  throw new Error(`fala não apareceu: ${trecho}`);
}
/** Um passo: o botão "Continuar" do fim da cena, se estiver na tela; senão, avança a fala. */
async function proximo(page: Page) {
  const seguir = page.locator('.cena-seguir:visible');
  if (await seguir.count()) await seguir.first().click().catch(() => undefined);
  else await f(page, 'avancar');
  await page.waitForTimeout(250);
}
async function ateEscolhas(page: Page) {
  for (let i = 0; i < 30; i++) {
    if ((await st(page)).escolhas?.length) return;
    await falaCompleta(page);
    await proximo(page);
  }
  throw new Error('as escolhas não apareceram');
}
const efeitosNomes = async (page: Page) => ((await st(page)).efeitos as { nome: string }[]).map((e) => e.nome);

/* ======================================================================
   1. Transição: Fim do Prólogo → cartões → Parte 1
   ====================================================================== */

test('transição: "Fim do Prólogo" → Continuar → cartão "Ato I — Provação Sob a Luz" → "Parte 1 · O alçapão se abre" → C1-01', async ({ page }, info) => {
  test.setTimeout(150_000);
  test.setTimeout(240_000);
  await semear(page, { ato: 0, parte: 'templo', cena: 'c02-tragedia', flags: ['chegou_templo', 'nyme_seguindo'] });
  await continuar(page);
  await naCena(page, 'c02-tragedia');
  // Até o fim da tragédia.
  const fim = page.locator('.tela-fim-capitulo');
  await expect.poll(async () => {
    if (await fim.isVisible()) return true;
    const seguir = page.locator('.cena-seguir');
    if (await seguir.isVisible()) await seguir.click().catch(() => {});
    else await f(page, 'avancar');
    return false;
  }, { timeout: 150_000, intervals: [400] }).toBe(true);
  await expect(fim.locator('.fim-rotulo')).toHaveText('Fim do Prólogo');
  await expect(fim.locator('.fim-titulo')).toHaveText('Amanhecer Tardio');
  await fim.getByRole('button', { name: 'Continuar' }).click();
  const ato = page.locator('.cartao-tela.cartao-ato');
  await expect(ato).toBeVisible({ timeout: 30_000 });
  await expect(ato.locator('.cartao-tela-rotulo')).toHaveText('Ato I');
  await expect(ato.locator('.cartao-tela-titulo')).toHaveText('Provação Sob a Luz');
  if (umAparelho(info) || info.project.name.startsWith('paisagem')) { await page.waitForTimeout(700); await foto(page, info, 'cartao-ato'); }
  const parte = page.locator('.cartao-tela.cartao-parte');
  await expect(parte).toBeVisible({ timeout: 10_000 });
  await expect(parte).toHaveText('Parte 1 · O alçapão se abre');
  if (umAparelho(info) || info.project.name.startsWith('paisagem')) { await page.waitForTimeout(700); await foto(page, info, 'cartao-parte'); }
  await naCena(page, 'c1-01', 15_000);
  const s = await salvoAuto(page);
  expect(s.jogo.campanha).toMatchObject({ ato: 1, parte: 1 });
});

/* ======================================================================
   2. Parte 1 · O alçapão se abre
   ====================================================================== */

for (const escolha of [
  { idx: 0, flag: 'implorou_artho', resposta: 'Meu lugar é aqui. Alguém precisa ganhar tempo.' },
  { idx: 1, flag: 'quis_lutar', resposta: 'A Nyme escolheu proteger você. Não torne a escolha dela em vão.' },
  { idx: 2, flag: 'obedeceu_artho', resposta: 'Bom menino.' },
]) {
  test(`Parte 1: a escolha ${escolha.idx + 1} grava ${escolha.flag} e Artho responde certo`, async ({ page }, info) => {
    test.setTimeout(150_000);
    await semear(page, { cena: 'c1-02', modo: 'falas' });
    await continuar(page);
    await naCena(page, 'c1-02');
    await ateEscolhas(page);
    expect((await st(page)).escolhas).toEqual(['“Venha comigo, Artho!”', '“Eu vou lutar! A Nyme…”', 'Apertar a tocha e assentir, em silêncio']);
    if (escolha.idx === 0 && umAparelho(info)) await foto(page, info, 'parte1-escolha');
    await page.locator('.cena-escolha').nth(escolha.idx).click();
    await ateFala(page, escolha.resposta);
    expect((await st(page)).flags).toContain(escolha.flag);
    await ateFala(page, 'Você está, Thaelion. Mais do que imagina.');
  });
}

test('Parte 1: os sons nas frases certas, sem ordem estrangeira, fogo com fade-out; termina com o save ato 1 / parte 2, anota no Caderno e muda a pergunta', async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, {}, { config: { tremores: true, animacoesReduzidas: false } });
  await continuar(page);
  await naCena(page, 'c1-01', 60_000);
  await falaCompleta(page);
  expect(await textoFala(page)).toContain('Uma mão agarra o seu braço');
  // O fogo distante em loop, baixo.
  await expect.poll(async () => ((await st(page)).loops as { nome: string }[]).map((l) => l.nome)).toContain('fogo-distante');
  if (umAparelho(info)) await foto(page, info, 'parte1-c1-01');
  await ateFala(page, 'Não! Para dentro! Agora!');
  await ateFala(page, 'alguém grita uma ordem');
  // Nenhum som de ordem gritada.
  expect((await efeitosNomes(page)).some((n) => /ordem/.test(n))).toBe(false);
  await ateFala(page, 'A chave gira no cadeado.');
  expect(await efeitosNomes(page)).toContain('cadeado-abrindo');
  expect(await efeitosNomes(page)).not.toContain('cadeado-cai');
  if (umAparelho(info)) await foto(page, info, 'parte1-c1-02');
  await ateFala(page, 'O cadeado cai no chão.');
  const nomes = await efeitosNomes(page);
  expect(nomes.indexOf('cadeado-abrindo')).toBeLessThan(nomes.indexOf('cadeado-cai'));
  // O fogo continua, mais baixo.
  expect(((await st(page)).loops as { nome: string; ganho: number }[]).find((l) => l.nome === 'fogo-distante')!.ganho).toBeLessThan(0.3);
  await ateEscolhas(page);
  await page.locator('.cena-escolha').nth(2).click();
  await naCena(page, 'c1-03', 30_000).catch(() => undefined);
  await ateFala(page, 'O alçapão se fecha sobre a sua cabeça.');
  expect(await efeitosNomes(page)).toContain('alcapao-fecha');
  // O tremor (ligado nas Opções).
  await expect.poll(() => page.evaluate(() => !!document.querySelector('.tela.tremendo-leve, .tela.tremendo'))).toBe(true);
  if (umAparelho(info)) await foto(page, info, 'parte1-c1-03');
  await ateFala(page, 'Você ouve o cadeado.');
  expect(await efeitosNomes(page)).toContain('cadeado-tranca');
  await ateFala(page, 'os passos dele se afastando');
  expect(await efeitosNomes(page)).toContain('passos-afastando');
  await ateFala(page, 'Depois, nada.');
  // O fogo some em 3 s.
  await expect.poll(async () => ((await st(page)).loops as { nome: string }[]).map((l) => l.nome), { timeout: 6000 }).not.toContain('fogo-distante');
  await f(page, 'avancar');
  await ateFala(page, 'Só a tocha. Só você. E o escuro à frente.');
  const s = await st(page);
  expect(s.flags).toContain('desceu_alcapao');
  expect(s.caderno.anotacoes).toContain('alcapao-aberto');
  expect(s.caderno.respondidas ?? s.caderno.perguntasRespondidas ?? []).toEqual(expect.arrayContaining(['alcapao']));
  expect(s.caderno.perguntas).toContain('tunel');
  await f(page, 'avancar');
  await page.locator('.cena-seguir, .cena-escolha').first().click().catch(() => undefined);
  await expect.poll(async () => (await salvoAuto(page))?.jogo?.campanha?.parte, { timeout: 20_000 }).toBe(2);
  expect((await salvoAuto(page)).jogo.campanha.ato).toBe(1);
});

test('Parte 1: sem tremor com "Tremores" desligados', async ({ page }) => {
  test.setTimeout(150_000);
  await semear(page, { cena: 'c1-03' }, { config: { tremores: false } });
  await continuar(page);
  await naCena(page, 'c1-03');
  await ateFala(page, 'O alçapão se fecha sobre a sua cabeça.');
  expect(await efeitosNomes(page)).toContain('alcapao-fecha');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => !!document.querySelector('.tela.tremendo-leve, .tela.tremendo'))).toBe(false);
});
