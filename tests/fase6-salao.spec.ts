import { expect, test, type Page } from '@playwright/test';
import MAPA from '../src/data/mapas/salao-forja.json' with { type: 'json' };
import TEXTOS from '../src/data/textos.json' with { type: 'json' };
import { ateEscolhas, cenaLateral, continuar, f, fecharFala, foto, salvoAuto, semear, st } from './fase6-ajuda';

/* Fase 6: Ato I, Parte 6 · O Salão e a Forja. */

const VOZES = (TEXTOS as any).sonho.vozes as Record<string, { mensagem: string }>;
const fotoGrande = (nome: string) => nome === 'pixel-7' || nome === 'paisagem-844x390';
const interacao = (id: string) => (MAPA as any).interacoes.find((i: any) => i.id === id);

async function noSalao(page: Page, extra: Record<string, unknown> = {}, heroi: Record<string, unknown> = {}) {
  await semear(page, { parte: 6, cena: 'inicio', local: { tela: 'mapa', mapa: 'salao-forja' }, pvAtual: 5, contadores: { flechas: 3 }, ...extra }, { heroi });
  await continuar(page);
  await expect.poll(async () => (await st(page)).tela, { timeout: 90_000 }).toBe('salao');
}
async function semFala(page: Page, timeout = 30_000) {
  await expect.poll(async () => { const s = await st(page); return !!s.pronto && !s.cena; }, { timeout }).toBe(true);
}
async function ouvirAsVozes(page: Page) {
  await cenaLateral(page, 'f-entrada', 60_000);
  await fecharFala(page);
  await semFala(page);
  const fp = (MAPA as any).pontos.frentePedestal;
  await f(page, 'andarAte', fp.x, fp.y);
  await expect.poll(async () => ((await st(page)).baloes as unknown[]).length, { timeout: 20_000 }).toBe(7);
}
/** Do juramento até o fim da Forja (com a contagem de poderes da classe). */
async function juramento(page: Page) {
  const forja = page.locator('.forja');
  for (let i = 0; i < 3; i++) {
    await expect(forja.locator('.forja-voto')).toHaveCount(1, { timeout: 30_000 });
    await forja.getByRole('button', { name: 'Eu juro' }).click();
    await page.waitForTimeout(250);
  }
  await expect(forja.locator('.forja-depois')).toBeVisible();
  await expect(forja).toContainText('Eu juro… mas antes de tudo, preciso salvar meus amigos.');
  await expect(forja).toContainText('Então vá. E leve a minha luz.');
  await forja.getByRole('button', { name: 'Continuar' }).click();
}

test('Parte 6: as 7 vozes aparecem ao lado das estátuas certas (Justar e Ardor trocados em relação ao sonho) e falam juntas', async ({ page }, info) => {
  test.setTimeout(240_000);
  await noSalao(page);
  await expect(page.locator('.cartao-tela.cartao-parte')).toHaveText('Parte 6 · O Salão e a Forja', { timeout: 30_000 });
  await cenaLateral(page, 'f-entrada', 60_000);
  await expect(page.locator('.palco-cena .cena-fundo.visivel')).toHaveAttribute('data-cena', 'cena-salao-forja');
  await fecharFala(page);
  await semFala(page);
  expect((await st(page)).coluna.visivel).toBe(true);
  if (fotoGrande(info.project.name)) await foto(page, info, 'salao-coluna');
  const fp = (MAPA as any).pontos.frentePedestal;
  await f(page, 'andarAte', fp.x, fp.y);
  await expect.poll(async () => ((await st(page)).baloes as unknown[]).length, { timeout: 20_000 }).toBe(7);
  await page.waitForTimeout(500);
  if (fotoGrande(info.project.name)) await foto(page, info, 'sete-vozes');
  const s = await st(page);
  for (const b of s.baloes as { deus: string; texto: string; x: number; y: number }[]) {
    // A frase do sonho daquele deus, ao lado da estátua dele no Salão.
    expect(b.texto).toBe(VOZES[b.deus].mensagem);
    const e = s.estatuasTela[b.deus];
    expect(Math.abs(b.x - e.x)).toBeLessThan(40);
  }
  // Ardor no alto à direita; Justar à direita (mais baixo que o Ardor).
  expect(s.estatuasTela.ardor.y).toBeLessThan(s.estatuasTela.justar.y);
  expect(s.estatuasTela.solem.y).toBeLessThan(s.estatuasTela.justar.y);
  await cenaLateral(page, 'f-vozes', 20_000);
  await expect(page.locator('.cena-caixa.estilo-vozes')).toContainText('Todos os seres são importantes', { timeout: 20_000 });
  await fecharFala(page);
});

