import { expect, test, type Page } from '@playwright/test';
import { avancar, novoJogo, cartaoComConteudo, dentroDoCartao, fimDoPassoVisivel, foto, irAteMenu, quadrosPvPmNaoVazam, rodapeAlcancavel, telaEstreita } from './ajudantes';
import NOMES from '../src/data/nomes.json' with { type: 'json' };

const titulo = (page: Page, texto: string) => page.getByRole('heading', { name: texto });
const retratoResumo = (page: Page) => page.locator('.painel-retrato');
/** Card de classe pelo título exato ("Paladina" contém "ladina"). */
const cardClasse = (page: Page, nome: string) =>
  page.locator('.card-classe').filter({ has: page.locator('.card-titulo').getByText(nome, { exact: true }) });

/** Confere o passo: cartão com conteúdo, rodapé alcançável e Avançar ainda bloqueado. */
async function inicioDoPasso(page: Page, tituloPasso: string) {
  await expect(titulo(page, tituloPasso)).toBeVisible();
  await cartaoComConteudo(page);
  await rodapeAlcancavel(page);
  await fimDoPassoVisivel(page);
}

async function comprar(page: Page, compras: Record<string, number>) {
  for (const [atributo, vezes] of Object.entries(compras))
    for (let i = 0; i < vezes; i++) await page.getByRole('button', { name: `Aumentar ${atributo}` }).click();
}

