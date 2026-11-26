import { expect, test } from '@playwright/test';

/* Fase 6: Prólogo + atos e o Ato I inteiro (Partes 1 a 6). */

import {
  ateEscolhas, ateFala, continuar, efeitosNomes, f, falaCompleta, foto, naCena, salvoAuto, semear, st, textoFala, umAparelho,
} from './fase6-ajuda';

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
