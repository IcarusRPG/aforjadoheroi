import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/** Desliga o modo turbo (src/core/turbo.ts) neste teste: texto digitado, dado girando e fades normais.
 *  Para os testes que medem a própria animação. Chamar antes de abrir o jogo. */
export async function devagar(page: Page): Promise<void> {
  await page.addInitScript(() => { (window as { __fdgLento?: boolean }).__fdgLento = true; });
}

/** Do carregamento até o menu: toca em "começar" e pula a abertura assim que der. */
export async function irAteMenu(page: Page, caminho = './'): Promise<void> {
  await page.goto(caminho);
  const comecar = page.locator('.loading-comecar');
  await expect(comecar).toBeVisible({ timeout: 90_000 });
  await comecar.click();
  const menu = page.locator('.tela-menu');
  for (let i = 0; i < 80 && !(await menu.isVisible()); i++) {
    // O "pular" só vale depois de 5 s de vídeo; se o vídeo falhar, o jogo já vai ao menu.
    if (await page.locator('.dica-pular.visivel').isVisible()) await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  await expect(menu).toBeVisible();
}

/** "Novo Jogo" e a pergunta do tutorial (aparece só na primeira vez): "Não" por padrão. */
export async function novoJogo(page: Page, dicas = false): Promise<void> {
  await page.getByRole('button', { name: 'Novo Jogo' }).click();
  const pergunta = page.locator('.pergunta-tutorial');
  await expect(pergunta.or(page.locator('.tela-criacao'))).toBeVisible({ timeout: 10_000 });
  if (await pergunta.isVisible()) await page.locator(dicas ? '.tutorial-sim' : '.tutorial-nao').click();
}

export const avancar = (page: Page): Locator => page.locator('.criacao-rodape .btn-principal');

/** O elemento está inteiro dentro do cartão do passo (não vazou para fora nem ficou escondido). */
export async function dentroDoCartao(page: Page, alvo: Locator): Promise<void> {
  await expect(alvo).toBeVisible();
  const cartao = await page.locator('.criacao-conteudo').boundingBox();
  await alvo.scrollIntoViewIfNeeded();
  const caixa = await alvo.boundingBox();
  expect(cartao && caixa).toBeTruthy();
  expect(caixa!.x).toBeGreaterThanOrEqual(cartao!.x - 1);
  expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(cartao!.x + cartao!.width + 1);
}

/** O cartão do passo não está vazio (tem conteúdo de verdade, visível). */
export async function cartaoComConteudo(page: Page): Promise<void> {
  const secao = page.locator('.criacao-conteudo > section');
  await expect(secao).toBeVisible();
  const caixa = await secao.boundingBox();
  expect(caixa!.height).toBeGreaterThan(60);
}

/** Avançar e Voltar alcançáveis (dentro da tela e com 44 px de altura). */
export async function rodapeAlcancavel(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  for (const b of await page.locator('.criacao-rodape .btn').all()) {
    if (!(await b.isVisible())) continue;
    const c = (await b.boundingBox())!;
    expect(c.y + c.height).toBeLessThanOrEqual(vp.height + 1);
    expect(c.height).toBeGreaterThanOrEqual(44);
  }
}

export async function foto(page: Page, info: TestInfo, nome: string): Promise<void> {
  await page.waitForTimeout(450); // termina a animação de entrada do passo
  await page.screenshot({ path: `tests/screenshots/${info.project.name}-${nome}.png` });
}

/** Tela estreita (abaixo de 480 px): as fórmulas de PV/PM usam abreviações ("12 + CON"). */
export const telaEstreita = (page: Page): boolean => page.viewportSize()!.width < 480;

/**
 * Rola até o fim do passo e confere que o último elemento (o fim do cartão e, no celular em pé, o painel de
 * resumo) fica visível e acima da barra fixa de Voltar e Avançar.
 */
export async function fimDoPassoVisivel(page: Page): Promise<void> {
  // Espera alguma rolagem suave em andamento (ao escolher a classe, o detalhe rola para a vista) e vai ao fim.
  await page.waitForTimeout(700);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      for (const s of ['.criacao-corpo', '.criacao-conteudo']) {
        const el = document.querySelector(s);
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      }
    });
    await page.waitForTimeout(250);
  }
  const rodape = (await page.locator('.criacao-rodape').boundingBox())!;
  const ultimos = [page.locator('.criacao-conteudo > section > :last-child')];
  const empilhado = await page.evaluate(() => getComputedStyle(document.querySelector('.criacao-corpo')!).display === 'flex');
  if (empilhado) ultimos.push(page.locator('.criacao-painel'));
  for (const u of ultimos) {
    await expect(u).toBeInViewport();
    const c = (await u.boundingBox())!;
    expect(c.y + c.height, 'último elemento acima da barra fixa').toBeLessThanOrEqual(rodape.y + 1);
  }
}

/** Os quadros de PV e PM não vazam: texto dentro do quadro, fonte de texto corrido (não a de títulos). */
export async function quadrosPvPmNaoVazam(page: Page): Promise<void> {
  const quadros = page.locator('.pv-pm-item');
  await expect(quadros.first()).toBeVisible();
  for (const q of await quadros.all()) {
    await q.scrollIntoViewIfNeeded();
    const medidas = await q.evaluate((el) => ({
      sobra: el.scrollWidth - el.clientWidth,
      fonte: getComputedStyle(el.querySelector('.pv-pm-valor')!).fontFamily,
    }));
    expect(medidas.sobra, 'texto vazando do quadro').toBeLessThanOrEqual(1);
    expect(medidas.fonte).not.toContain('Cinzel');
    const caixa = (await q.boundingBox())!;
    for (const v of await q.locator('.pv-pm-valor, .pv-pm-fase-titulo').all()) {
      const b = (await v.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(caixa.x - 1);
      expect(b.x + b.width).toBeLessThanOrEqual(caixa.x + caixa.width + 1);
    }
  }
}
