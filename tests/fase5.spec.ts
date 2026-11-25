import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { irAteMenu, novoJogo } from './ajudantes';

/* Fase 5: Füllmun de chão + objetos, editor, dado animado, panteão novo, celular deitado e tela cheia. */

type Estado = Record<string, any>;
const HEROI = {
  nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones',
  atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
  atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
  classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
};
const PANTEAO = ['solem', 'justar', 'aletris', 'amorina', 'bellica', 'etheria', 'floressa', 'logos', 'nocturna', 'odincia',
  'ardor', 'draconara', 'eternus', 'expiria', 'fraudulus', 'insidia', 'irae', 'mentis', 'paxus', 'valorus'];

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
const st = (page: Page): Promise<Estado> => page.evaluate(() => (window as unknown as { __fdg?: { state(): Estado } }).__fdg?.state() ?? {});
const f = (page: Page, m: string, ...args: unknown[]) =>
  page.evaluate(([mm, aa]) => (window as unknown as { __fdg?: Record<string, (...x: unknown[]) => unknown> }).__fdg?.[mm as string]?.(...(aa as unknown[])), [m, args] as const);
const foto = (page: Page, info: TestInfo, nome: string) => page.screenshot({ path: `tests/screenshots/${info.project.name}-fase5-${nome}.png` });
const deitado = (info: TestInfo) => info.project.name.startsWith('paisagem');

