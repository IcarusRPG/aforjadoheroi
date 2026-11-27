import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { irAteMenu } from './ajudantes';
/** Füllmun passou a ter 2400 px de largura (Fase 5): coordenadas do mapa antigo → novas. */
const M = (v: number) => Math.round((v * 2400) / 1672);

/* Fase 4F: imagens que só aparecem prontas, carregamento por etapa, profundidade em Füllmun e escala do templo. */

type Estado = Record<string, any>;
const HEROI = {
  nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones',
  atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
  atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
  classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
};
const SEM_DICAS = { tutorial: false, ajudaFullmunVista: true };

interface Semente { campanha?: Record<string, unknown>; config?: Record<string, unknown> }
function semear(page: Page, o: Semente = {}) {
  return page.addInitScript((op) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1,
      versaoSave: 4,
      config: { musica: 0.7, efeitos: 0.8, mudo: false, ...op.config },
      personagem: op.heroi,
      sonho: { concluido: true, ouvidas: ['solem', 'justar', 'irae'] },
      campanha: { capitulo: 1, cena: null, modo: 'falas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null, ...op.campanha },
    }));
  }, { campanha: o.campanha ?? {}, config: o.config ?? SEM_DICAS, heroi: HEROI });
}
const MAPA = (mapa: string, extra: Record<string, unknown> = {}) => ({ cena: 'c01-soleira', modo: 'escolhas', local: { tela: 'mapa', mapa }, ...extra });

const st = (page: Page): Promise<Estado> => page.evaluate(() => (window as unknown as { __fdg?: { state(): Estado } }).__fdg?.state() ?? {});
const f = (page: Page, m: string, ...args: unknown[]) =>
  page.evaluate(([mm, aa]) => (window as unknown as { __fdg?: Record<string, (...x: unknown[]) => unknown> }).__fdg?.[mm as string]?.(...(aa as unknown[])), [m, args] as const);
const foto = (page: Page, projeto: string, nome: string) => page.screenshot({ path: `tests/screenshots/${projeto}-fase4f-${nome}.png` });

/**
 * Rede limitada a "Fast 3G" (1,6 Mbps, 562 ms de latência) nos Chromium, pelo DevTools. No WebKit
 * (iPhone), que não tem essa emulação, cada imagem e dado do jogo chega com 600 ms de atraso.
 */
async function rede3G(page: Page, info: TestInfo) {
  if (info.project.name === 'iphone-13') {
    await page.route(/\/assets\/.+\.(webp|png|json)(\?|$)/, async (r) => { await new Promise((ok) => setTimeout(ok, 600)); await r.continue(); });
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8 * 0.9, uploadThroughput: (750 * 1024) / 8 * 0.9 });
}

async function continuar(page: Page) {
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Continuar' }).click();
}
async function noMapa(page: Page, id: string) {
  await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.mapa === id && s.pronto; }, { timeout: 180_000 }).toBe(true);
}

/* ======================================================================
   1. Intro: busto nunca vazio, nunca no passo errado (rede lenta, avançando rápido)
   ====================================================================== */

test('intro (Fast 3G): a moldura do busto nunca aparece vazia e o busto nunca aparece no passo errado', { tag: ['@intro'] }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await semear(page);
  await page.goto('./?test=1&tela=intro-fullmun');
  await page.locator('.loading-comecar').waitFor({ timeout: 90_000 });
  await rede3G(page, info);
  await page.locator('.loading-comecar').click();
  await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('introFullmun');
  // Até a etapa chegar: a tela de carregamento (com a barra), nunca a intro pela metade.
  const BUSTOS: Record<number, string> = { 6: 'artho', 9: 'nyme' };
  const erros: string[] = [];
  const conferir = async () => {
    const s = await st(page);
    if (s.bustoVazio) erros.push(`frase ${s.frase}: moldura vazia`);
    if (s.bustoPasso != null && s.bustoPasso !== s.frase) erros.push(`frase ${s.frase}: busto do passo ${s.bustoPasso}`);
    if (s.busto && BUSTOS[s.frase] !== s.busto) erros.push(`frase ${s.frase}: busto ${s.busto}`);
    return s;
  };
  await expect.poll(async () => (await conferir()).frase, { timeout: 180_000 }).toBeGreaterThanOrEqual(1);
  // Avança rápido (sem esperar a frase completar), conferindo o busto a cada 60 ms.
  for (let k = 0; k < 10; k++) {
    await f(page, 'avancar');
    for (let t = 0; t < 8; t++) { await conferir(); await page.waitForTimeout(60); }
  }
  // E devagar, para o busto da Nyme aparecer de verdade.
  await expect.poll(async () => (await conferir()).frase, { timeout: 60_000, intervals: [200] }).toBeGreaterThanOrEqual(9);
  expect(erros).toEqual([]);
});

