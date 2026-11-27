import { expect, test, type Page } from '@playwright/test';
import { irAteMenu } from './ajudantes';

/** Herói que já passou pelo sonho; `campanha` permite começar no meio do capítulo. */
function semear(page: Page, o: { origem?: string; genero?: 'm' | 'f'; campanha?: Record<string, unknown> } = {}) {
  return page.addInitScript((op) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    const g = op.genero ?? 'm';
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1,
      config: { musica: 0.7, efeitos: 0.8, mudo: false, ajudaFullmunVista: true },
      personagem: {
        nome: g === 'f' ? 'Lilith' : 'Thaelion', genero: g, raca: 'ayoran', variante: null, origem: op.origem ?? 'campones',
        atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
        atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
        classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
      },
      sonho: { concluido: true, ouvidas: ['solem', 'justar', 'irae'] },
      ...(op.campanha ? { campanha: { capitulo: 1, modo: 'escolhas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null, ...op.campanha } } : {}),
    }));
  }, o);
}

type Estado = Record<string, any>;
const estado = (page: Page): Promise<Estado> =>
  page.evaluate(() => (window as unknown as { __fdg?: { state(): Estado } }).__fdg?.state() ?? {});
const fdg = (page: Page, metodo: string, arg?: unknown) =>
  page.evaluate(([m, a]) => (window as unknown as { __fdg: Record<string, (x?: unknown) => unknown> }).__fdg[m as string](a), [metodo, arg] as const);
const foto = (page: Page, projeto: string, nome: string) => page.screenshot({ path: `tests/screenshots/${projeto}-cap01-${nome}.png` });

async function entrarNoCapitulo(page: Page, cenaEsperada = 'c01-quarto') {
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect.poll(async () => (await estado(page)).cena, { timeout: 20_000 }).toBe(cenaEsperada);
}

/** Avança as falas (um "toque duplo" por vez) até aparecerem as escolhas. */
async function ateEscolhas(page: Page) {
  await expect.poll(async () => {
    const s = await estado(page);
    if (!s.escolhas?.length) await fdg(page, 'avancar');
    return s.escolhas?.length ?? 0;
  }, { timeout: 40_000, intervals: [120] }).toBeGreaterThan(0);
}

/** Avança as falas até a caixa mostrar o trecho (lê antes de avançar, para não pular a fala). */
async function ateTexto(page: Page, trecho: string) {
  await expect.poll(async () => {
    const t = (await page.locator('.cena-texto').textContent()) ?? '';
    if (t.includes(trecho)) return true;
    await fdg(page, 'avancar');
    return false;
  }, { timeout: 40_000, intervals: [150] }).toBe(true);
}

const escolha = (page: Page, texto: string | RegExp) => page.locator('.cena-escolha', { hasText: texto });

async function escolher(page: Page, texto: string | RegExp) {
  await ateEscolhas(page);
  await escolha(page, texto).click();
}

/** Segue a rolagem do d20 (toca em Continuar) e devolve a conta mostrada. */
async function seguirRolagem(page: Page) {
  const caixa = page.locator('.rolagem.resolvida');
  await expect(caixa).toBeVisible({ timeout: 10_000 });
  const conta = (await page.locator('.rolagem-conta').textContent()) ?? '';
  await page.locator('.rolagem-seguir').click();
  await expect(page.locator('.rolagem-fundo')).toHaveCount(0);
  return conta;
}

/** Na batalha: espera a vez do herói e dá o comando. */
async function comando(page: Page, id: string) {
  await expect.poll(async () => {
    const s = await estado(page);
    return s.tela === 'batalha' && s.vez === 'heroi' && !(await page.locator(`[data-comando="${id}"]`).isDisabled());
  }, { timeout: 30_000 }).toBe(true);
  await page.locator(`[data-comando="${id}"]`).click();
}

/** Bicudas até o porco fugir (d20 forçados: herói acerta, porco erra). */
async function vencerNaBicuda(page: Page) {
  for (let i = 0; i < 14; i++) {
    const s = await estado(page);
    if (s.fim === 'vitoria') break;
    await comando(page, 'bicuda');
    await expect.poll(async () => { const t = await estado(page); return t.fim === 'vitoria' || (t.vez === 'heroi' && !(await page.locator('[data-comando="bicuda"]').isDisabled())); }, { timeout: 30_000 }).toBe(true);
  }
  await expect.poll(async () => (await estado(page)).fim, { timeout: 15_000 }).toBe('vitoria');
}

