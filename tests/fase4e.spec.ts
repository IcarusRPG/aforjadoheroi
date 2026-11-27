import { expect, test, type Page } from '@playwright/test';
import { irAteMenu } from './ajudantes';

/* Fase 4E: Caderno de estudos, panteão e lore da biblioteca. */

type Estado = Record<string, any>;
const HEROI = {
  nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones',
  atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
  atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
  classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
};
const SEM_DICAS = { tutorial: false, ajudaFullmunVista: true };
const SETE = ['abertura', 'solem', 'justar', 'ardor', 'expiria', 'eternus', 'mentis', 'irae'];
const OUTROS = ['aletris', 'amorina', 'bellica', 'etheria', 'floressa', 'logos', 'nocturna', 'odincia', 'draconara', 'fraudulus', 'insidia', 'paxus', 'valorus'];

function semear(page: Page, campanha: Record<string, unknown>, heroi: Record<string, unknown> = {}, versaoSave = 5) {
  return page.addInitScript((op) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1,
      versaoSave: op.versaoSave,
      config: { musica: 0.7, efeitos: 0.8, mudo: false, ...op.config },
      personagem: op.heroi,
      sonho: { concluido: true, ouvidas: ['solem', 'justar', 'irae'] },
      campanha: { capitulo: 1, cena: null, modo: 'falas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null, ...op.campanha },
    }));
  }, { campanha, config: SEM_DICAS, heroi: { ...HEROI, ...heroi }, versaoSave });
}
const st = (page: Page): Promise<Estado> => page.evaluate(() => (window as unknown as { __fdg?: { state(): Estado } }).__fdg?.state() ?? {});
const f = (page: Page, m: string, ...args: unknown[]) =>
  page.evaluate(([mm, aa]) => (window as unknown as { __fdg?: Record<string, (...x: unknown[]) => unknown> }).__fdg?.[mm as string]?.(...(aa as unknown[])), [m, args] as const);
const foto = (page: Page, projeto: string, nome: string) => page.screenshot({ path: `tests/screenshots/${projeto}-fase4e-${nome}.png` });

async function continuar(page: Page) {
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Continuar' }).click();
}
async function abrirPausa(page: Page) {
  await page.locator('.btn-pausa').click();
  await expect(page.locator('.btn-caderno')).toBeVisible();
}
/** Avança o caderno até a página `id` (ou até o fim). */
async function irParaPagina(page: Page, id: string) {
  for (let i = 0; i < 20; i++) {
    if (((await st(page)).caderno.tela?.paginas ?? []).includes(id)) return;
    const prox = page.locator('.caderno-proxima');
    if (await prox.isDisabled()) break;
    await prox.click();
    await page.waitForTimeout(120);
  }
  expect((await st(page)).caderno.tela?.paginas ?? []).toContain(id);
}
/** Todo o texto das páginas da aba atual (passando por todas). */
async function textoDaAba(page: Page): Promise<string> {
  let texto = '';
  while (await page.locator('.caderno-anterior').isEnabled()) await page.locator('.caderno-anterior').click();
  for (let i = 0; i < 20; i++) {
    texto += `${await page.locator('.caderno-spread').innerText()}\n`;
    const prox = page.locator('.caderno-proxima');
    if (await prox.isDisabled()) break;
    await prox.click();
  }
  return texto;
}