/* ======================================================================
   2. Mapa: tela de carregamento e depois o mapa completo; nunca a tela vazia com o joystick
   ====================================================================== */

test('mapa (Fast 3G): aparece a tela de carregamento e depois o mapa completo, nunca o joystick sobre a tela vazia', { tag: ['@cap01'] }, async ({ page }, info) => {
  test.setTimeout(420_000);
  await semear(page, { campanha: MAPA('fullmun') });
  await irAteMenu(page, './?test=1');
  await rede3G(page, info);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.carregando-etapa.visivel')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.carregando-etapa .barra')).toBeVisible();
  await foto(page, info.project.name, 'mapa-carregando');
  const violacoes: string[] = [];
  for (;;) {
    const v = await page.evaluate(() => {
      const tela = document.querySelector('.tela-mapa');
      if (!tela) return { fim: false, ruim: null };
      const visivel = (sel: string) => { const e = tela.querySelector<HTMLElement>(sel); return !!e && !e.hidden && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0; };
      const pronto = tela.classList.contains('pronto');
      const ruim = !pronto && (visivel(':scope > canvas') || visivel('.joystick') || visivel('.btn-pausa') || visivel('.mapa-hud'));
      return { fim: pronto, ruim: ruim ? 'joystick, pausa ou canvas visível antes de o mapa ficar pronto' : null };
    });
    if (v.ruim) violacoes.push(v.ruim);
    if (v.fim) break;
    await page.waitForTimeout(150);
  }
  expect(violacoes).toEqual([]);
  await noMapa(page, 'fullmun');
  const s = await st(page);
  // O chão inteiro da área visível já veio, e a tela de carregamento saiu.
  expect(s.profundidade.blocosCarregados).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.carregando-etapa')).toHaveCount(0, { timeout: 5000 });
  await expect.poll(async () => (await st(page)).profundidade.blocosCarregados, { timeout: 60_000 }).toBe(s.profundidade.blocos);
});

/* ======================================================================
   3. Cenas: a imagem nova só aparece carregada
   ====================================================================== */

test('cenas (Fast 3G): ao trocar de cena, o fundo novo só aparece carregado', { tag: ['@cap01'] }, async ({ page }, info) => {
  test.setTimeout(420_000);
  await semear(page, { campanha: { cena: 'c01-quarto', modo: 'falas', local: { tela: 'capitulo' } } });
  await irAteMenu(page, './?test=1');
  await rede3G(page, info);
  await page.getByRole('button', { name: 'Continuar' }).click();
  const falhas: string[] = [];
  const fundos = new Set<string>();
  const inicio = Date.now();
  while (Date.now() - inicio < 120_000 && fundos.size < 2) {
    const r = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('.cena-fundo.visivel');
      if (!img || !img.getAttribute('src')) return null;
      return { id: img.dataset.cena ?? '', pronta: img.complete && img.naturalWidth > 0 };
    });
    if (r) { fundos.add(r.id); if (!r.pronta) falhas.push(`fundo ${r.id} visível sem carregar`); }
    const s = await st(page);
    if (await page.locator('.caderno-fundo').count()) await page.keyboard.press('Escape');
    else if (s.escolhas?.length) await page.locator('.cena-escolha').last().click().catch(() => {});
    else await f(page, 'avancar');
    await page.waitForTimeout(120);
  }
  expect(fundos.size).toBeGreaterThanOrEqual(2);
  expect(falhas).toEqual([]);
});

/* ======================================================================
   4. Füllmun: grade, recortes translúcidos, silhueta, moradores visíveis, destino
   ====================================================================== */

// A profundidade e o modo F2 de Füllmun passaram para fase5.spec.ts (mapa de chão + objetos).