const ALTERNADO = (heroi: number, porco: number, n = 30) => Array.from({ length: n }, (_, i) => (i % 2 ? porco : heroi));

test('quarto: Estudioso vê a pista do sonho; as escolhas "uma vez" somem e a cena volta às restantes', { tag: ['@layout', '@cap01'] }, async ({ page }, info) => {
  await semear(page, { origem: 'estudioso' });
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Continuar' }).click();
  // Cartão de título
  await expect(page.locator('.cena-cartao-titulo.visivel')).toContainText('Amanhecer Tardio');
  await expect(page.locator('.cena-cartao-titulo')).toContainText('Prólogo');
  await foto(page, info.project.name, '00-titulo');
  await expect.poll(async () => (await estado(page)).cena, { timeout: 20_000 }).toBe('c01-quarto');
  await expect(page.locator('.cena-fundo.visivel')).toHaveAttribute('data-cena', 'cena-quarto');
  await page.waitForTimeout(1200);
  await foto(page, info.project.name, '01-quarto');
  await ateEscolhas(page);
  await foto(page, info.project.name, '01-quarto-escolhas');
  expect((await estado(page)).escolhas).toEqual(['Olhar as anotações sobre os deuses', 'Arrumar o quarto às pressas', 'Despedir-se à porta dos pais', 'Sair de casa']);
  await expect(escolha(page, 'prece')).toHaveCount(0);
  for (const b of await page.locator('.cena-escolha').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await escolha(page, 'Olhar as anotações').click();
  // As anotações agora estão no Caderno de estudos (Fase 4E): abre em "Alfars e Baldurs".
  await expect(page.locator('.caderno-pagina[data-pagina="abertura"] .caderno-margem')).toContainText('Artho sempre muda de assunto', { timeout: 10_000 });
  await page.locator('.caderno-fechar').click();
  await ateTexto(page, 'todo herói das velhas canções começa com um sonho');
  await ateEscolhas(page);
  const s = await estado(page);
  expect(s.flags).toEqual(expect.arrayContaining(['leu_anotacoes', 'pista_sonho']));
  expect(s.cena).toBe('c01-quarto');
  expect(s.escolhas).toEqual(['Arrumar o quarto às pressas', 'Despedir-se à porta dos pais', 'Sair de casa']);

  await escolha(page, 'Despedir-se').click();
  await ateTexto(page, 'Amo vocês. Até mais tarde.');
  await expect(page.locator('.cena-caixa.pensamento')).toBeVisible();
  await ateEscolhas(page);
  expect((await estado(page)).escolhas).toEqual(['Arrumar o quarto às pressas', 'Sair de casa']);
  await escolha(page, 'Sair de casa').click();
  await expect.poll(async () => (await estado(page)).cena).toBe('c01-soleira');
  await expect(page.locator('.cena-fundo.visivel')).toHaveAttribute('data-cena', 'cena-fullmun-rua');
  // Pensamentos: a pista do sonho reaparece
  await fdg(page, 'goto', 'c01-pensamentos');
  await ateTexto(page, 'Um sonho antes da guerra');
});

test('quarto: Religioso faz a prece e ganha +1 no teste seguinte', { tag: ['@cap01'] }, async ({ page }) => {
  await semear(page, { origem: 'religioso' });
  await entrarNoCapitulo(page);
  await ateEscolhas(page);
  await escolha(page, 'Fazer uma prece rápida').click();
  await expect(page.locator('.cena-texto')).toContainText('pequeno sol de Sólem', { timeout: 10_000 });
  await ateEscolhas(page);
  expect((await estado(page)).bonusProximoTeste).toBe(1);
  expect((await estado(page)).flags).toContain('prece');
  await expect(escolha(page, 'prece')).toHaveCount(0);
  // No grito, o selo já mostra o bônus com a prece: CAR 2 + 1 = +3
  await fdg(page, 'goto', 'c01-grito');
  await ateEscolhas(page);
  await expect(escolha(page, 'Gritar').locator('.escolha-selo')).toHaveText(/INTIMIDAR · Intimidação CD 12 · seu bônus \+3/i);
  await fdg(page, 'forceRoll', [9]);
  await escolha(page, 'Gritar').click();
  const conta = await seguirRolagem(page);
  expect(conta).toBe('9 + CAR 2 + bônus 1 = 12 · CD 12');
  expect((await estado(page)).bonusProximoTeste).toBe(0);
  await expect.poll(async () => (await estado(page)).cena).toBe('c01-intimidou');
});

test('Mirtilo: intimidar com sucesso espanta o porco, toca a vitória e volta a Füllmun', { tag: ['@cap01'] }, async ({ page }, info) => {
  await semear(page, { campanha: { cena: 'c01-grito', modo: 'falas' } });
  await entrarNoCapitulo(page, 'c01-grito');
  // Grito: cartão de ameaça
  await expect(page.locator('.cena-ameaca')).toBeHidden();
  await expect.poll(async () => { await fdg(page, 'avancar'); return page.locator('.cena-ameaca.entrou').isVisible(); }, { timeout: 20_000 }).toBe(true);
  await expect(page.locator('.cena-ameaca')).toContainText('MIRTILO · Porco azul');
  await expect(page.locator('.cena-ameaca .ameaca-selo')).toHaveText('Fauna');
  await page.waitForTimeout(700);
  await foto(page, info.project.name, '05-grito-ameaca');
  expect((await estado(page)).musica.faixa).toBe('music/tensao-porco.mp3');
  await ateEscolhas(page);
  await expect(escolha(page, 'Gritar').locator('.escolha-selo')).toHaveText(/INTIMIDAR · Intimidação CD 12 · seu bônus \+2/i);
  await expect(escolha(page, 'Agachar').locator('.escolha-selo')).toHaveText(/ACALMAR · Adestramento CD 13 · seu bônus \+4/i);
  await foto(page, info.project.name, '05-grito-escolhas');
  await fdg(page, 'forceRoll', [14]);
  await escolha(page, 'Gritar').click();
  await expect(page.locator('.rolagem.resolvida')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.rolagem-conta')).toHaveText('14 + CAR 2 = 16 · CD 12');
  await expect(page.locator('.rolagem-veredito')).toHaveText('SUCESSO');
  await foto(page, info.project.name, '06-d20-sucesso');
  await seguirRolagem(page);
  await expect.poll(async () => (await estado(page)).cena).toBe('c01-intimidou');
  expect((await estado(page)).flags).toContain('intimidou');
  await expect.poll(async () => (await estado(page)).musica.faixa).toBe('music/vitoria.mp3');
  expect((await estado(page)).musica.loop).toBe(false);
  // A vinheta acaba e a música volta para Füllmun
  await fdg(page, 'pularFaixa');
  await expect.poll(async () => (await estado(page)).musica.playlist, { timeout: 10_000 }).toEqual(['music/fullmun-01.mp3', 'music/fullmun-02.mp3']);
  await escolher(page, 'Continuar');
  await expect.poll(async () => (await estado(page)).cena).toBe('c01-aylin');
});

test('Mirtilo: intimidar falha → batalha contra o enfurecido (sem Intimidar/Acalmar, sem fugir) e vitória', { tag: ['@cap01'] }, async ({ page }, info) => {
  await semear(page, { campanha: { cena: 'c01-grito', modo: 'escolhas' } });
  await entrarNoCapitulo(page, 'c01-grito');
  await fdg(page, 'forceRoll', [2]);
  await escolher(page, 'Gritar');
  await expect(page.locator('.rolagem-veredito')).toHaveText('FALHA', { timeout: 10_000 });
  await foto(page, info.project.name, '06-d20-falha');
  await seguirRolagem(page);
  await expect.poll(async () => (await estado(page)).cena).toBe('c01-intimidar-falhou');
  await escolher(page, 'Enfrentar o Mirtilo');
  await expect.poll(async () => (await estado(page)).tela, { timeout: 20_000 }).toBe('batalha');
  await fdg(page, 'forceRoll', [15, 1, ...ALTERNADO(15, 1)]);
  await expect.poll(async () => (await estado(page)).ordem?.length ?? 0, { timeout: 15_000 }).toBe(2);
  const s = await estado(page);
  expect(s.inimigo).toBe('mirtilo-enfurecido');
  expect(s.comandos).toEqual([
    { id: 'bicuda', habilitado: true }, { id: 'intimidar', habilitado: false }, { id: 'acalmar', habilitado: false }, { id: 'aguardar', habilitado: true }, { id: 'item', habilitado: false },
  ]);
  await expect(page.locator('.batalha-cmd')).toHaveText(['Bicuda', 'Intimidar', 'Acalmar', 'Aguardar', 'Item']);
  await expect(page.getByRole('button', { name: /fugir/i })).toHaveCount(0);
  await expect(page.locator('.batalha-dica')).toHaveText('Ele está furioso demais.');
  await expect.poll(async () => (await estado(page)).vez).toBe('heroi');
  await expect(page.locator('[data-comando="intimidar"]')).toBeDisabled();
  await expect(page.locator('[data-comando="acalmar"]')).toBeDisabled();
  await foto(page, info.project.name, '07-batalha-enfurecido-idle');
  await vencerNaBicuda(page);
  await expect(page.locator('.batalha-mensagem')).toHaveText('Vitória!');
  expect((await estado(page)).poseHeroi).toBe('vitoria');
  await expect.poll(async () => (await estado(page)).musica.faixa).toBe('music/vitoria.mp3');
  await page.waitForTimeout(500);
  await foto(page, info.project.name, '07-batalha-enfurecido-vitoria');
  await page.locator('.batalha-continuar').click();
  await expect.poll(async () => (await estado(page)).cena, { timeout: 15_000 }).toBe('c01-aylin');
});

test('Mirtilo: acalmar com sucesso e Gerulf se espanta', { tag: ['@cap01'] }, async ({ page }) => {
  await semear(page, { campanha: { cena: 'c01-grito', modo: 'escolhas' } });
  await entrarNoCapitulo(page, 'c01-grito');
  await fdg(page, 'forceRoll', [10]);
  await escolher(page, 'Agachar devagar');
  // Camponês: +2 de origem em Adestramento
  expect(await seguirRolagem(page)).toBe('10 + CAR 2 + origem 2 = 14 · CD 13');
  await expect.poll(async () => (await estado(page)).cena).toBe('c01-acalmou');
  expect((await estado(page)).flags).toContain('acalmou');
  await escolher(page, 'Continuar');
  await escolher(page, 'impossível');
  await expect.poll(async () => (await estado(page)).cena).toBe('c01-gerulf');
  await ateTexto(page, 'Você acalmou o Mirtilo? Nem eu consigo isso!');
});

test('Mirtilo: acalmar falha → batalha contra o enfurecido; a Investida pode derrubar o herói', { tag: ['@cap01'] }, async ({ page }, info) => {
  await semear(page, { campanha: { cena: 'c01-grito', modo: 'escolhas' } });
  await entrarNoCapitulo(page, 'c01-grito');
  await fdg(page, 'forceRoll', [1]);
  await escolher(page, 'Agachar devagar');
  await seguirRolagem(page);
  await expect.poll(async () => (await estado(page)).cena).toBe('c01-acalmar-falhou');
  await escolher(page, 'Enfrentar o Mirtilo');
  await expect.poll(async () => (await estado(page)).tela, { timeout: 20_000 }).toBe('batalha');
  // Guarda cada mensagem da batalha (o "Levantando…" fica só 1 s na tela).
  await page.evaluate(() => {
    const w = window as unknown as { __msgs: string[] };
    w.__msgs = [];
    const el = document.querySelector('.batalha-mensagem')!;
    new MutationObserver(() => w.__msgs.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true });
  });
  // Porco age primeiro (iniciativa 20), Investida acerta (15 + 6) e a Fortitude falha (1).
  await fdg(page, 'forceRoll', [1, 20, 15, 1]);
  await expect.poll(async () => (await estado(page)).heroiCaido, { timeout: 30_000 }).toBe(true);
  const s = await estado(page);
  expect(s.inimigo).toBe('mirtilo-enfurecido');
  expect(s.ordem).toEqual(['inimigo', 'heroi']);
  expect(s.log.join('\n')).toMatch(/Investida: 15 \+6 = 21 contra Defesa 12 · acerto/);
  expect(s.log.join('\n')).toMatch(/Fortitude: 1 \+ CON 2 = 3 · CD 12 · falha/);
  expect(s.poseHeroi).toBe('caido');
  await expect(page.locator('.batalha-status')).toContainText('Caído');
  await foto(page, info.project.name, '08-batalha-investida-caido');
  // O próximo turno do herói começa com "Levantando…"
  await expect.poll(() => page.evaluate(() => (window as unknown as { __msgs: string[] }).__msgs), { timeout: 15_000 }).toContain('Levantando…');
  await expect.poll(async () => (await estado(page)).heroiCaido, { timeout: 10_000 }).toBe(false);
});

test('Mirtilo: lutar → batalha contra o normal, com dano, ajoelhado e vitória', { tag: ['@cap01'] }, async ({ page }, info) => {
  await semear(page, { campanha: { cena: 'c01-grito', modo: 'escolhas' } });
  await entrarNoCapitulo(page, 'c01-grito');
  await escolher(page, 'enfrentá-lo');
  await expect.poll(async () => (await estado(page)).tela, { timeout: 20_000 }).toBe('batalha');
  // Herói primeiro; a 1ª Bicuda erra (1 natural), o porco acerta uma vez e depois erra sempre.
  await fdg(page, 'forceRoll', [15, 1, 1, 15, ...ALTERNADO(15, 1)]);
  await expect.poll(async () => (await estado(page)).ordem?.join(','), { timeout: 15_000 }).toBe('heroi,inimigo');
  const s0 = await estado(page);
  expect(s0.inimigo).toBe('mirtilo');
  expect(s0.log.filter((l: string) => l.startsWith('Iniciativa')).length).toBe(2);
  expect(s0.comandos.filter((c: { id: string }) => c.id !== 'item').every((c: { habilitado: boolean }) => c.habilitado)).toBe(true);
  expect(s0.musica.faixa).toBe('music/tensao-porco.mp3');
  await expect(page.locator('.batalha-turnos li')).toHaveCount(2);
  await foto(page, info.project.name, '09-batalha-mirtilo-idle');
  // Ataque: o herói avança e chuta; 1 natural é erro ("Errou!")
  await comando(page, 'bicuda');
  await expect(page.locator('.sprite-batalha.heroi')).toHaveAttribute('data-pose', 'ataque', { timeout: 5000 });
  await expect(page.locator('.batalha-numero.errou').first()).toBeVisible({ timeout: 5000 });
  await foto(page, info.project.name, '09-batalha-mirtilo-ataque');
  // O porco acerta: número de dano sobre o herói
  await expect(page.locator('.sprite-batalha.inimigo')).toHaveAttribute('data-pose', 'ataque', { timeout: 15_000 });
  await expect(page.locator('.batalha-numero.dano').first()).toBeVisible({ timeout: 5000 });
  await foto(page, info.project.name, '09-batalha-mirtilo-dano');
  await expect.poll(async () => (await estado(page)).pvHeroi < (await estado(page)).pvMax, { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await estado(page)).log.join('\n'), { timeout: 15_000 }).toMatch(/Presas: 15 \+3 = 18 contra Defesa 12 · acerto · 1d4\+1 = \d/);
  expect((await estado(page)).log.join('\n')).toMatch(/Bicuda: 1 \+ FOR 1 = 2 contra Defesa 10 · erro/);
  // Com 25% dos PV ou menos, o herói fica ajoelhado
  await fdg(page, 'setPv', 3);
  expect((await estado(page)).poseHeroi).toBe('ferido');
  await expect(page.locator('.pv-barra')).toHaveClass(/baixo/);
  await foto(page, info.project.name, '09-batalha-heroi-ajoelhado');
  await vencerNaBicuda(page);
  expect((await estado(page)).log.join('\n')).toMatch(/Mirtilo foge!/);
  await page.waitForTimeout(400);
  await foto(page, info.project.name, '09-batalha-mirtilo-vitoria');
  // Os PV atuais ficam salvos
  const salvo = await page.evaluate(() => ((a) => ({ ...(a?.jogo ?? {}), versaoSave: a?.versaoSave, config: JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}') }))(JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null')).campanha);
  expect(salvo.pvAtual).toBe(3);
  expect(salvo.flags).toEqual(expect.arrayContaining(['lutou']));
  await page.locator('.batalha-continuar').click();
  await expect.poll(async () => (await estado(page)).cena, { timeout: 15_000 }).toBe('c01-aylin');
});

test('batalha: Aguardar resolve a Bicuda antes do ataque do porco', { tag: ['@cap01'] }, async ({ page }) => {
  await semear(page, { campanha: { cena: 'c01-grito', modo: 'escolhas' } });
  await entrarNoCapitulo(page, 'c01-grito');
  await escolher(page, 'enfrentá-lo');
  await expect.poll(async () => (await estado(page)).tela, { timeout: 20_000 }).toBe('batalha');
  // Herói primeiro; a Bicuda preparada erra (para o porco não fugir) e o porco erra.
  await fdg(page, 'forceRoll', [20, 1, 1, 1]);
  await comando(page, 'aguardar');
  await expect.poll(async () => (await estado(page)).log.some((l: string) => l.startsWith('Presas')), { timeout: 20_000 }).toBe(true);
  const log: string[] = (await estado(page)).log;
  const iBicuda = log.findIndex((l) => l.startsWith('Bicuda'));
  const iPresas = log.findIndex((l) => l.startsWith('Presas'));
  expect(iBicuda).toBeGreaterThan(-1);
  expect(iBicuda).toBeLessThan(iPresas);
  expect(log.some((l) => /se prepara para revidar/.test(l))).toBe(true);
});

test('derrota: Gerulf salva o herói, que fica com 1 PV e machucado; a Aylin comenta a lama e o sangue', { tag: ['@cap01'] }, async ({ page }, info) => {
  await semear(page, { campanha: { cena: 'c01-grito', modo: 'escolhas' } });
  await entrarNoCapitulo(page, 'c01-grito');
  await escolher(page, 'enfrentá-lo');
  await expect.poll(async () => (await estado(page)).tela, { timeout: 20_000 }).toBe('batalha');
  // Espera a iniciativa (com a máquina carregada ela pode sair antes de qualquer dado forçado):
  // se o herói começar, ele aguarda; o Mirtilo ataca com 18 e o herói, com 1 PV, cai.
  await expect.poll(async () => ((await estado(page)).ordem ?? []).length, { timeout: 20_000 }).toBeGreaterThan(0);
  await fdg(page, 'setPv', 1);
  await fdg(page, 'forceRoll', [18, 18]);
  await expect.poll(async () => {
    const s = await estado(page);
    if (s.fim) return s.fim;
    // O revide do Aguardar não pode vencer: o Mirtilo fica com PV de sobra até acertar.
    await fdg(page, 'setPvInimigo', 99);
    const aguardar = page.locator('[data-comando="aguardar"]');
    if (s.vez === 'heroi' && (await aguardar.isEnabled().catch(() => false))) await aguardar.click().catch(() => {});
    return null;
  }, { timeout: 60_000, intervals: [300] }).toBe('derrota');
  expect((await estado(page)).poseHeroi).toBe('caido');
  await page.waitForTimeout(900);
  await foto(page, info.project.name, '10-batalha-derrota');
  await expect.poll(async () => (await estado(page)).cena, { timeout: 20_000 }).toBe('c01-derrota');
  const s = await estado(page);
  expect(s.pv).toBe(1);
  expect(s.flags).toContain('machucado');
  await ateTexto(page, 'Gerulf chega correndo e laça o Mirtilo');
  await escolher(page, 'Continuar');
  await expect.poll(async () => (await estado(page)).cena).toBe('c01-aylin');
  await ateTexto(page, 'Você tá todo sujo de lama… e sangrando! A Nyme vai brigar com você.');
});

test('Guarda: vê o trinco arrebentado e Gerulf reage', { tag: ['@cap01'] }, async ({ page }) => {
  await semear(page, { origem: 'guarda', campanha: { cena: 'c01-grito', modo: 'falas' } });
  await entrarNoCapitulo(page, 'c01-grito');
  await ateTexto(page, 'o trinco não foi esquecido aberto. Foi arrebentado.');
  await ateEscolhas(page);
  expect((await estado(page)).flags).toContain('trinco_quebrado');
  // Guarda: Investigação +2 (origem) não entra no grito, que é Intimidação.
  await fdg(page, 'forceRoll', [18]);
  await escolha(page, 'Gritar').click();
  await seguirRolagem(page);
  await escolher(page, 'Continuar');
  await escolher(page, 'Sentir o rosto');
  await expect.poll(async () => (await estado(page)).cena).toBe('c01-gerulf');
  await ateEscolhas(page);
  expect((await estado(page)).escolhas).toEqual(['“O trinco foi arrebentado, Gerulf. Não esquecido aberto.”', 'Levar a Aylin para casa']);
  await escolha(page, 'O trinco foi arrebentado').click();
  await ateTexto(page, 'Arrebentado? …O Mirtilo não tem força pra isso.');
  await ateEscolhas(page);
  expect((await estado(page)).flags).toContain('pista_trinco');
  expect((await estado(page)).escolhas).toEqual(['Levar a Aylin para casa']);
});

test('música: a playlist de Füllmun alterna 01 e 02, troca para a tensão no grito e volta depois', { tag: ['@cap01'] }, async ({ page }) => {
  await semear(page);
  await entrarNoCapitulo(page);
  await expect.poll(async () => (await estado(page)).musica.faixa).toBe('music/fullmun-01.mp3');
  expect((await estado(page)).musica.playlist).toEqual(['music/fullmun-01.mp3', 'music/fullmun-02.mp3']);
  expect((await estado(page)).musica.loop).toBe(false);
  await fdg(page, 'pularFaixa');
  await expect.poll(async () => (await estado(page)).musica.faixa, { timeout: 15_000 }).toBe('music/fullmun-02.mp3');
  await fdg(page, 'pularFaixa');
  await expect.poll(async () => (await estado(page)).musica.faixa, { timeout: 15_000 }).toBe('music/fullmun-01.mp3');
  // Cena seguinte com a mesma música: não reinicia
  const antes = (await estado(page)).musica.historico.length;
  await fdg(page, 'goto', 'c01-soleira');
  await page.waitForTimeout(800);
  expect((await estado(page)).musica.historico.length).toBe(antes);
  // No grito, a tensão; depois do susto, Füllmun de novo
  await fdg(page, 'goto', 'c01-grito');
  await expect.poll(async () => (await estado(page)).musica.faixa).toBe('music/tensao-porco.mp3');
  expect((await estado(page)).musica.loop).toBe(true);
  await fdg(page, 'goto', 'c01-aylin');
  await expect.poll(async () => (await estado(page)).musica.faixa).toBe('music/fullmun-01.mp3');
  const h: string[] = (await estado(page)).musica.historico;
  expect(h.slice(-4)).toEqual(['music/fullmun-02.mp3', 'music/fullmun-01.mp3', 'music/tensao-porco.mp3', 'music/fullmun-01.mp3']);
});

test('game over: ?tela=gameover mostra a tela com a música e os botões', { tag: ['@cap01'] }, async ({ page }, info) => {
  await semear(page, { campanha: { cena: 'c01-grito', modo: 'escolhas', cenaAntesDaBatalha: 'c01-grito' } });
  await page.goto('./?tela=gameover&test=1');
  await page.locator('.loading-comecar').click({ timeout: 90_000 });
  await expect(page.locator('.tela-game-over')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.go-texto')).toHaveText('Sua jornada termina aqui…');
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Voltar ao menu' })).toBeVisible();
  await expect(page.locator('.go-fundo')).toHaveAttribute('src', /game-over/);
  expect((await estado(page)).musica.faixa).toBe('music/game-over.mp3');
  await page.waitForTimeout(3500);
  await foto(page, info.project.name, '12-game-over');
  // Tentar novamente: volta à cena de antes da batalha
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect.poll(async () => (await estado(page)).cena, { timeout: 20_000 }).toBe('c01-grito');
});
