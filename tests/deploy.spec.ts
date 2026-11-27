import { expect, test } from '@playwright/test';
import { irAteMenu } from './ajudantes';

/* Endereço novo (game.icarusrpg.com.br/aforjadoheroi/): base do Vite, rotas por hash, 404.html e cópia de segurança sem save. */

test('tudo carrega sob /aforjadoheroi/ (nenhum pedido fora do base nem com erro)', { tag: ['@deploy'] }, async ({ page, baseURL }) => {
  const base = new URL(baseURL!).pathname;
  const fora: string[] = [];
  const falhas: string[] = [];
  page.on('request', (r) => {
    if (!/^https?:/.test(r.url())) return; // blob: e data: são da memória, não pedidos de rede
    const u = new URL(r.url());
    if (u.origin === new URL(baseURL!).origin && !u.pathname.startsWith(base)) fora.push(u.pathname);
  });
  page.on('response', (r) => { if (r.status() >= 400) falhas.push(`${r.status()} ${r.url()}`); });
  await irAteMenu(page, './?test=1');
  expect(base).toBe('/aforjadoheroi/');
  expect(fora).toEqual([]);
  expect(falhas).toEqual([]);
});

test('rotas: #/gameover, ?tela=gameover e o caminho /gameover abrem a mesma tela, também ao recarregar', { tag: ['@deploy'] }, async ({ page }) => {
  for (const caminho of ['./#/gameover', './?tela=gameover', './gameover']) {
    await page.goto(caminho);
    await page.locator('.loading-comecar').click({ timeout: 90_000 });
    await expect(page.locator('.tela-game-over')).toBeVisible({ timeout: 20_000 });
  }
  await page.reload();
  await page.locator('.loading-comecar').click({ timeout: 90_000 });
  await expect(page.locator('.tela-game-over')).toBeVisible({ timeout: 20_000 });
});

test('404.html: um caminho sem hash vira a rota com hash, mantendo a query', { tag: ['@deploy'] }, async ({ page, baseURL }) => {
  await page.goto('./404.html?x=1');
  await expect(page).toHaveURL(`${baseURL}?x=1#/404.html`);
  await page.goto('./404.html#/gameover');
  await expect(page).toHaveURL(`${baseURL}#/gameover`);
  await page.locator('.loading-comecar').click({ timeout: 90_000 });
  await expect(page.locator('.tela-game-over')).toBeVisible({ timeout: 20_000 });
});

test('sem save, o menu oferece só o link discreto de importar saves (sem aviso de endereço)', { tag: ['@deploy'] }, async ({ page }) => {
  await irAteMenu(page, './?test=1');
  await expect(page.locator('.menu-importar')).toBeVisible();
  await expect(page.locator('.menu-aviso-endereco')).toHaveCount(0);
  await expect(page.locator('.btn-continuar')).toHaveCount(0);
});