test('Füllmun: depois do Mirtilo, o "!" vermelho pula sobre a casa da Aylin, a seta de borda aparece e tudo some quando ela entra', { tag: ['@layout', '@cap01'] }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await semear(page, { campanha: MAPA('fullmun', { flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_seguindo'] }) });
  await continuar(page);
  await noMapa(page, 'fullmun');
  // Perto da casa: o marcador acima da porta, sem seta.
  await f(page, 'teleport', M(1206), 380);
  await expect.poll(async () => (await st(page)).destino, { timeout: 5000 }).toMatchObject({ id: 'casa-aylin', cor: 'vermelho', seta: false });
  // Pula (o y do "!" muda com o tempo).
  const alturas = await page.evaluate(async () => {
    const cena = (window as any).__fdg;
    const r: number[] = [];
    for (let i = 0; i < 8; i++) { r.push(Math.round(cena.state().destinoMarcaY ?? 0)); await new Promise((ok) => setTimeout(ok, 110)); }
    return r;
  });
  expect(new Set(alturas).size).toBeGreaterThan(2); // o "!" sobe e desce
  await page.waitForTimeout(300);
  await foto(page, info.project.name, 'destino-aylin');
  // Longe: a seta vermelha na borda, apontando para a casa.
  await f(page, 'teleport', M(300), M(860));
  await page.waitForTimeout(1500);
  await expect.poll(async () => (await st(page)).destino?.seta, { timeout: 10_000 }).toBe(true);
  const seta = (await page.locator('.seta-destino').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(seta.x + seta.width / 2).toBeGreaterThan(vp.width / 2); // a casa fica a nordeste
  expect(seta.y + seta.height / 2).toBeLessThan(vp.height / 2);
  expect(seta.width).toBeGreaterThanOrEqual(44);
  await foto(page, info.project.name, 'destino-seta');
  // Uma conversa abre e fecha: o marcador continua certo (retorno de cena).
  await f(page, 'interactWith', 'npc:tobias');
  await expect.poll(async () => (await st(page)).palco, { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => {
    const e = await st(page);
    if (!e.palco) return true;
    if (!(e.escolhas ?? []).length) await f(page, 'avancar');
    else await page.locator('.cena-escolha').first().click().catch(() => {});
    return false;
  }, { timeout: 45_000, intervals: [220] }).toBe(true);
  await expect.poll(async () => (await st(page)).destino?.id, { timeout: 5000 }).toBe('casa-aylin');
  // Ela entra em casa: o marcador e a seta somem.
  await f(page, 'setFlag', 'aylin_em_casa');
  await expect.poll(async () => (await st(page)).destino, { timeout: 5000 }).toBeNull();
  await expect(page.locator('.seta-destino')).toBeHidden();
});

const MAPA_JSON = (id: string) => JSON.parse(readFileSync(`src/data/mapas/${id}.json`, 'utf8'));
/** Altura da porta de cada mapa, medida na imagem (scripts/grade-mapa.mjs). */
const PORTAS: Record<string, number> = { 'templo-salao': 175, 'templo-biblioteca': 310 };

for (const id of ['templo-salao', 'templo-biblioteca']) {
  test(`templo (${id}): o herói tem entre 55% e 65% da altura da porta e todas as interações são alcançáveis`, { tag: ['@layout', '@cap01'] }, async ({ page }, info) => {
    test.setTimeout(600_000);
    await semear(page, { campanha: MAPA(id, { capitulo: 2, cena: 'c02-artho', atraso: 2, flags: ['nyme_seguindo'] }) });
    await continuar(page);
    await noMapa(page, id);
    const s = await st(page);
    const mapa = MAPA_JSON(id);
    expect(s.escala).toBe(mapa.escalaPersonagens);
    // O sprite tem 48 px de quadro, com 45 px de personagem.
    const altura = (s.heroiAltura * 45) / 48;
    const proporcao = altura / PORTAS[id];
    expect(proporcao).toBeGreaterThanOrEqual(0.55);
    expect(proporcao).toBeLessThanOrEqual(0.65);
    await page.waitForTimeout(500);
    await foto(page, info.project.name, `${id}-escala`);
    // Cada objeto de interação visível: o herói chega perto e o ✦ aponta para ele.
    for (const o of s.objetos as string[]) {
      const dados = mapa.objetos.find((x: { id: string }) => x.id === o);
      const alvo = dados.interacao ?? dados;
      await f(page, 'walkTo', alvo.x, alvo.y);
      await expect.poll(async () => (await st(page)).proximo, { timeout: 15_000, message: `não alcançou ${o}` }).toBe(`obj:${o}`);
    }
  });
}

/* ======================================================================
   6. Tabela de pesos (antes e depois) como imagem
   ====================================================================== */

test('pesos dos assets: tabela antes e depois', { tag: ['@layout', '@cap01'] }, async ({ page }) => {
  test.skip(test.info().project.name !== 'pixel-7', 'uma imagem basta');
  const md = readFileSync('docs/pesos-assets.md', 'utf8');
  const linhas = md.split('\n').filter((l) => l.startsWith('|') && !l.startsWith('| ---'));
  const html = `<style>body{font:14px Inter,system-ui,sans-serif;background:#14100c;color:#f3eee5;padding:16px}table{border-collapse:collapse}td,th{border:1px solid #5a4a30;padding:4px 8px}td:nth-child(4),td:nth-child(5){text-align:right}tr:first-child{background:#3a2c18;font-weight:700}tr:last-child{font-weight:700;background:#2a2016}</style>
    <h2 style="font-family:Georgia,serif;color:#f0c860">Pesos dos assets — antes e depois (Fase 4F)</h2><table>${linhas.map((l) => `<tr>${l.split('|').slice(1, -1).map((c) => `<td>${c.trim().replace(/\*\*/g, '')}</td>`).join('')}</tr>`).join('')}</table>`;
  await page.setViewportSize({ width: 900, height: 1300 });
  await page.setContent(html);
  await page.screenshot({ path: 'tests/screenshots/fase4f-pesos-assets.png', fullPage: true });
});