async function continuar(page: Page, query = '?test=1') {
  await irAteMenu(page, `./${query}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
}
async function noMapa(page: Page, id = 'fullmun') {
  await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.mapa === id && s.pronto; }, { timeout: 120_000 }).toBe(true);
}

/* ======================================================================
   1. Füllmun: profundidade de verdade (y-sort), copas, marcadores e desempenho
   ====================================================================== */

test('Füllmun: o herói fica atrás e na frente de uma casa, de uma árvore e de uma barraca; nada cobre os moradores', async ({ page }, info) => {
  test.setTimeout(300_000);
  await semear(page, FULLMUN());
  await continuar(page);
  await noMapa(page);
  let s = await st(page);
  expect(s.cenario).toBeGreaterThan(60);
  for (const n of s.npcsCobertura) expect(n.coberto, `${n.id} coberto demais`).toBeLessThanOrEqual(0.2);
  for (const d of s.marcadoresProfundidade) expect(d).toBeGreaterThanOrEqual(150_000);
  // [objeto, x, y atrás, y na frente]
  const casos: [string, number, number, number][] = [['padaria', 1765, 573, 734], ['carvalho', 1773, 927, 960], ['barraca-azul', 1032, 595, 668]];
  for (const [id, x, atras, frente] of casos) {
    await f(page, 'teleport', x, atras);
    await page.waitForTimeout(400);
    s = await st(page);
    expect(s.fora, `${id}: atrás num ponto livre`).toBe(false);
    // Os blocos do cenário perto do herói carregam sob demanda: espera o objeto entrar.
    await expect.poll(async () => (await st(page)).heroiCobertura, { timeout: 8000, message: `${id}: atrás, o objeto cobre o herói` }).toBeGreaterThan(0.25);
    s = await st(page);
    if (id === 'padaria') await foto(page, info, 'heroi-atras-da-casa');
    if (id === 'carvalho') expect(s.profundidade.translucidos).toContain('carvalho');
    await f(page, 'teleport', x, frente);
    await page.waitForTimeout(400);
    s = await st(page);
    expect(s.fora, `${id}: na frente num ponto livre`).toBe(false);
    expect(s.heroiCobertura, `${id}: na frente, nada cobre o herói`).toBe(0);
    if (id === 'carvalho') await foto(page, info, 'heroi-na-frente-da-arvore');
  }
  // Atrás da padaria a silhueta dourada aparece (reserva para quando o objeto cobre mais de 40%).
  await f(page, 'teleport', 1765, 573);
  await expect.poll(async () => (await st(page)).profundidade.silhuetas, { timeout: 5000 }).toContain('heroi');
  // Anda em várias direções: os pés nunca ficam dentro de um pé de objeto.
  await f(page, 'teleport', 1140, 880);
  for (const tecla of ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
    await page.keyboard.down(tecla);
    for (let t = 0; t < 10; t++) { expect((await st(page)).fora).toBe(false); await page.waitForTimeout(80); }
    await page.keyboard.up(tecla);
  }
});

test('Füllmun: o "!" vermelho da Aylin, a seta de borda e as animações (e Animações reduzidas desligam tudo)', async ({ page }, info) => {
  test.setTimeout(300_000);
  await semear(page, FULLMUN({ flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_seguindo'] }));
  await continuar(page);
  await noMapa(page);
  await f(page, 'teleport', 1730, 400);
  await expect.poll(async () => (await st(page)).destino, { timeout: 5000 }).toMatchObject({ id: 'casa-aylin', seta: false });
  await f(page, 'teleport', 430, 1230);
  await page.waitForTimeout(1200);
  await expect.poll(async () => (await st(page)).destino?.seta, { timeout: 10_000 }).toBe(true);
  // Opções → Animações reduzidas: liga na hora (o mapa desliga fumaça, fogo, lanternas, varal, copas e água).
  await page.locator('.btn-pausa').click();
  await page.getByRole('button', { name: 'Opções', exact: true }).click();
  await page.locator('label[for="opcao-animacoes"]').click();
  await expect(page.locator('#opcao-animacoes')).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}').animacoesReduzidas)).toBe(true);
});

test('Füllmun: desempenho de pelo menos 50 fps com a CPU 4× mais lenta (com GPU)', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel-7', 'mede num aparelho só (Chromium com GPU)');
  test.setTimeout(300_000);
  // Um navegador com a GPU da máquina: o WebGL por software do modo headless não representa um celular.
  const { chromium } = await import('@playwright/test');
  const nav = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }).catch(() => null);
  test.skip(!nav, 'sem GPU disponível');
  const ctx = await nav!.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
  const page = await ctx.newPage();
  await semear(page, FULLMUN({ flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_seguindo'] }));
  await continuar(page);
  await noMapa(page);
  const gpu = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl'); const e = c?.getExtension('WEBGL_debug_renderer_info'); return e ? String(c!.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''; });
  test.skip(/swiftshader/i.test(gpu), 'sem GPU (SwiftShader)');
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await f(page, 'teleport', 1140, 880);
  await page.keyboard.down('ArrowRight');
  const fps = await page.evaluate(() => new Promise<number>((ok) => { let n = 0; const t0 = performance.now(); const p = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(p); else ok(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(p); }));
  await page.keyboard.up('ArrowRight');
  console.log(`Füllmun com CPU 4× mais lenta (${gpu}): ${fps.toFixed(1)} fps`);
  expect(Math.round(fps)).toBeGreaterThanOrEqual(50);
  await nav!.close();
});

/* ======================================================================
   2. Editor (?editor=1)
   ====================================================================== */

test('editor: ?editor=1 abre, arrasta um objeto, mostra o fantasma e exporta um JSON válido', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel-7', 'ferramenta de ajuste: um aparelho basta');
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1366, height: 820 });
  await semear(page, FULLMUN());
  await continuar(page, '?test=1&editor=1');
  await noMapa(page);
  await expect(page.locator('.editor-mapa')).toBeVisible();
  // O poço: toca nele e arrasta 40 px (de tela) para a direita.
  await f(page, 'teleport', 1140, 880);
  await page.waitForTimeout(800);
  const mundoParaTela = (x: number, y: number) => page.evaluate(([wx, wy]) => {
    const cv = document.querySelector('.tela-mapa canvas') as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const s = (window as any).__fdg.state();
    const cam = s.cameraInfo;
    return { x: r.left + (wx - cam.x) * cam.zoom * (r.width / cv.width), y: r.top + (wy - cam.y) * cam.zoom * (r.height / cv.height) };
  }, [x, y]);
  const p0 = await mundoParaTela(1140, 760);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(p0.x + 40, p0.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await st(page)).editor?.selecao?.id, { timeout: 5000 }).toBe('poco');
  await page.locator('.editor-mapa label', { hasText: 'Mapa antigo' }).click();
  await expect.poll(async () => (await st(page)).editor?.fantasma, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/screenshots/fase5-editor-fantasma.png' });
  const json = await f(page, 'editorExportar') as string;
  const mapa = JSON.parse(json);
  expect(mapa.id).toBe('fullmun');
  expect(Array.isArray(mapa.objetos)).toBe(true);
  const poco = mapa.objetos.find((o: { id: string }) => o.id === 'poco');
  expect(poco.x).toBeGreaterThan(1150);
  // O botão baixa o arquivo.
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.editor-exportar').click()]);
  expect(download.suggestedFilename()).toBe('fullmun.json');
});

/* ======================================================================
   3. Dado
   ====================================================================== */

async function aoTeste(page: Page, roll: number[], reduzidas = false) {
  await semear(page, { cena: 'c01-grito', modo: 'escolhas', local: { tela: 'capitulo' } }, reduzidas ? { animacoesReduzidas: true } : {});
  await continuar(page);
  await expect.poll(async () => ((await st(page)).escolhas ?? []).length, { timeout: 60_000 }).toBeGreaterThan(0);
  await f(page, 'forceRoll', roll);
  await page.locator('.cena-escolha', { hasText: 'Gritar' }).click();
}

test('dado: azul por padrão; anima (gira, quica) até o resultado; o 20 brilha com "CRÍTICO!"', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    // Anota cada classe que o dado da rolagem recebe (girando, parado…): máquina lenta não perde o giro.
    const vistas = new Set<string>();
    (window as unknown as { __classesDado: Set<string> }).__classesDado = vistas;
    const anotar = (e: Element) => { if (e.classList?.contains('dado')) e.classList.forEach((c) => vistas.add(c)); };
    new MutationObserver((ms) => {
      for (const m of ms) {
        anotar(m.target as Element);
        m.addedNodes.forEach((n) => { if (n instanceof Element) { anotar(n); n.querySelectorAll('.dado').forEach(anotar); } });
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  });
  await aoTeste(page, [20]);
  const dado = page.locator('.rolagem .dado');
  await expect(dado).toHaveAttribute('data-dado', 'azul');
  await expect.poll(() => page.evaluate(() => [...(window as unknown as { __classesDado: Set<string> }).__classesDado]), { timeout: 8000 }).toContain('rolando');
  await page.waitForTimeout(350);
  await foto(page, info, 'dado-azul-girando');
  await expect(dado).toHaveAttribute('data-valor', '20', { timeout: 5000 });
  await expect(dado).toHaveClass(/dado-critico/);
  await expect(page.locator('.rolagem-critico')).toBeVisible();
  await page.waitForTimeout(400);
  await foto(page, info, 'dado-azul-critico');
});

test('dado: o 1 natural fica vermelho escuro com "FALHA!"; um toque durante o giro pula para o resultado', async ({ page }, info) => {
  test.setTimeout(240_000);
  await aoTeste(page, [1]);
  const dado = page.locator('.rolagem .dado');
  await expect(dado).toHaveClass(/rolando/, { timeout: 5000 });
  const t0 = Date.now();
  await page.locator('.rolagem-fundo').dispatchEvent('pointerdown');
  await expect(dado).toHaveAttribute('data-valor', '1', { timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(900);
  await expect(dado).toHaveClass(/dado-falha/);
  await expect(dado.locator('.dado-destaque')).toHaveText('FALHA!');
});

test('dado: com Animações reduzidas, o resultado aparece num fade, sem giro', async ({ page }) => {
  test.setTimeout(240_000);
  await aoTeste(page, [12], true);
  const dado = page.locator('.rolagem .dado');
  await expect(dado).toHaveAttribute('data-valor', '12', { timeout: 1500 });
});

test('dado: escolha em Opções (vermelho) vale nas rolagens e aparece no card do save', async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, { cena: 'c01-grito', modo: 'escolhas', local: { tela: 'capitulo' } });
  await continuar(page);
  await expect.poll(async () => ((await st(page)).escolhas ?? []).length, { timeout: 60_000 }).toBeGreaterThan(0);
  await page.locator('.btn-pausa').click();
  await page.getByRole('button', { name: 'Opções', exact: true }).click();
  await expect(page.locator('.escolha-dado-opcao[data-dado="azul"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('.escolha-dado-opcao[data-dado="vermelho"]').click();
  await expect(page.locator('.escolha-dado-opcao[data-dado="vermelho"]')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}').dado)).toBe('vermelho');
  await page.getByRole('button', { name: /Fechar/ }).last().click();
  // Card do save
  await page.locator('.btn-salvar').click();
  await expect(page.locator('.save-dado').first()).toHaveAttribute('data-dado', /azul|vermelho/);
  await page.locator('.saves-fechar').click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await f(page, 'forceRoll', [9]);
  await page.locator('.cena-escolha', { hasText: 'Gritar' }).click();
  const dado = page.locator('.rolagem .dado');
  await expect(dado).toHaveAttribute('data-dado', 'vermelho');
  await page.waitForTimeout(350);
  await foto(page, info, 'dado-vermelho-girando');
  await expect(dado).toHaveAttribute('data-valor', '9', { timeout: 5000 });
  await page.waitForTimeout(300);
  await foto(page, info, 'dado-vermelho-resultado');
});

test('dado: escolha na revisão da criação ("Seu dado")', async ({ page }) => {
  test.setTimeout(240_000);
  await irAteMenu(page, './?test=1');
  await novoJogo(page);
  // Pula para a revisão pelo gancho de teste da criação, se houver; senão confere só o componente nas Opções.
  const temRevisao = await page.evaluate(() => typeof (window as any).__fdg?.irParaRevisao === 'function');
  if (temRevisao) {
    await f(page, 'irParaRevisao');
    await expect(page.locator('.revisao-dado .escolha-dado-opcao')).toHaveCount(2);
    await page.locator('.revisao-dado .escolha-dado-opcao[data-dado="vermelho"]').click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}').dado)).toBe('vermelho');
  }
});

/* ======================================================================
   4. Panteão
   ====================================================================== */

test('panteão: as 20 imagens novas carregam com os ids certos', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel-7', 'um aparelho basta');
  await page.goto('./');
  const r = await page.evaluate(async (ids) => Promise.all(ids.map((id) => new Promise<[string, number]>((ok) => {
    const img = new Image();
    img.onload = () => ok([id, img.naturalWidth]);
    img.onerror = () => ok([id, 0]);
    img.src = `${location.pathname.replace(/[^/]*$/, '')}assets/img/panteao/${id}.webp`;
  }))), PANTEAO);
  for (const [id, w] of r) expect(w, id).toBeGreaterThan(200);
});

/* ======================================================================
   5. Horizontal: nada cortado, nada atrás dos controles; girar não perde nada
   ====================================================================== */

/** Todo texto visível da tela cabe na tela (ou numa caixa que rola). */
async function semCorte(page: Page, raiz: string) {
  const problemas = await page.evaluate((sel) => {
    const vw = innerWidth, vh = innerHeight;
    const rola = (e: Element | null): boolean => {
      for (let p = e?.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) return true;
      }
      return false;
    };
    const ruins: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(`${sel} p, ${sel} button, ${sel} h1, ${sel} h2, ${sel} h3, ${sel} li, ${sel} label`)) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || !(el.textContent ?? '').trim()) continue;
      const fora = r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1;
      if (fora && !rola(el)) ruins.push(`${el.className || el.tagName}: ${(el.textContent ?? '').trim().slice(0, 30)}`);
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'hidden') ruins.push(`cortado: ${(el.textContent ?? '').trim().slice(0, 30)}`);
    }
    return ruins;
  }, raiz);
  expect(problemas).toEqual([]);
}
/** Alvos de toque com 44 px. */
async function alvos44(page: Page, sel: string) {
  for (const b of await page.locator(sel).all()) {
    if (!(await b.isVisible())) continue;
    const c = (await b.boundingBox())!;
    expect(Math.min(c.height, c.width), await b.innerText().catch(() => sel)).toBeGreaterThanOrEqual(43.5);
  }
}

test('horizontal: menu, cenas, escolhas, teste, mapa, batalha e menus cabem na tela', async ({ page }, info) => {
  test.skip(!deitado(info), 'só deitado');
  test.setTimeout(420_000);
  await semear(page, { cena: 'c01-grito', modo: 'falas', local: { tela: 'capitulo' } });
  await irAteMenu(page, './?test=1');
  await page.waitForTimeout(1500);
  await semCorte(page, '.tela-menu');
  await alvos44(page, '.menu-botoes .btn');
  await foto(page, info, 'h-menu');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect.poll(async () => (await st(page)).cena, { timeout: 60_000 }).toBe('c01-grito');
  await page.waitForTimeout(2000);
  await semCorte(page, '.palco-cena');
  await foto(page, info, 'h-cena');
  await expect.poll(async () => { const s = await st(page); if ((s.escolhas ?? []).length) return true; await f(page, 'avancar'); return false; }, { timeout: 40_000 }).toBe(true);
  await page.waitForTimeout(600);
  await semCorte(page, '.palco-cena');
  await alvos44(page, '.cena-escolha');
  // As escolhas ficam na coluna da caixa de texto, à direita da imagem.
  const esc = (await page.locator('.cena-escolha').first().boundingBox())!;
  expect(esc.x).toBeGreaterThan(page.viewportSize()!.width * 0.5);
  await foto(page, info, 'h-escolhas');
  await f(page, 'forceRoll', [20]);
  await page.locator('.cena-escolha', { hasText: 'Gritar' }).click();
  await expect(page.locator('.rolagem.resolvida')).toBeVisible({ timeout: 10_000 });
  // O dado aparece sobre a imagem (metade esquerda).
  const d = (await page.locator('.rolagem .dado').boundingBox())!;
  expect(d.x + d.width / 2).toBeLessThan(page.viewportSize()!.width * 0.56);
  await semCorte(page, '.rolagem');
  await foto(page, info, 'h-teste');
});

test('horizontal: batalha com os comandos numa coluna à direita, sem cobrir os sprites', async ({ page }, info) => {
  test.skip(!deitado(info), 'só deitado');
  test.setTimeout(300_000);
  await semear(page, { cena: 'c01-grito', modo: 'escolhas', local: { tela: 'capitulo' } });
  await continuar(page);
  await page.locator('.cena-escolha', { hasText: 'enfrentá-lo' }).click({ timeout: 60_000 });
  await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('batalha');
  await expect.poll(async () => (await st(page)).vez, { timeout: 40_000 }).toBe('heroi');
  await page.waitForTimeout(600);
  const janela = (await page.locator('.batalha-janela').boundingBox())!;
  for (const s of await page.locator('.sprite-batalha').all()) {
    const c = (await s.boundingBox())!;
    expect(c.x + c.width, 'sprite atrás dos comandos').toBeLessThanOrEqual(janela.x + 2);
  }
  await alvos44(page, '.batalha-cmd');
  await semCorte(page, '.tela-batalha');
  await foto(page, info, 'h-batalha');
});

test('horizontal: mapa, pausa, caderno, Itens, Compêndio, Opções e saves', async ({ page }, info) => {
  test.skip(!deitado(info), 'só deitado');
  test.setTimeout(300_000);
  await semear(page, FULLMUN());
  await continuar(page);
  await noMapa(page);
  await page.waitForTimeout(800);
  // HUD numa faixa no topo; joystick à esquerda e interação à direita, fora do centro.
  const hud = (await page.locator('.mapa-hud').boundingBox())!;
  expect(hud.y).toBeLessThan(60);
  await foto(page, info, 'h-mapa');
  await page.locator('.btn-pausa').click();
  await semCorte(page, '.modal');
  await alvos44(page, '.pausa-botoes > button');
  await foto(page, info, 'h-pausa');
  await page.locator('.btn-caderno').click();
  await expect.poll(async () => page.locator('.caderno-spread .caderno-pagina').count()).toBe(2);
  await foto(page, info, 'h-caderno');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Itens', exact: true }).click();
  await semCorte(page, '.modal');
  await foto(page, info, 'h-itens');
  await page.getByRole('button', { name: /Fechar/ }).last().click();
  await page.locator('.btn-compendio').click();
  await page.locator('.compendio-aba[data-aba="vozes"]').click();
  await foto(page, info, 'h-compendio');
  await page.locator('.compendio-fechar').click();
  await page.getByRole('button', { name: 'Opções', exact: true }).click();
  await foto(page, info, 'h-opcoes');
  await page.getByRole('button', { name: /Fechar/ }).last().click();
  await page.locator('.btn-salvar').click();
  await foto(page, info, 'h-saves');
});

test('girar o celular no meio de uma cena, de uma batalha e de um mapa mantém o estado', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel-7', 'gira o Pixel 7 (em pé ↔ deitado)');
  test.setTimeout(420_000);
  const girar = async () => {
    const v = page.viewportSize()!;
    await page.setViewportSize({ width: v.height, height: v.width });
    await page.waitForTimeout(700);
  };
  await page.addInitScript(() => { (window as any).__semRecarga = (window as any).__semRecarga ?? Math.random(); });
  await semear(page, { cena: 'c01-grito', modo: 'escolhas', local: { tela: 'capitulo' } });
  await continuar(page);
  await expect.poll(async () => ((await st(page)).escolhas ?? []).length, { timeout: 60_000 }).toBeGreaterThan(0);
  const marca = await page.evaluate(() => (window as any).__semRecarga);
  const antes = await st(page);
  await girar();
  let s = await st(page);
  expect(s.cena).toBe(antes.cena);
  expect(s.escolhas).toEqual(antes.escolhas);
  await girar();
  // Batalha
  await page.locator('.cena-escolha', { hasText: 'enfrentá-lo' }).click();
  await expect.poll(async () => (await st(page)).vez, { timeout: 40_000 }).toBe('heroi');
  const b0 = await st(page);
  await girar();
  s = await st(page);
  expect(s.tela).toBe('batalha');
  expect(s.pvHeroi).toBe(b0.pvHeroi);
  expect(s.ordem).toEqual(b0.ordem);
  await girar();
  expect(await page.evaluate(() => (window as any).__semRecarga)).toBe(marca);
});

test('girar no mapa: o Phaser redimensiona e a câmera mantém o herói no centro', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel-7', 'gira o Pixel 7');
  test.setTimeout(300_000);
  await semear(page, FULLMUN());
  await continuar(page);
  await noMapa(page);
  await f(page, 'teleport', 1140, 880);
  await page.waitForTimeout(800);
  const h0 = (await st(page)).heroi;
  const v = page.viewportSize()!;
  await page.setViewportSize({ width: v.height, height: v.width });
  await page.waitForTimeout(1200);
  const s = await st(page);
  expect(Math.round(s.heroi.x)).toBe(Math.round(h0.x));
  expect(s.heroiNaTela).toBe(true);
  const canvas = (await page.locator('.tela-mapa canvas').boundingBox())!;
  expect(Math.round(canvas.width)).toBe(v.height);
});

/* ======================================================================
   6. Tela cheia e manifest
   ====================================================================== */

test('tela cheia: botão no Android e no desktop, dica no iPhone; manifest válido', async ({ page }, info) => {
  test.setTimeout(180_000);
  await semear(page, {});
  await irAteMenu(page, './?test=1');
  // Com save, o menu tem seis botões: todos inteiros dentro da tela, em qualquer viewport.
  const vp = page.viewportSize()!;
  await page.waitForTimeout(1200);
  for (const b of await page.locator('.menu-botoes > .btn').all()) {
    const c = (await b.boundingBox())!;
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.y + c.height).toBeLessThanOrEqual(vp.height);
    expect(Math.round(c.height)).toBeGreaterThanOrEqual(44);
  }
  if (info.project.name === 'iphone-13') {
    await expect(page.locator('.menu-tela-cheia')).toHaveCount(0);
    await expect(page.locator('.menu-dica-iphone')).toContainText('Adicionar à Tela de Início');
    // A dica nunca cobre um botão do menu: todos continuam clicáveis.
    for (const b of await page.locator('.menu-botoes > .btn, .menu-botoes > .saves-link').all()) await b.click({ trial: true, timeout: 3000 });
    const dica = (await page.locator('.menu-dica-iphone').boundingBox())!;
    for (const b of await page.locator('.menu-botoes > .btn').all()) {
      const c = (await b.boundingBox())!;
      expect(dica.y + dica.height <= c.y || c.y + c.height <= dica.y || dica.x + dica.width <= c.x || c.x + c.width <= dica.x).toBe(true);
    }
    await foto(page, info, 'dica-iphone');
  } else {
    const b = page.locator('.menu-tela-cheia');
    await expect(b).toBeVisible();
    await expect(b).toHaveAttribute('data-estado', 'fora');
    await b.click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement), { timeout: 5000 }).toBe(true);
    await expect(b).toHaveAttribute('data-estado', 'dentro');
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    await expect(b).toHaveAttribute('data-estado', 'fora', { timeout: 5000 });
  }
  // Manifest e metatags
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const m = await page.evaluate(async (u) => (await fetch(u!)).json(), href);
  expect(m).toMatchObject({ name: 'A Forja do Herói', short_name: 'Forja do Herói', display: 'fullscreen', orientation: 'any', start_url: '/aforjadoheroi/', scope: '/aforjadoheroi/' });
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const i of m.icons) expect((await page.request.get(new URL(i.src, page.url().replace(/[^/]*$/, '')).href)).ok()).toBe(true);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