test('Parte 6: a escolha pela estátua ("Ouvir as outras" volta), a divindade se apresenta, juramento com ecos, 1 poder, relíquia com a Tolerância, PV e PM da classe, "Erga-se" e o Fim do Ato I', async ({ page }, info) => {
  test.setTimeout(300_000);
  await noSalao(page, { flags: ['fim_capitulo_02', 'nyme_caiu', 'levantou', 'caminho_tolerancia', 'coragem_escuro', 'atravessou_solem', 'desceu_alcapao'] });
  await ouvirAsVozes(page);
  await cenaLateral(page, 'f-vozes', 20_000);
  await fecharFala(page);
  await semFala(page);
  // A estátua de Irae: "Ouvir as outras" não escolhe.
  const irae = interacao('irae');
  await f(page, 'andarAte', irae.x, irae.y);
  await expect.poll(async () => (await st(page)).proximo).toBe('irae');
  await f(page, 'interagir');
  await cenaLateral(page, 'f-voz-irae');
  await expect(page.locator('.palco-cena .cena-texto')).toHaveText('Sua fúria não é fraqueza. Deixe-a ser a tempestade que protege.', { timeout: 20_000 });
  await ateEscolhas(page);
  expect((await st(page)).escolhas).toEqual(['Seguir esta voz', 'Ouvir as outras']);
  await page.locator('.cena-escolha', { hasText: 'Ouvir as outras' }).click();
  await semFala(page);
  expect((await st(page)).divindade).toBeNull();
  // De novo, e agora seguir.
  await f(page, 'interagir');
  await cenaLateral(page, 'f-voz-irae');
  await ateEscolhas(page);
  expect((await st(page)).escolhas).toEqual(['Seguir esta voz', 'Ouvir as outras']);
  await page.locator('.cena-escolha', { hasText: 'Seguir esta voz' }).click();
  // A divindade se apresenta.
  const apres = page.locator('.forja-divindade');
  await expect(apres).toBeVisible({ timeout: 20_000 });
  await expect(apres.locator('.forja-divindade-nome')).toHaveText('Irae');
  await expect(apres.locator('.forja-divindade-grupo')).toHaveText(/Alfar|Baldur/);
  expect((await st(page)).coluna.cor).toBe('#b46bff');
  await cenaLateral(page, 'f-apresentacao', 20_000);
  await expect(page.locator('.palco-cena .cena-texto')).toHaveText('Eu sou Irae. E você, Thaelion, foi ouvido.', { timeout: 20_000 });
  if (fotoGrande(info.project.name)) await foto(page, info, 'divindade');
  await fecharFala(page);
  // Juramento com os ecos do túnel (com a tolerância).
  const forja = page.locator('.forja');
  await expect(forja.locator('.forja-voto')).toBeVisible({ timeout: 20_000 });
  await expect(forja.locator('.forja-eco')).toHaveText('Você já pisou nesses caminhos.');
  await forja.getByRole('button', { name: 'Eu juro' }).click();
  await expect(forja.locator('.forja-eco')).toHaveText('Você atravessou o sol.');
  await forja.getByRole('button', { name: 'Eu juro' }).click();
  await expect(forja.locator('.forja-eco')).toHaveText('Você seguiu em frente pelos que ficaram lá em cima.');
  await forja.getByRole('button', { name: 'Eu juro' }).click();
  await expect(forja).toContainText('Então vá. E leve a minha luz.');
  await forja.getByRole('button', { name: 'Continuar' }).click();
  // Poderes concedidos: 1 (devoto, não Paladino).
  await expect(forja.locator('.forja-titulo')).toHaveText('Escolha 1 poder');
  await expect(forja.locator('.forja-poder')).toHaveCount(3);
  const receber = forja.getByRole('button', { name: 'Receber' });
  await expect(receber).toBeDisabled();
  await forja.locator('.forja-poder').first().click();
  await expect(receber).toBeEnabled();
  await receber.click();
  expect(((await st(page)).poderes as string[]).length).toBe(1);
  // A relíquia da classe, com a pedra da Tolerância acesa.
  await expect(forja.locator('.forja-reliquia-img')).toHaveAttribute('data-classe', 'arcanista');
  await expect(forja.locator('.forja-pedra')).toHaveCount(4);
  await expect(forja.locator('.forja-pedra.brilha')).toHaveAttribute('data-pedra', 'tolerancia');
  await forja.getByRole('button', { name: 'Continuar' }).click();
  // Cura e classe: os números chegam aos da classe.
  const s0 = await st(page);
  await expect(forja.locator('[data-num="pv"]')).toHaveText(`${s0.pvMaxForja}/${s0.pvMaxForja}`, { timeout: 10_000 });
  await expect(forja.locator('[data-num="pm"]')).toHaveText(String(s0.pmMaxForja));
  await forja.getByRole('button', { name: 'Continuar' }).click();
  expect((await st(page)).pv).toBe(s0.pvMaxForja);
  // Revelação.
  await expect(forja.locator('.forja-erga')).toHaveText('Erga-se, Arcanista (Mago) de Irae');
  if (fotoGrande(info.project.name)) await foto(page, info, 'erga-se');
  const s = await st(page);
  expect(s.caderno.respondidas).toEqual(expect.arrayContaining(['vozes', 'tunel']));
  expect(s.caderno.anotacoes).toContain('forja');
  await forja.getByRole('button', { name: 'Continuar' }).click();
  // Fim do Ato I.
  const fim = page.locator('.tela-fim-capitulo');
  await expect(fim).toBeVisible({ timeout: 20_000 });
  await expect(fim.locator('.fim-rotulo')).toHaveText('Fim do Ato I');
  await expect(fim.locator('.fim-titulo')).toHaveText('Provação Sob a Luz');
  const linhas = await fim.locator('.fim-resumo li').allInnerTexts();
  expect(linhas.length).toBeLessThanOrEqual(6);
  expect(linhas).toEqual(expect.arrayContaining(['Você achou o caminho entre os símbolos dos outros deuses.', '3 flechas te acertaram no caminho.', 'Você caiu. E se levantou.', 'No escuro total, você não parou.', 'Você seguiu a voz de Irae.', 'Você se ergueu como Arcanista (Mago).']));
  await page.waitForTimeout(1200);
  if (fotoGrande(info.project.name)) await foto(page, info, 'fim-ato1');
  await expect.poll(async () => (await salvoAuto(page))?.jogo?.campanha?.ato, { timeout: 10_000 }).toBe(2);
  const salvo = await salvoAuto(page);
  expect(salvo.jogo.campanha).toMatchObject({ ato: 2, parte: 1, cena: 'inicio' });
  await fim.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.tela-embreve .embreve-capitulo')).toHaveText('Ato II', { timeout: 20_000 });
  await expect(page.locator('.tela-embreve .embreve-breve')).toHaveText('Em breve');
});