test('início do jogo: o caderno está nos Itens e no atalho do menu, com a abertura e os 7 deuses e nada da guerra', { tag: ['@caderno'] }, async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, { cena: 'c01-quarto', modo: 'escolhas', local: { tela: 'capitulo' } });
  await continuar(page);
  await expect.poll(async () => (await st(page)).caderno?.paginas ?? [], { timeout: 60_000 }).toEqual(SETE);
  const s = await st(page);
  for (const id of OUTROS) expect(s.caderno.paginas).not.toContain(id);
  // Itens → Caderno de estudos
  await abrirPausa(page);
  await page.getByRole('button', { name: 'Itens', exact: true }).click();
  await expect(page.locator('.item-linha[data-item="caderno"]')).toContainText('Caderno de estudos');
  await page.locator('.item-abrir-caderno').click();
  await expect(page.locator('.caderno')).toBeVisible();
  await page.locator('.caderno-fechar').click();
  await expect(page.locator('.caderno-fundo')).toHaveCount(0);
  await page.getByRole('button', { name: /Fechar/ }).last().click();
  // Atalho do menu: logo abaixo de Itens
  const ordem = await page.locator('.pausa-botoes > button').allInnerTexts();
  expect(ordem.indexOf('Caderno')).toBe(ordem.indexOf('Itens') + 1);
  await page.locator('.btn-caderno').click();
  await expect(page.locator('.caderno-pagina[data-pagina="abertura"]')).toBeVisible();
  await page.waitForTimeout(300);
  await foto(page, info.project.name, 'abertura');
  // Nenhuma página fala de Odincia, da Purificação, da cruzada ou do guerreiro divino.
  const texto = await textoDaAba(page);
  expect(texto).not.toMatch(/Odincia|Purifica|cruzada|guerreiro divino/i);
  for (const nome of ['Sólem', 'Justar', 'Ardor', 'Expiria', 'Eternus', 'Mentis', 'Irae']) expect(texto).toContain(nome);
  // Sólem
  await page.locator('.caderno-anterior').click({ trial: true }).catch(() => {});
  while (await page.locator('.caderno-anterior').isEnabled()) await page.locator('.caderno-anterior').click();
  await irParaPagina(page, 'solem');
  await expect(page.locator('.caderno-pagina[data-pagina="solem"] .selo-alfar')).toHaveText('ALFAR');
  await expect(page.locator('.caderno-pagina[data-pagina="solem"] .caderno-esboco img.pronta')).toBeVisible({ timeout: 15_000 });
  await foto(page, info.project.name, 'solem');
  // Anotações e Perguntas
  await page.locator('.caderno-aba[data-aba="anotacoes"]').click();
  await expect(page.locator('.caderno-anotacao[data-anotacao="sonho"]')).toContainText('Sete estátuas sem rosto');
  await expect(page.locator('.caderno-anotacao[data-anotacao="trinco"]')).toHaveCount(0);
  await foto(page, info.project.name, 'anotacoes');
  await page.locator('.caderno-aba[data-aba="perguntas"]').click();
  await expect(page.locator('.caderno-lista-perguntas li')).toHaveCount(3);
  await expect(page.locator('.caderno-lista-perguntas')).toContainText('De quem são as sete vozes do sonho?');
  await expect(page.locator('.caderno-marca').first()).toHaveText('◇');
  await foto(page, info.project.name, 'perguntas');
});

test('no quarto: "Olhar as anotações sobre os deuses" abre o caderno em "Alfars e Baldurs" e, ao fechar, volta à cena com a flag', { tag: ['@caderno'] }, async ({ page }) => {
  test.setTimeout(240_000);
  await semear(page, { cena: 'c01-quarto', modo: 'escolhas', local: { tela: 'capitulo' } });
  await continuar(page);
  await expect.poll(async () => (await st(page)).escolhas ?? [], { timeout: 60_000 }).toContain('Olhar as anotações sobre os deuses');
  await page.locator('.cena-escolha', { hasText: 'Olhar as anotações sobre os deuses' }).click();
  await expect(page.locator('.caderno-pagina[data-pagina="abertura"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.caderno-pagina[data-pagina="abertura"] .caderno-margem')).toContainText('Artho sempre muda de assunto');
  await page.keyboard.press('Escape');
  await expect(page.locator('.caderno-fundo')).toHaveCount(0);
  await expect.poll(async () => (await st(page)).flags, { timeout: 10_000 }).toContain('leu_anotacoes');
  await expect.poll(async () => (await st(page)).cena, { timeout: 15_000 }).toBe('c01-quarto');
  await expect.poll(async () => (await st(page)).escolhas ?? [], { timeout: 10_000 }).toContain('Sair de casa');
});

