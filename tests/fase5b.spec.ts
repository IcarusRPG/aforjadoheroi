import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { devagar, irAteMenu } from './ajudantes';

/* Fase 5B: escala dos personagens, nitidez, itens de missão, balões, biblioteca, teclado e botão MENU. */

type Estado = Record<string, any>;
const HEROI = {
  nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones',
  atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
  atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
  classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
};

function semear(page: Page, campanha: Record<string, unknown>, config: Record<string, unknown> = {}) {
  return page.addInitScript(([h, c, cf]) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1, versaoSave: 5,
      config: { musica: 0.7, efeitos: 0.8, mudo: false, tutorial: false, ajudaFullmunVista: true, ...cf },
      personagem: h,
      sonho: { concluido: true, ouvidas: ['solem', 'justar', 'irae'] },
      campanha: { capitulo: 1, cena: null, modo: 'falas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null, ...c },
    }));
  }, [HEROI, campanha, config] as const);
}
const FULLMUN = (extra: Record<string, unknown> = {}) => ({ cena: 'c01-soleira', modo: 'escolhas', local: { tela: 'mapa', mapa: 'fullmun' }, flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_em_casa'], ...extra });
const TEMPLO = (mapa: string, extra: Record<string, unknown> = {}) => ({ capitulo: 2, cena: 'c02-artho', modo: 'escolhas', atraso: 2, local: { tela: 'mapa', mapa }, flags: ['nyme_seguindo'], ...extra });
const st = (page: Page): Promise<Estado> => page.evaluate(() => (window as unknown as { __fdg?: { state(): Estado } }).__fdg?.state() ?? {});
const f = (page: Page, m: string, ...args: unknown[]) =>
  page.evaluate(([mm, aa]) => (window as unknown as { __fdg?: Record<string, (...x: unknown[]) => unknown> }).__fdg?.[mm as string]?.(...(aa as unknown[])), [m, args] as const);
const foto = (page: Page, info: TestInfo, nome: string) => page.screenshot({ path: `tests/screenshots/${info.project.name}-fase5b-${nome}.png` });
const umAparelho = (info: TestInfo) => info.project.name === 'pixel-7';

async function continuar(page: Page, query = '?test=1') {
  await irAteMenu(page, `./${query}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
}
async function noMapa(page: Page, id = 'fullmun') {
  await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.mapa === id && s.pronto; }, { timeout: 120_000 }).toBe(true);
}
const sobrepoe = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/* ======================================================================
   1. Proporção herói × porta e nitidez
   ====================================================================== */

/** Altura das portas (px do mapa), medida nas imagens: Füllmun = casa do herói, casa da Hulda, padaria. */
const PORTAS: Record<string, number[]> = { fullmun: [95, 92, 97], 'templo-salao': [175], 'templo-biblioteca': [310] };

for (const id of Object.keys(PORTAS)) {
  test(`proporção (${id}): o herói tem entre 55% e 65% da altura da porta; personagens nítidos (nearest, escala inteira na tela)`, { tag: ['@layout', '@cap01'] }, async ({ page }, info) => {
    test.setTimeout(240_000);
    await semear(page, id === 'fullmun' ? FULLMUN() : TEMPLO(id));
    await continuar(page);
    await noMapa(page, id);
    const s = await st(page);
    // O quadro do chibi tem 48 px, com 45 px de personagem.
    const heroi = (s.heroiAltura * 45) / 48;
    for (const porta of PORTAS[id]) {
      expect(heroi / porta, `porta de ${porta} px`).toBeGreaterThanOrEqual(0.55);
      expect(heroi / porta, `porta de ${porta} px`).toBeLessThanOrEqual(0.65);
    }
    // Nitidez: filtro nearest (1) em todas as texturas de personagem; cada pixel do chibi = inteiro na tela.
    expect(Object.keys(s.nitidez.filtros)).toContain('heroi');
    for (const [k, v] of Object.entries(s.nitidez.filtros)) expect(v, k).toBe(1);
    expect(Math.abs(s.nitidez.escalaTela - Math.round(s.nitidez.escalaTela))).toBeLessThan(1e-6);
    if (id === 'fullmun') {
      await f(page, 'teleport', 1765, 760);
      await page.waitForTimeout(1200);
      await foto(page, info, 'fullmun-heroi-e-casa');
    }
  });
}

test('sonho: personagens nítidos (nearest, escala inteira na tela)', { tag: ['@layout', '@cap01'] }, async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript((h) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({ versao: 1, config: { musica: 0.7, efeitos: 0.8, mudo: false, ajudaFullmunVista: true }, personagem: h, sonho: { concluido: false, ouvidas: [] } }));
  }, HEROI);
  await continuar(page);
  await expect(page.locator('.tela-sonho.pronto canvas')).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await st(page)).pronto, { timeout: 30_000 }).toBe(true);
  const s = await st(page);
  for (const [k, v] of Object.entries(s.nitidez.filtros)) expect(v, k).toBe(1);
  expect(Math.abs(s.nitidez.escalaTela - Math.round(s.nitidez.escalaTela))).toBeLessThan(1e-6);
});

/* ======================================================================
   2. Itens de missão
   ====================================================================== */

test('itens de missão: ≥ 90% visíveis, ≥ 60% do herói, camisa sobre a padaria, lençol na frente da cerca; o HUD conta', { tag: ['@layout', '@cap01'] }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await semear(page, FULLMUN({ missoes: { hulda: 'aceita' } }));
  await continuar(page);
  await noMapa(page);
  let s = await st(page);
  const itens: Estado[] = s.itens;
  expect(itens.map((i) => i.id).sort()).toEqual(['camisa', 'lenco', 'lencol']);
  for (const i of itens) {
    expect(i.visivel, `${i.id} visível`).toBeGreaterThanOrEqual(0.9);
    expect(i.alturaRel, `${i.id} tamanho`).toBeGreaterThanOrEqual(0.6);
  }
  // Camisa: acima da padaria (profundidade 718 = y da base); lençol: na frente do segmento de cerca de baixo (790).
  expect(itens.find((i) => i.id === 'camisa')!.profundidade).toBeGreaterThan(718);
  expect(itens.find((i) => i.id === 'lencol')!.profundidade).toBeGreaterThan(790);
  expect(s.coleta).toMatchObject({ rotulo: 'Roupas', n: 0, total: 3 });
  expect(s.hud).toContain('Roupas 0/3');
  await f(page, 'teleport', 1640, 650);
  await page.waitForTimeout(1500);
  await foto(page, info, 'camisa');
  await f(page, 'teleport', 1840, 760);
  await page.waitForTimeout(1500);
  await foto(page, info, 'lencol');
  // Pega o lenço: o contador sobe.
  await f(page, 'interactWith', 'obj:lenco');
  await expect.poll(async () => {
    const e = await st(page);
    if (e.palco && !(e.escolhas ?? []).length) await f(page, 'avancar');
    else if (e.palco) await page.locator('.cena-escolha').first().click().catch(() => {});
    return e.palco === false && e.hud.includes('Roupas 1/3');
  }, { timeout: 45_000, intervals: [250] }).toBe(true);
  s = await st(page);
  expect(s.itens.map((i: Estado) => i.id)).not.toContain('lenco');
});

/* ======================================================================
   3. Balões de missão e indicadores de borda
   ====================================================================== */

test('balões: ! … ? com 45% do herói (≥ 28 px na tela); indicadores de borda, no máximo 3', { tag: ['@layout', '@cap01'] }, async ({ page }, info) => {
  test.setTimeout(300_000);
  // Hulda pronta para entregar (?), Osric em andamento (…), Kobanu e Tobias com missão (!).
  await semear(page, FULLMUN({ missoes: { hulda: 'aceita', osric: 'aceita' }, inventario: { lencol: 1, lenco: 1, camisa: 1 }, flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_em_casa', 'falou_hulda', 'falou_osric'] }));
  await continuar(page);
  await noMapa(page);
  await page.waitForTimeout(800);
  let s = await st(page);
  const tipos = new Set(s.baloes.map((b: Estado) => b.tipo));
  for (const t of ['!', '…', '?']) expect(tipos, `balão ${t}`).toContain(t);
  for (const b of s.baloes) {
    expect(b.alturaTela, `${b.id} na tela`).toBeGreaterThanOrEqual(27.9);
    expect(b.alturaRel, `${b.id} × herói`).toBeGreaterThanOrEqual(0.44);
  }
  for (const d of s.marcadoresProfundidade) expect(d).toBeGreaterThanOrEqual(150_000);
  // Perto da Hulda: os três balões na foto.
  await f(page, 'teleport', 640, 1080);
  await page.waitForTimeout(1300);
  await foto(page, info, 'balao-interrogacao');
  await f(page, 'teleport', 1700, 820);
  await page.waitForTimeout(1300);
  await foto(page, info, 'baloes-exclamacao');
  // Longe de todos: indicadores na borda (até 3), só para ! e ?.
  await f(page, 'teleport', 300, 300);
  await page.waitForTimeout(1500);
  s = await st(page);
  expect(s.indicadores.length).toBeGreaterThan(0);
  expect(s.indicadores.length).toBeLessThanOrEqual(3);
  for (const i of s.indicadores) expect(['!', '?']).toContain(i.tipo);
  await expect(page.locator('.indicador-borda:not([hidden])')).toHaveCount(s.indicadores.length);
  await foto(page, info, 'indicadores-borda');
});

/* ======================================================================
   4. Biblioteca: livros e alçapão
   ====================================================================== */

test('biblioteca: livros com ~35% do herói, escuros depois de lidos; alçapão com "!" grande e anel só na hora certa', { tag: ['@cap01'] }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await semear(page, TEMPLO('templo-biblioteca', { usadas: ['ef:livro-solem'] }));
  await continuar(page);
  await noMapa(page, 'templo-biblioteca');
  let s = await st(page);
  const livros = s.itens.filter((i: Estado) => i.id.startsWith('livro-'));
  expect(livros).toHaveLength(3);
  for (const l of livros) {
    expect(l.alturaRel).toBeGreaterThanOrEqual(0.3);
    expect(l.alturaRel).toBeLessThanOrEqual(0.4);
    expect(l.visivel).toBeGreaterThanOrEqual(0.9);
  }
  expect(livros.find((l: Estado) => l.id === 'livro-solem').escuro).toBe(true);
  expect(livros.find((l: Estado) => l.id === 'livro-alfars').escuro).toBe(false);
  // Antes da hora: o alçapão não tem marcador.
  expect(s.baloes.filter((b: Estado) => b.id === 'obj:alcapao')).toEqual([]);
  // Na hora certa: "!" 1,5× maior e o anel no chão.
  await f(page, 'setFlag', 'alcapao_liberado');
  await f(page, 'refresh');
  await expect.poll(async () => (await st(page)).baloes.find((b: Estado) => b.id === 'obj:alcapao') ?? null, { timeout: 5000 }).not.toBeNull();
  s = await st(page);
  const b = s.baloes.find((x: Estado) => x.id === 'obj:alcapao');
  expect(b.tipo).toBe('!');
  expect(b.anel).toBe(true);
  expect(b.alturaRel).toBeGreaterThanOrEqual(0.45 * 1.5 - 0.01);
  await f(page, 'teleport', 800, 540); // andável, perto do alçapão
  await page.waitForTimeout(1300);
  await foto(page, info, 'biblioteca');
  // Longe do alçapão: se ele sai da vista, o indicador de borda aponta para ele (na paisagem a sala inteira
  // cabe na largura e o alçapão continua à vista, sem indicador).
  await f(page, 'teleport', 236, 610); // a entrada (andável), longe do alçapão
  await page.waitForTimeout(1500);
  const c = (await st(page)).cameraInfo;
  const aVista = 835 > c.x + 8 && 835 < c.x + c.w - 8 && 400 > c.y + 8 && 400 < c.y + c.h - 8;
  const ids = async () => (await st(page)).indicadores.map((i: Estado) => i.id);
  if (aVista) expect(await ids()).not.toContain('obj:alcapao');
  else await expect.poll(ids, { timeout: 15_000 }).toContain('obj:alcapao');
});

/* ======================================================================
   5. Teclado (PC)
   ====================================================================== */

test.describe('teclado no PC', () => {
  test.beforeEach(({}, info) => test.skip(!umAparelho(info), 'teclado: um navegador de computador basta'));
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 });

  test('Espaço/Enter completam e avançam; a página não rola; a dica "Espaço ▸" aparece', { tag: ['@interface'] }, async ({ page }) => {
    await devagar(page); // mede a animação
    test.setTimeout(180_000);
    await semear(page, { cena: 'c01-aylin', modo: 'falas', local: { tela: 'capitulo' } });
    await continuar(page);
    await expect.poll(async () => (await st(page)).cena, { timeout: 30_000 }).toBe('c01-aylin');
    await expect(page.locator('.cena-caixa .dica-tecla')).toBeVisible();
    await expect.poll(async () => (await st(page)).digitando, { timeout: 15_000 }).toBe(false);
    // Enter avança para a próxima fala...
    const antes = await page.locator('.cena-texto').textContent();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('.cena-texto').textContent(), { timeout: 5000 }).not.toBe(antes);
    // ...e Espaço, com a fala ainda aparecendo, completa o texto na hora (depois disso ele não muda mais).
    await page.keyboard.press('Space');
    const completa = await page.locator('.cena-texto').textContent();
    expect((await st(page)).digitando).toBe(false);
    await page.waitForTimeout(800);
    expect(await page.locator('.cena-texto').textContent()).toBe(completa);
    // Espaço de novo: próxima fala.
    await page.keyboard.press('Space');
    await expect.poll(() => page.locator('.cena-texto').textContent(), { timeout: 5000 }).not.toBe(completa);
    expect(await page.evaluate(() => (document.scrollingElement?.scrollTop ?? 0) + window.scrollY)).toBe(0);
  });

  test('escolhas: Espaço não escolhe; setas + Enter escolhem; Espaço pula o dado', { tag: ['@interface'] }, async ({ page }) => {
    await devagar(page); // mede a animação
    test.setTimeout(180_000);
    await semear(page, { cena: 'c01-grito', modo: 'escolhas', local: { tela: 'capitulo' } });
    await continuar(page);
    await expect.poll(async () => ((await st(page)).escolhas ?? []).length, { timeout: 60_000 }).toBe(3);
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    expect((await st(page)).escolhas).toHaveLength(3);
    await expect(page.locator('.rolagem-fundo')).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.cena-escolha.destacada')).toHaveCount(1);
    await expect(page.locator('.cena-escolha').nth(0)).toHaveClass(/destacada/);
    await page.keyboard.press('s');
    await page.keyboard.press('w');
    await expect(page.locator('.cena-escolha').nth(0)).toHaveClass(/destacada/);
    await f(page, 'forceRoll', [15]);
    await page.keyboard.press('Enter');
    const dado = page.locator('.rolagem .dado');
    await expect(dado).toHaveClass(/rolando/, { timeout: 5000 });
    await page.keyboard.press('Space');
    await expect(dado).toHaveAttribute('data-valor', '15', { timeout: 600 });
    expect(await page.evaluate(() => (document.scrollingElement?.scrollTop ?? 0) + window.scrollY)).toBe(0);
  });

  test('escolhas: os números 1 a 4 escolhem direto', { tag: ['@interface'] }, async ({ page }) => {
    test.setTimeout(180_000);
    await semear(page, { cena: 'c01-aylin', modo: 'escolhas', local: { tela: 'capitulo' } });
    await continuar(page);
    await expect.poll(async () => ((await st(page)).escolhas ?? []).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    const segunda = (await st(page)).escolhas[1] as string;
    const caminho = (await st(page)).caminho.length;
    await page.keyboard.press('2');
    await expect.poll(async () => (await st(page)).caminho.length, { timeout: 5000 }).toBeGreaterThan(caminho);
    const ultimo = (await st(page)).caminho.at(-1);
    expect(ultimo.cena).toBe('c01-aylin');
    expect(segunda).toContain(ultimo.escolha.slice(0, 12));
  });

  test('mapa: Espaço abre a conversa, avança e fecha; fechar não reabre', { tag: ['@layout', '@interface'] }, async ({ page }) => {
    test.setTimeout(240_000);
    await semear(page, FULLMUN({ flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_em_casa', 'falou_selene'] }));
    await continuar(page);
    await noMapa(page);
    await f(page, 'walkTo', 568, 530);
    await expect.poll(async () => (await st(page)).proximo, { timeout: 15_000 }).toBe('npc:selene');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await st(page)).palco, { timeout: 5000 }).toBe(true);
    for (let i = 0; i < 12 && (await st(page)).palco; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(350);
    }
    expect((await st(page)).palco).toBe(false);
    await page.waitForTimeout(600);
    expect((await st(page)).palco).toBe(false);
    // Depois dos 150 ms, Espaço volta a interagir.
    await page.keyboard.press('Space');
    await expect.poll(async () => (await st(page)).palco, { timeout: 5000 }).toBe(true);
  });
});

/* ======================================================================
   6. Botão MENU
   ====================================================================== */

async function conferirMenu(page: Page, info: TestInfo, nome: string, evitar: string[]) {
  const b = page.locator('.btn-menu:visible').first();
  await expect(b).toBeVisible();
  await expect(b).toContainText('MENU');
  const c = (await b.boundingBox())!;
  expect(Math.round(c.height)).toBeGreaterThanOrEqual(44);
  const vp = page.viewportSize()!;
  expect(c.x + c.width).toBeLessThanOrEqual(vp.width);
  expect(c.y).toBeGreaterThanOrEqual(0);
  for (const sel of evitar) {
    for (const outro of await page.locator(`${sel}:visible`).all()) {
      const o = await outro.boundingBox();
      if (o) expect(sobrepoe(c, o), `MENU × ${sel}`).toBe(false);
    }
  }
  await foto(page, info, `menu-${nome}`);
}

test('botão MENU no mapa (sem cobrir o relógio), nas cenas e na batalha; o painel se chama "Menu"; Esc abre e fecha', { tag: ['@interface'] }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await semear(page, FULLMUN({ missoes: { hulda: 'aceita' } }));
  await continuar(page);
  await noMapa(page);
  await page.waitForTimeout(800);
  await conferirMenu(page, info, 'mapa', ['.mapa-hud', '.mapa-dica', '.joystick', '.btn-interagir']);
  await page.locator('.btn-menu').click();
  await expect(page.locator('.modal-titulo')).toHaveText('Menu');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-fundo')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-titulo')).toHaveText('Menu');
  await page.keyboard.press('Escape');

  // Cena (aba nova; a do mapa fecha antes, para não continuar salvando por cima)
  const ctx = page.context();
  await page.close();
  await ctx.clearCookies();
  const cena = await ctx.newPage();
  await cena.goto('./?test=1');
  await cena.evaluate(() => localStorage.clear());
  await semear(cena, { cena: 'c01-grito', modo: 'escolhas', local: { tela: 'capitulo' } });
  await continuar(cena);
  await expect.poll(async () => ((await st(cena)).escolhas ?? []).length, { timeout: 60_000 }).toBe(3);
  await conferirMenu(cena, info, 'cena', ['.cena-caixa', '.cena-escolhas']);
  // Batalha (o Mirtilo)
  await cena.locator('.cena-escolha', { hasText: 'Ficar entre' }).click();
  await expect.poll(async () => (await st(cena)).tela, { timeout: 60_000 }).toBe('batalha');
  await cena.waitForTimeout(1500);
  await conferirMenu(cena, info, 'batalha', ['.batalha-topo > *', '.batalha-comandos']);
});