test('criação completa: Azakar mulher, Sombra, Curandeiro, Paladina', { tag: ['@layout', '@criacao'] }, async ({ page }, info) => {
  await irAteMenu(page);
  await novoJogo(page);

  // 1. Gênero
  await inicioDoPasso(page, 'Quem atende ao chamado?');
  await expect(avancar(page)).toBeDisabled();
  await page.locator('.card-genero', { hasText: 'Mulher' }).click();
  await expect(avancar(page)).toBeEnabled();
  await foto(page, info, '1-genero');
  await avancar(page).click();

  // 2. Raça + variante
  await inicioDoPasso(page, 'De que povo você vem?');
  await expect(avancar(page)).toBeDisabled();
  await page.locator('.card-raca', { hasText: 'Azakar' }).click();
  await expect(avancar(page)).toBeDisabled(); // falta a variante
  await page.locator('.card-variante', { hasText: 'Sombra' }).click();
  await expect(avancar(page)).toBeEnabled();
  await expect(retratoResumo(page)).toHaveAttribute('src', /./);
  await foto(page, info, '2-raca');
  await avancar(page).click();

  // 3. Origem
  await inicioDoPasso(page, 'Quem você era antes da aventura?');
  await expect(avancar(page)).toBeDisabled();
  await page.locator('.card-origem', { hasText: 'Curandeiro' }).click();
  await expect(avancar(page)).toBeEnabled();
  await foto(page, info, '3-origem');
  await avancar(page).click();

  // 4. Classe
  await inicioDoPasso(page, 'Que caminho você vai seguir?');
  await expect(avancar(page)).toBeDisabled();
  await expect(page.locator('.card-classe')).toHaveCount(8);
  await expect(page.locator('.card-classe:not(.bloqueado)')).toHaveCount(5);
  await expect(page.locator('.card-classe.bloqueado')).toHaveCount(3);
  for (const nome of ['Guerreira', 'Paladina', 'Ladina', 'Arcanista (Mago)', 'Monja']) await expect(cardClasse(page, nome)).toBeVisible();
  // Retrato do card conforme raça e gênero.
  await expect(cardClasse(page, 'Paladina').locator('img')).toHaveAttribute('data-retrato', /azakar-f-paladino/);
  // Indisponível: não seleciona e mostra o aviso no toque.
  const pistoleira = cardClasse(page, 'Pistoleira');
  await pistoleira.scrollIntoViewIfNeeded();
  // aria-disabled faz o Playwright recusar o .tap(); um dedo de verdade toca do mesmo jeito.
  const caixa = (await pistoleira.boundingBox())!;
  await page.touchscreen.tap(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await expect(pistoleira.locator('.card-aviso')).toHaveText('Indisponível na versão DEMO');
  await expect(pistoleira).toHaveClass(/mostrar-aviso/);
  await expect(avancar(page)).toBeDisabled();
  await expect(page.locator('.card-classe.selecionado')).toHaveCount(0);
  // O aviso some sozinho em 2 s.
  await expect(pistoleira).not.toHaveClass(/mostrar-aviso/, { timeout: 4000 });
  await expect(pistoleira.locator('.card-aviso')).toHaveCSS('opacity', '0');
  // Escolhe Paladina: o retrato do resumo vira o da classe.
  await expect(retratoResumo(page)).toHaveAttribute('data-retrato', 'img/herois/azakar-f-comum.webp');
  await cardClasse(page, 'Paladina').click();
  await expect(retratoResumo(page)).toHaveAttribute('data-retrato', 'img/herois/azakar-f-paladino.webp');
  await expect(page.locator('.detalhe-classe')).toContainText('Paladina');
  await expect(page.locator('.detalhe-classe')).toContainText('Espada e escudo');
  await expect(page.locator('.pv-formula')).toHaveText(telaEstreita(page) ? '18 + CON' : '18 + Constituição', { useInnerText: true });
  await expect(page.locator('.pm-formula')).toHaveText('4');
  // Duas fases: agora (sem classe) e após a Forja
  await expect(page.locator('.pv-agora')).toHaveText(telaEstreita(page) ? '10 + CON' : '10 + Constituição', { useInnerText: true });
  await expect(page.locator('.pm-agora')).toHaveText('0');
  await expect(page.locator('.nota-forja')).toHaveText('A classe só desperta quando você jura na Forja.');
  await quadrosPvPmNaoVazam(page);
  await fimDoPassoVisivel(page);
  await page.locator('.pv-pm').scrollIntoViewIfNeeded();
  await foto(page, info, '4-classe-pv-pm');
  await expect(avancar(page)).toBeEnabled();
  await page.locator('.passo-classe .passo-cabecalho').scrollIntoViewIfNeeded();
  await foto(page, info, '4-classe');
  await page.locator('.detalhe-classe').scrollIntoViewIfNeeded();
  await foto(page, info, '4-classe-detalhe');
  await avancar(page).click();

  // 5. Nome
  await inicioDoPasso(page, 'Como você se chama?');
  const input = page.locator('.campo-nome');
  await dentroDoCartao(page, input);
  await dentroDoCartao(page, page.locator('.nome-dica'));
  await dentroDoCartao(page, page.getByRole('button', { name: 'Sugerir nome' }));
  expect(parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(avancar(page)).toBeDisabled();
  await foto(page, info, '5-nome');
  await input.fill('L');
  await expect(avancar(page)).toBeDisabled();
  await input.fill('Lilith');
  await expect(avancar(page)).toBeEnabled();
  await input.press('Enter');

  // 6. Atributos
  await inicioDoPasso(page, 'Distribua seus atributos');
  await expect(page.locator('.selo-chave')).toHaveText('Atributo-chave da Paladina: CAR');
  await expect(page.locator('.atributo.chave')).toHaveAttribute('data-atributo', 'CAR');
  await expect(page.locator('.pv-valor')).toHaveText('17'); // 18 + CON −1 (Azakar)
  await expect(page.locator('.pm-valor')).toHaveText('4');
  await expect(avancar(page)).toBeDisabled();
  await comprar(page, { Carisma: 3, Força: 2, Constituição: 2, Destreza: 1, Sabedoria: 1 });
  await expect(page.locator('.pontos-valor')).toHaveText('0');
  await expect(page.getByRole('button', { name: 'Aumentar Inteligência' })).toBeDisabled();
  await expect(page.locator('.pv-valor')).toHaveText('19'); // 18 + (2 − 1)
  await expect(page.locator('.pv-agora')).toHaveText('11'); // 10 + CON 1, antes da Forja
  await expect(page.locator('.pm-agora')).toHaveText('0');
  await quadrosPvPmNaoVazam(page);
  await fimDoPassoVisivel(page);
  await expect(avancar(page)).toBeEnabled();
  await foto(page, info, '6-atributos');
  await avancar(page).click();

  // 7. Revisão
  await inicioDoPasso(page, 'Sua heroína está pronta');
  await expect(page.locator('.revisao-classe')).toHaveText('Paladina');
  await expect(page.locator('.passo-revisao')).toContainText('Espada e escudo');
  await expect(page.locator('.revisao-retrato')).toHaveAttribute('data-retrato', 'img/herois/azakar-f-paladino.webp');
  await expect(page.locator('.passo-revisao .pv-valor')).toHaveText('19');
  await expect(page.locator('.passo-revisao .pm-valor')).toHaveText('4');
  await expect(page.locator('.passo-revisao .pv-agora')).toHaveText('11');
  await quadrosPvPmNaoVazam(page);
  await fimDoPassoVisivel(page);
  await expect(avancar(page)).toHaveText('Confirmar heroína');
  await foto(page, info, '7-revisao');
  await avancar(page).click();

  await expect(page.locator('.tela-prologo')).toBeVisible({ timeout: 10_000 });
  const salvo = await page.evaluate(() => ((a) => ({ ...(a?.jogo ?? {}), versaoSave: a?.versaoSave, config: JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}') }))(JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null')).personagem);
  expect(salvo).toMatchObject({
    nome: 'Lilith', genero: 'f', raca: 'azakar', variante: 'sombra', origem: 'curandeiro', classe: 'paladino',
    pvMax: 19, pmMax: 4, pedras: { tolerancia: false, egide: false, verdade: false, preco: false },
  });
});

test('Araké homem Mago: o +1 de Araké em INT entra no PM', { tag: ['@layout', '@criacao'] }, async ({ page }, info) => {
  await irAteMenu(page);
  await novoJogo(page);
  await page.locator('.card-genero', { hasText: 'Homem' }).click();
  await avancar(page).click();
  await page.locator('.card-raca', { hasText: 'Araké' }).click();
  await avancar(page).click();
  await page.locator('.card-origem', { hasText: 'Estudioso' }).click();
  await avancar(page).click();
  await expect(cardClasse(page, 'Arcanista (Mago)').locator('img')).toHaveAttribute('data-retrato', /arake-m-arcanista/);
  await expect(cardClasse(page, 'Guerreiro')).toBeVisible();
  await cardClasse(page, 'Arcanista (Mago)').click();
  await expect(page.locator('.pm-formula')).toHaveText(telaEstreita(page) ? '5 + INT' : '5 + Inteligência', { useInnerText: true });
  await quadrosPvPmNaoVazam(page);
  await avancar(page).click();
  await page.locator('.campo-nome').fill('Aldren');
  await avancar(page).click();

  await expect(page.locator('.selo-chave')).toHaveText('Atributo-chave do Mago: INT');
  await comprar(page, { Inteligência: 3, Constituição: 2, Destreza: 2, Sabedoria: 1, Carisma: 1 });
  await expect(page.locator('.pm-valor')).toHaveText('8'); // 5 + INT 3
  await expect(avancar(page)).toBeDisabled(); // faltam os bônus de Araké
  await page.locator('[data-atributo="INT"] .btn-bonus').click();
  await expect(page.locator('.pm-valor')).toHaveText('9'); // 5 + INT 4
  await page.locator('[data-atributo="CON"] .btn-bonus').click();
  await page.locator('[data-atributo="DES"] .btn-bonus').click();
  await expect(page.locator('.pv-valor')).toHaveText('15'); // 12 + CON 3
  await expect(avancar(page)).toBeEnabled();
  await foto(page, info, 'mago-atributos');
  await avancar(page).click();

  await expect(page.locator('.revisao-classe')).toHaveText('Arcanista (Mago)');
  await expect(page.locator('.passo-revisao .pm-valor')).toHaveText('9');
  await expect(page.locator('.passo-revisao')).toContainText('Cajado (também é o foco arcano)');
  await expect(avancar(page)).toHaveText('Confirmar herói');
  await foto(page, info, 'mago-revisao');
});

test('save antigo sem classe: Continuar retoma no passo Classe', { tag: ['@criacao'] }, async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1,
      config: { musica: 0.7, efeitos: 0.8, mudo: false, ajudaFullmunVista: true },
      personagem: {
        nome: 'Feliks', genero: 'm', raca: 'arake', variante: null, origem: 'guarda',
        atributosComprados: { FOR: 4, DES: 2, CON: 1, INT: 1, SAB: -1, CAR: 0 }, bonusArake: ['FOR', 'CAR', 'SAB'],
        atributosFinais: { FOR: 5, DES: 2, CON: 1, INT: 1, SAB: 0, CAR: 1 }, classe: null, criadoEm: '2026-11-16T20:28:05.999Z',
      },
    }));
  });
  await irAteMenu(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(titulo(page, 'Que caminho você vai seguir?')).toBeVisible();
  await expect(page.locator('.painel-resumo')).toContainText('Araké');
  await expect(page.locator('.painel-resumo')).toContainText('Guarda');
  await cardClasse(page, 'Guerreiro').click();
  await avancar(page).click();
  await expect(page.locator('.campo-nome')).toHaveValue('Feliks');
  await avancar(page).click();
  await expect(page.locator('.pontos-valor')).toHaveText('0');
  await expect(page.locator('.pv-valor')).toHaveText('21'); // 20 + CON 1
  await avancar(page).click();
  await expect(page.locator('.revisao-classe')).toHaveText('Guerreiro');
  await avancar(page).click();
  await expect(page.locator('.tela-prologo')).toBeVisible({ timeout: 10_000 });
  const salvo = await page.evaluate(() => ((a) => ({ ...(a?.jogo ?? {}), versaoSave: a?.versaoSave, config: JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}') }))(JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null')).personagem);
  expect(salvo).toMatchObject({ classe: 'guerreiro', pvMax: 21, pmMax: 3 });
});