test('Nyashi: a página de Eternus ganha a linha extra (e só para Nyashi)', { tag: ['@caderno'] }, async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, { cena: 'c01-quarto', modo: 'escolhas', local: { tela: 'capitulo' } }, { raca: 'nyashi', genero: 'f', nome: 'Ilka' });
  await continuar(page);
  await expect.poll(async () => (await st(page)).caderno?.paginas?.length ?? 0, { timeout: 60_000 }).toBe(8);
  await abrirPausa(page);
  await page.locator('.btn-caderno').click();
  await irParaPagina(page, 'eternus');
  await expect(page.locator('.caderno-pagina[data-pagina="eternus"] .caderno-extra')).toHaveText('Meu povo veio dele. Às vezes sinto isso nos ossos.');
  await expect(page.locator('.caderno-pagina[data-pagina="eternus"] .selo-baldur')).toHaveText('BALDUR');
  await expect(page.locator('.caderno-pagina[data-pagina="eternus"] .caderno-esboco img.pronta')).toBeVisible({ timeout: 15_000 });
  await foto(page, info.project.name, 'eternus-nyashi');
  // Imagem em tela cheia (em cores) abre e fecha.
  await page.locator('.caderno-pagina[data-pagina="eternus"] .caderno-esboco').click();
  await expect(page.locator('.caderno-imagem-cheia img')).toBeVisible();
  expect(await page.locator('.caderno-imagem-cheia img').evaluate((e) => getComputedStyle(e).filter)).toBe('none');
  await page.locator('.caderno-imagem-fechar').click();
  await expect(page.locator('.caderno-imagem-cheia')).toHaveCount(0);
});