test('Parte 6: a escolha pela lista do menu; o Paladino recebe 2 poderes; sem a tolerância, o eco muda e a pedra não brilha; o Compêndio ganha os nomes', async ({ page }) => {
  test.setTimeout(300_000);
  await noSalao(page, {}, { classe: 'paladino' });
  await ouvirAsVozes(page);
  await cenaLateral(page, 'f-vozes', 20_000);
  await fecharFala(page);
  await semFala(page);
  await page.locator('.btn-menu').click();
  await page.getByRole('button', { name: 'Escolher a voz em lista' }).click();
  const itens = page.locator('.forja-lista-item');
  await expect(itens).toHaveCount(7);
  await expect(page.locator('.forja-lista-item[data-deus="solem"]')).toContainText('Onde houver escuridão, leve a luz.');
  await page.locator('.forja-lista-item[data-deus="solem"]').click();
  await expect(page.locator('.forja-divindade-nome')).toHaveText('Sólem', { timeout: 20_000 });
  await cenaLateral(page, 'f-apresentacao', 20_000);
  await fecharFala(page);
  const forja = page.locator('.forja');
  await expect(forja.locator('.forja-eco')).toHaveText('Você aprendeu, mesmo ferido.', { timeout: 20_000 });
  for (let i = 0; i < 3; i++) await forja.getByRole('button', { name: 'Eu juro' }).click();
  await forja.getByRole('button', { name: 'Continuar' }).click();
  await expect(forja.locator('.forja-titulo')).toHaveText('Escolha 2 poderes');
  const receber = forja.getByRole('button', { name: 'Receber' });
  await forja.locator('.forja-poder').nth(0).click();
  await expect(receber).toBeDisabled();
  await forja.locator('.forja-poder').nth(1).click();
  await expect(receber).toBeEnabled();
  await receber.click();
  expect(((await st(page)).poderes as string[]).length).toBe(2);
  await expect(forja.locator('.forja-reliquia-img')).toHaveAttribute('data-classe', 'paladino');
  await expect(forja.locator('.forja-pedra.brilha')).toHaveCount(0);
  await forja.getByRole('button', { name: 'Continuar' }).click();
  await forja.getByRole('button', { name: 'Continuar' }).click({ timeout: 15_000 });
  await expect(forja.locator('.forja-erga')).toHaveText('Erga-se, Paladino de Sólem');
  // O Compêndio → Vozes: cada frase com o nome do seu deus.
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('.forja .btn-principal')?.blur());
  const s = await st(page);
  expect(s.flags).toContain('escolheu_voz');
  expect(s.divindade).toBe('solem');
});

for (const classe of ['guerreiro', 'ladino', 'monge']) {
  test(`Parte 6: a relíquia do ${classe}`, async ({ page }) => {
    test.setTimeout(200_000);
    // Retomando com a voz já escolhida: a Forja começa no juramento.
    await noSalao(page, { divindade: 'mentis', flags: ['fim_capitulo_02', 'nyme_caiu', 'escolheu_voz'], coletados: ['salao:entrada', 'salao:vozes'], cena: null }, { classe });
    await juramento(page);
    const forja = page.locator('.forja');
    await forja.locator('.forja-poder').first().click();
    await forja.getByRole('button', { name: 'Receber' }).click();
    await expect(forja.locator('.forja-reliquia-img')).toHaveAttribute('data-classe', classe);
  });
}
