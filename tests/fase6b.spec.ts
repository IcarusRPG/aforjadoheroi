import { expect, test } from '@playwright/test';
import DICAS from '../src/data/tutorial.json' with { type: 'json' };
import { cenaLateral, f, fecharFala, lat, livre, naLateral, st } from './fase6-ajuda';

/* Fase 6B: o botão PULAR no PC (mouse, sem toque) e a dica do pulo no primeiro trecho lateral. */

test.describe('PC (mouse e teclado)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('o botão PULAR aparece no PC, clicável, com "Espaço" embaixo; a interação mostra "E"', async ({ page }, info) => {
    test.skip(info.project.name !== 'pixel-7', 'um navegador de PC basta');
    test.setTimeout(180_000);
    await naLateral(page, 4, { cena: null, local: { tela: 'lateral', x: 6880, y: 700 }, coletados: ['lateral:p4:chegada'] });
    await livre(page, 60_000);
    const btn = page.locator('.btn-pular');
    await expect(btn).toBeVisible();
    await expect(btn.locator('.btn-pular-tecla')).toHaveText('Espaço');
    const caixa = (await btn.boundingBox())!;
    expect(caixa.width).toBeGreaterThanOrEqual(44);
    // O botão de interação (perto da Audição) mostra a tecla E e fica abaixo do PULAR.
    await expect.poll(async () => (await st(page)).interacao).toBe(true);
    await expect(page.locator('.btn-interagir-tecla')).toHaveText('E');
    const inter = (await page.locator('.btn-interagir').boundingBox())!;
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(inter.y + 2);
    // Clique (mouse) pula.
    await btn.click();
    await expect.poll(async () => (await lat(page)).z, { timeout: 2000, intervals: [30] }).toBeGreaterThan(40);
    await page.screenshot({ path: 'tests/screenshots/desktop-fase6b-pular.png' });
  });
});

test('primeiro trecho lateral: a dica "Pule com o botão PULAR (ou Espaço)." com as dicas ligadas', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel-7' && info.project.name !== 'paisagem-844x390', 'dois aparelhos bastam');
  test.setTimeout(180_000);
  const vistas = (DICAS as { id: string }[]).map((d) => d.id).filter((id) => id !== 'pular');
  await naLateral(page, 2, {}, { config: { tutorial: true, dicasVistas: vistas } });
  await cenaLateral(page, 't-inicio', 40_000);
  await fecharFala(page);
  await expect(page.getByText('Pule com o botão')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Pule com o botão')).toContainText('Espaço');
  expect(await f(page, 'state').then(() => true)).toBe(true);
});
