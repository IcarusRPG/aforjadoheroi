import { expect, test } from '@playwright/test';
import RETRATOS from '../src/data/retratos.json' with { type: 'json' };
import { ateEscolhas, ateFala, continuar, f, foto, naCena, semear, st, umAparelho } from './fase6-ajuda';

/* Fase 6: expressões do herói e bustos de frente um para o outro. */

test('retratos.json: os 40 bustos do herói (8 × 5) olham para a esquerda e os NPCs para a direita', () => {
  const b = (RETRATOS as any).bustos as Record<string, { olhaPara: string }>;
  const herois = Object.keys(b).filter((k) => k.startsWith('heroi-'));
  expect(herois.length).toBe(40);
  for (const k of herois) expect(b[k].olhaPara).toBe('esquerda');
  for (const k of Object.keys(b).filter((x) => x.startsWith('npc-'))) expect(b[k].olhaPara).toBe('direita');
});

test('expressões: choque na mão de Artho, raiva no "Eu vou lutar!", e o NPC à esquerda de frente para o herói à direita', async ({ page }, info) => {
  test.setTimeout(180_000);
  await semear(page, { cena: 'c1-01', modo: 'falas' });
  await continuar(page);
  await naCena(page, 'c1-01');
  await ateFala(page, 'Não! Para dentro! Agora!');
  await expect.poll(async () => (await st(page)).bustoHeroi).toMatchObject({ visivel: true, expressao: 'choque' });
  // NPC à esquerda, herói à direita; nenhum espelhado (os dois já olham um para o outro).
  const npc = await page.locator('.cena-busto').boundingBox();
  const heroi = await page.locator('.cena-busto-heroi').boundingBox();
  expect(npc && heroi).toBeTruthy();
  expect(npc!.x + npc!.width / 2).toBeLessThan(heroi!.x + heroi!.width / 2);
  await expect(page.locator('.cena-busto.espelhado, .cena-busto-heroi.espelhado')).toHaveCount(0);
  if (umAparelho(info)) await foto(page, info, 'bustos-frente-a-frente');
  // "Eu vou lutar! A Nyme…": raiva.
  for (let i = 0; i < 20 && (await st(page)).cena !== 'c1-02'; i++) {
    const seguir = page.locator('.cena-seguir:visible');
    if (await seguir.count()) await seguir.first().click().catch(() => undefined);
    else await f(page, 'avancar');
    await page.waitForTimeout(300);
  }
  await naCena(page, 'c1-02');
  await ateEscolhas(page);
  await page.locator('.cena-escolha').nth(1).click();
  await ateFala(page, 'Eu vou lutar! A Nyme…');
  await expect.poll(async () => (await st(page)).bustoHeroi).toMatchObject({ visivel: true, expressao: 'raiva' });
});