test('herói não Nyashi não vê a linha de Eternus; a anotação do trinco aparece só com pista_trinco', { tag: ['@caderno'] }, async ({ page }) => {
  test.setTimeout(240_000);
  await semear(page, { cena: 'c01-quarto', modo: 'escolhas', local: { tela: 'capitulo' } });
  await continuar(page);
  await expect.poll(async () => (await st(page)).caderno?.anotacoes ?? [], { timeout: 60_000 }).toEqual(['sonho']);
  await abrirPausa(page);
  await page.locator('.btn-caderno').click();
  await irParaPagina(page, 'eternus');
  await expect(page.locator('.caderno-extra')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await f(page, 'setFlag', 'pista_trinco');
  await page.evaluate(() => (window as any).__fdg.state());
  // A flag chega por uma cena no jogo; aqui, o caderno confere ao abrir.
  await page.locator('.btn-caderno').click();
  await page.locator('.caderno-aba[data-aba="anotacoes"]').click();
  await expect(page.locator('.caderno-anotacao[data-anotacao="trinco"]')).toContainText('O trinco do chiqueiro do Gerulf foi arrebentado');
  const s = await st(page);
  expect(s.caderno.perguntas).toContain('trinco');
});

test('biblioteca: os três livros com os textos novos liberam deuses, anotações e perguntas, com o aviso; Odincia sem imagem', { tag: ['@caderno'] }, async ({ page }, info) => {
  test.setTimeout(300_000);
  await semear(page, { capitulo: 2, cena: 'c02-artho', modo: 'escolhas', atraso: 1, flags: ['nyme_seguindo'], local: { tela: 'mapa', mapa: 'templo-biblioteca' } });
  await continuar(page);
  await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.pronto; }, { timeout: 120_000 }).toBe(true);
  const ler = async (obj: string, titulo: string, trecho: string) => {
    await f(page, 'interactWith', `obj:${obj}`);
    await expect(page.locator('.livro-titulo')).toHaveText(titulo, { timeout: 10_000 });
    await expect(page.locator('.livro-texto')).toContainText(trecho);
    await page.locator('.livro-fechar').click();
    await expect(page.locator('.livro')).toHaveCount(0);
  };
  await ler('livro-guerra', 'A Primeira Guerra Divina', 'Béllica, Odincia e Nocturna marcharam');
  await expect(page.locator('.livro-texto')).toHaveCount(0);
  await expect.poll(async () => (await st(page)).toasts, { timeout: 5000 }).toContain('Caderno atualizado');
  let s = await st(page);
  expect(s.caderno.paginas).toEqual(expect.arrayContaining(['bellica', 'odincia', 'nocturna']));
  expect(s.caderno.anotacoes).toContain('livro-guerra');
  expect(s.caderno.perguntas).toContain('paginas');
  expect(s.caderno.novidade).toBe(true);
  await ler('livro-alfars', 'Os Baldurs e seus povos', 'Draconara, a Senhora dos Dragões');
  await ler('livro-solem', 'Sólem, o Deus-Sol', 'barreira do Núcleo de Icarus');
  s = await st(page);
  expect(s.caderno.paginas).toContain('draconara');
  expect(s.caderno.anotacoes).toEqual(expect.arrayContaining(['livro-povos', 'livro-solem']));
  expect(s.caderno.perguntas).toContain('barreira');
  expect(s.toasts.filter((t: string) => t === 'Caderno atualizado').length).toBeGreaterThanOrEqual(3);
  // Ponto dourado no atalho; abrir tira a novidade.
  await page.locator('.btn-pausa').click();
  await expect(page.locator('.btn-caderno .ponto-novidade')).toBeVisible();
  await page.locator('.btn-caderno').click();
  await irParaPagina(page, 'odincia');
  await expect(page.locator('.caderno-pagina[data-pagina="odincia"] .caderno-moldura-vazia')).toContainText('?');
  await expect(page.locator('.caderno-pagina[data-pagina="odincia"] img')).toHaveCount(0);
  await foto(page, info.project.name, 'odincia');
  expect((await st(page)).caderno.novidade).toBe(false);
});

test('fim do Capítulo 02: a anotação final (sozinha) e a pergunta "Quem atacou Füllmun?"', { tag: ['@caderno'] }, async ({ page }) => {
  test.setTimeout(240_000);
  await semear(page, { capitulo: 2, cena: 't-alcapao-artho', modo: 'falas', flags: ['nyme_seguindo', 'leu_livro_guerra'], local: { tela: 'capitulo' } });
  await continuar(page);
  await expect.poll(async () => (await st(page)).flags ?? [], { timeout: 60_000 }).toContain('artho_alcapao');
  await f(page, 'goto', 'c02-tragedia');
  await expect.poll(async () => (await st(page)).flags ?? [], { timeout: 20_000 }).toContain('fim_capitulo_02');
  const s = await st(page);
  expect(s.caderno.anotacoes).toEqual(expect.arrayContaining(['alcapao', 'fim-cap02']));
  expect(s.caderno.perguntas).toContain('ataque');
  await abrirPausa(page);
  await page.locator('.btn-caderno').click();
  await page.locator('.caderno-aba[data-aba="anotacoes"]').click();
  for (let i = 0; i < 6 && !(await page.locator('.caderno-anotacao.sozinha').isVisible()); i++) await page.locator('.caderno-proxima').click();
  const sozinha = page.locator('.caderno-anotacao.sozinha');
  await expect(sozinha).toHaveText('Não consigo escrever sobre hoje.');
  await expect(sozinha.locator('.caderno-data')).toHaveCount(0);
  expect(await page.locator('.caderno-pagina').filter({ has: sozinha }).locator('.caderno-anotacao').count()).toBe(1);
  await page.locator('.caderno-aba[data-aba="perguntas"]').click();
  await expect(page.locator('.caderno-lista-perguntas')).toContainText('Quem atacou Füllmun?');
});