const NOMES_SUGERIDOS = NOMES as Record<string, Record<string, string[]>>;

/** Pula o prólogo em texto (o "pular" só vale depois de 5 s) e espera o sonho começar. */
/** Pula o prólogo em texto; a intro de Füllmun aparece (frase a frase) e o "Pular" leva ao sonho. */
async function pularPrologoAteOSonho(page: Page, foto?: () => Promise<void>) {
  await expect(page.locator('.tela-prologo')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.tela-prologo .dica-pular.visivel')).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  // Intro de Füllmun, entre o prólogo e o sonho
  const intro = page.locator('.tela-intro-fullmun');
  await expect(intro).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.intro-fullmun-frase')).toHaveText(/Füllmun é um vilarejo pequeno/, { timeout: 5000 });
  // Toque no meio da animação mostra a frase inteira; com o ◆ pulsando, o toque seguinte avança.
  await expect(page.locator('.intro-fullmun-toque.visivel')).toBeVisible({ timeout: 5000 });
  await intro.click({ position: { x: 40, y: 200 } });
  await expect(page.locator('.intro-fullmun-frase')).toHaveText(/Seus moradores vivem do que plantam/, { timeout: 5000 });
  await expect(intro).toHaveAttribute('data-frase', '2');
  await foto?.();
  await page.getByRole('button', { name: 'Pular' }).click();
  await expect(page.locator('.tela-sonho.pronto canvas')).toBeVisible({ timeout: 30_000 });
}

test('raças: Nyashi e Ayoran jogáveis; as outras quatro continuam indisponíveis', { tag: ['@criacao'] }, async ({ page }) => {
  await irAteMenu(page);
  await novoJogo(page);
  await page.locator('.card-genero', { hasText: 'Homem' }).click();
  await avancar(page).click();
  expect(await page.locator('.card-raca .card-titulo').allTextContents())
    .toEqual(['Araké', 'Azakar', 'Nyashi', 'Ayoran', 'Dorun', 'Ogbari', "Ara'Maku", 'Kirai']);
  expect(await page.locator('.card-raca.bloqueado .card-titulo').allTextContents())
    .toEqual(['Dorun', 'Ogbari', "Ara'Maku", 'Kirai']);
});

test('criação: Nyashi mulher Ladina e, depois do prólogo, o sonho', { tag: ['@criacao'] }, async ({ page }, info) => {
  await irAteMenu(page);
  await novoJogo(page);
  await page.locator('.card-genero', { hasText: 'Mulher' }).click();
  await avancar(page).click();

  await page.locator('.card-raca', { hasText: 'Nyashi' }).click();
  await expect(page.locator('.detalhe-raca')).toContainText('Os Caçadores da Lua');
  await expect(page.locator('.detalhe-raca')).toContainText('Todos seguem a lua como outros povos seguem estradas.');
  await expect(page.locator('.detalhe-raca')).toContainText('DES +2, SAB +1, CAR −1');
  await expect(retratoResumo(page)).toHaveAttribute('data-retrato', 'img/herois/nyashi-f-comum.webp');
  await expect(avancar(page)).toBeEnabled(); // Nyashi não tem variante
  await foto(page, info, 'nyashi-raca');
  await avancar(page).click();

  await page.locator('.card-origem', { hasText: 'Camponês' }).click();
  await avancar(page).click();

  await expect(cardClasse(page, 'Ladina').locator('img')).toHaveAttribute('data-retrato', 'img/herois/nyashi-f-ladino.webp');
  await cardClasse(page, 'Ladina').click();
  await expect(retratoResumo(page)).toHaveAttribute('data-retrato', 'img/herois/nyashi-f-ladino.webp');
  await expect(page.locator('.pm-formula')).toHaveText('4'); // sem bônus racial de PM
  await page.locator('.passo-classe .passo-cabecalho').scrollIntoViewIfNeeded();
  await foto(page, info, 'nyashi-classe');
  await avancar(page).click();

  await page.getByRole('button', { name: 'Sugerir nome' }).click();
  expect(NOMES_SUGERIDOS.nyashi.f).toContain(await page.locator('.campo-nome').inputValue());
  await page.locator('.campo-nome').fill('Shirra');
  await avancar(page).click();

  await expect(page.locator('[data-atributo="DES"] .mod')).toHaveText('+2');
  await expect(page.locator('[data-atributo="SAB"] .mod')).toHaveText('+1');
  await expect(page.locator('[data-atributo="CAR"] .mod')).toHaveText('−1');
  await comprar(page, { Destreza: 3, Constituição: 2, Sabedoria: 2, Força: 2 });
  await expect(page.locator('.pontos-valor')).toHaveText('0');
  await expect(page.locator('[data-atributo="DES"] .atributo-final')).toHaveText('+5');
  await expect(page.locator('[data-atributo="CAR"] .atributo-final')).toHaveText('−1');
  await expect(page.locator('.pv-valor')).toHaveText('18'); // 16 + CON 2
  await expect(page.locator('.pm-valor')).toHaveText('4');
  await expect(page.locator('.pm-raca')).toHaveCount(0);
  await foto(page, info, 'nyashi-atributos');
  await avancar(page).click();

  await expect(page.locator('.revisao-classe')).toHaveText('Ladina');
  await expect(page.locator('.revisao-retrato')).toHaveAttribute('data-retrato', 'img/herois/nyashi-f-ladino.webp');
  await expect(page.locator('.passo-revisao')).toContainText('Nyashi (Tabaxi)');
  // Busto do herói ao lado do resumo da ficha (Fase 4B)
  await expect(page.locator('.revisao-busto')).toHaveAttribute('data-retrato', 'img/retratos/heroi-nyashi-f.webp');
  await expect.poll(() => page.locator('.revisao-busto').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await foto(page, info, 'nyashi-revisao');
  await avancar(page).click();

  await pularPrologoAteOSonho(page, () => foto(page, info, 'intro-fullmun'));
  const estado = await page.evaluate(() => ((a) => ({ ...(a?.jogo ?? {}), versaoSave: a?.versaoSave, config: JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}') }))(JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null')));
  expect(estado.personagem).toMatchObject({ raca: 'nyashi', genero: 'f', classe: 'ladino', pvMax: 18, pmMax: 4 });
  expect(estado.sonho).toEqual({ concluido: false, ouvidas: [] });
});

test('criação: Ayoran homem Arcanista recebe +1 PM (Sangue dos Primevos)', { tag: ['@layout', '@criacao'] }, async ({ page }, info) => {
  await irAteMenu(page);
  await novoJogo(page);
  await page.locator('.card-genero', { hasText: 'Homem' }).click();
  await avancar(page).click();

  await page.locator('.card-raca', { hasText: 'Ayoran' }).click();
  await expect(page.locator('.detalhe-raca')).toContainText('Os Primevos');
  await expect(page.locator('.detalhe-raca')).toContainText('Movem-se como quem dança');
  await expect(page.locator('.detalhe-raca')).toContainText('+1 PM no 1º nível e por nível');
  await expect(retratoResumo(page)).toHaveAttribute('data-retrato', 'img/herois/ayoran-m-comum.webp');
  await foto(page, info, 'ayoran-raca');
  await avancar(page).click();

  await page.locator('.card-origem', { hasText: 'Estudioso' }).click();
  await avancar(page).click();

  await expect(cardClasse(page, 'Arcanista (Mago)').locator('img')).toHaveAttribute('data-retrato', 'img/herois/ayoran-m-arcanista.webp');
  await cardClasse(page, 'Arcanista (Mago)').click();
  await expect(retratoResumo(page)).toHaveAttribute('data-retrato', 'img/herois/ayoran-m-arcanista.webp');
  await expect(page.locator('.pm-formula'))
    .toHaveText(telaEstreita(page) ? '5 + INT + 1' : '5 + Inteligência + 1 (Sangue dos Primevos)', { useInnerText: true });
  await quadrosPvPmNaoVazam(page);
  await fimDoPassoVisivel(page);
  await page.locator('.detalhe-classe').scrollIntoViewIfNeeded();
  await foto(page, info, 'ayoran-classe');
  await avancar(page).click();

  await page.getByRole('button', { name: 'Sugerir nome' }).click();
  expect(NOMES_SUGERIDOS.ayoran.m).toContain(await page.locator('.campo-nome').inputValue());
  await page.locator('.campo-nome').fill('Thaelion');
  await avancar(page).click();

  await expect(page.locator('[data-atributo="DES"] .mod')).toHaveText('+1');
  await expect(page.locator('[data-atributo="INT"] .mod')).toHaveText('+1');
  await expect(page.locator('[data-atributo="CAR"] .mod')).toHaveText('+1');
  await expect(page.locator('.pm-valor')).toHaveText('7'); // 5 + INT 1 + 1
  await comprar(page, { Inteligência: 3, Constituição: 2, Destreza: 2, Sabedoria: 1, Carisma: 1 });
  await expect(page.locator('.pontos-valor')).toHaveText('0');
  await expect(page.locator('.pm-valor')).toHaveText('10'); // 5 + INT 4 + 1 (Sangue dos Primevos)
  await expect(page.locator('.pm-raca')).toHaveText('+1 PM do Sangue dos Primevos');
  await quadrosPvPmNaoVazam(page);
  await expect(page.locator('.pv-valor')).toHaveText('14'); // 12 + CON 2
  await foto(page, info, 'ayoran-atributos');
  await avancar(page).click();

  await expect(page.locator('.revisao-classe')).toHaveText('Arcanista (Mago)');
  await expect(page.locator('.passo-revisao .pm-valor')).toHaveText('10');
  await expect(page.locator('.revisao-retrato')).toHaveAttribute('data-retrato', 'img/herois/ayoran-m-arcanista.webp');
  await foto(page, info, 'ayoran-revisao');
  await avancar(page).click();
  await expect(page.locator('.tela-prologo')).toBeVisible({ timeout: 10_000 });
  const salvo = await page.evaluate(() => ((a) => ({ ...(a?.jogo ?? {}), versaoSave: a?.versaoSave, config: JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}') }))(JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null')).personagem);
  expect(salvo).toMatchObject({ raca: 'ayoran', classe: 'arcanista', pvMax: 14, pmMax: 10 });
});