test('visual: no celular, deslizar troca de página; no desktop, duas páginas lado a lado', { tag: ['@layout', '@caderno'] }, async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, { cena: 'c01-quarto', modo: 'escolhas', local: { tela: 'capitulo' } });
  await continuar(page);
  await expect.poll(async () => (await st(page)).caderno?.paginas?.length ?? 0, { timeout: 60_000 }).toBe(8);
  await abrirPausa(page);
  await page.locator('.btn-caderno').click();
  const vp = page.viewportSize()!;
  const duas = vp.width >= 760;
  expect(await page.locator('.caderno-spread .caderno-pagina').count()).toBe(duas ? 2 : 1);
  const antes = (await st(page)).caderno.tela.paginas;
  const caixa = (await page.locator('.caderno-spread').boundingBox())!;
  const y = caixa.y + caixa.height / 2;
  await page.locator('.caderno-spread').dispatchEvent('pointerdown', { clientX: caixa.x + caixa.width * 0.8, clientY: y, pointerType: 'touch', isPrimary: true });
  await page.locator('.caderno-spread').dispatchEvent('pointerup', { clientX: caixa.x + caixa.width * 0.2, clientY: y, pointerType: 'touch', isPrimary: true });
  await expect.poll(async () => (await st(page)).caderno.tela.paginas).not.toEqual(antes);
  // Botões de 44 px.
  for (const sel of ['.caderno-fechar', '.caderno-proxima', '.caderno-anterior', '.caderno-aba']) {
    const b = (await page.locator(sel).first().boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  // Nada fica atrás da barra: o caderno cabe na tela.
  const livro = (await page.locator('.caderno').boundingBox())!;
  expect(livro.y + livro.height).toBeLessThanOrEqual(vp.height + 1);
  if (info.project.name === 'pixel-7') {
    await page.setViewportSize({ width: 1366, height: 860 });
    await expect.poll(async () => page.locator('.caderno-spread .caderno-pagina').count()).toBe(2);
    while (await page.locator('.caderno-anterior').isEnabled()) await page.locator('.caderno-anterior').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tests/screenshots/desktop-fase4e-abertura.png' });
    await irParaPagina(page, 'solem');
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tests/screenshots/desktop-fase4e-solem.png' });
    await page.locator('.caderno-aba[data-aba="anotacoes"]').click();
    await page.screenshot({ path: 'tests/screenshots/desktop-fase4e-anotacoes.png' });
    await page.locator('.caderno-aba[data-aba="perguntas"]').click();
    await page.screenshot({ path: 'tests/screenshots/desktop-fase4e-perguntas.png' });
  }
});

test('save antigo: recebe o caderno coerente com o progresso, sem avisos do que já existia', { tag: ['@caderno'] }, async ({ page }) => {
  test.setTimeout(240_000);
  // Save da Fase 4D (sem "caderno"), no Capítulo 02, com a pista do trinco.
  await semear(page, { capitulo: 2, cena: 'c02-artho', modo: 'escolhas', atraso: 1, flags: ['pista_trinco', 'lutou'], local: { tela: 'capitulo' } }, {}, 5);
  await continuar(page);
  await expect.poll(async () => (await st(page)).caderno?.anotacoes ?? [], { timeout: 60_000 }).toEqual(['sonho', 'trinco', 'fim-cap01']);
  const s = await st(page);
  expect(s.caderno.paginas).toEqual(SETE);
  expect(s.caderno.perguntas).toEqual(['guerra', 'alcapao', 'vozes', 'trinco']);
  expect(s.toasts).not.toContain('Caderno atualizado');
  expect(s.caderno.novidade).toBe(false);
  // O caderno vai junto no save (autosave).
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? '').join(' ')), { timeout: 10_000 }).toContain('anunciados');
});
