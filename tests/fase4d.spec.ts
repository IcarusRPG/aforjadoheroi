import { expect, test, type Page } from '@playwright/test';
import { irAteMenu, novoJogo } from './ajudantes';
import DICAS from '../src/data/tutorial.json' with { type: 'json' };
/** Füllmun passou a ter 2400 px de largura (Fase 5): coordenadas do mapa antigo → novas. */
const M = (v: number) => Math.round((v * 2400) / 1672);

/* Fase 4D: pedaço que não veio, registro de erros, herói no limbo, intro do herói e tutorial. */

type Estado = Record<string, any>;
const HEROI = {
  nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones',
  atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
  atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
  classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
};
const SEM_DICAS = { tutorial: false, ajudaFullmunVista: true };
/** O "Entendi" da dica aberta (não o da que está saindo, que some no meio do clique). */
const DICA_OK = '.dica-tutorial:not(.saindo) .dica-ok';
/** Tutorial ligado só com as dicas pedidas (as outras contam como já vistas). */
const soDicas = (...ids: string[]) => ({ tutorial: true, ajudaFullmunVista: true, dicasVistas: (DICAS as { id: string }[]).map((d) => d.id).filter((id) => !ids.includes(id)) });

interface Semente { campanha?: Record<string, unknown>; config?: Record<string, unknown>; heroi?: Record<string, unknown>; sonhoConcluido?: boolean }
function semear(page: Page, o: Semente = {}) {
  return page.addInitScript((op) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1,
      versaoSave: 4,
      config: { musica: 0.7, efeitos: 0.8, mudo: false, ...op.config },
      personagem: { ...op.heroi },
      sonho: op.sonhoConcluido ? { concluido: true, ouvidas: ['solem', 'justar', 'irae'] } : { concluido: false, ouvidas: [] },
      campanha: { capitulo: 1, cena: null, modo: 'falas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null, ...op.campanha },
    }));
  }, { campanha: o.campanha ?? {}, config: o.config ?? SEM_DICAS, heroi: { ...HEROI, ...o.heroi }, sonhoConcluido: o.sonhoConcluido ?? true });
}
const MAPA = (extra: Record<string, unknown> = {}) => ({ cena: 'c01-soleira', modo: 'escolhas', local: { tela: 'mapa', mapa: 'fullmun' }, ...extra });

const st = (page: Page): Promise<Estado> => page.evaluate(() => (window as unknown as { __fdg?: { state(): Estado } }).__fdg?.state() ?? {});
const f = (page: Page, m: string, ...args: unknown[]) =>
  page.evaluate(([mm, aa]) => (window as unknown as { __fdg?: Record<string, (...x: unknown[]) => unknown> }).__fdg?.[mm as string]?.(...(aa as unknown[])), [m, args] as const);
const foto = (page: Page, projeto: string, nome: string) => page.screenshot({ path: `tests/screenshots/${projeto}-fase4d-${nome}.png` });
const opcoes = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}'));

async function continuar(page: Page, query = '?test=1') {
  await irAteMenu(page, `./${query}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
}
async function noMapa(page: Page, query = '?test=1') {
  await continuar(page, query);
  await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.mapa === 'fullmun' && s.pronto; }, { timeout: 90_000 }).toBe(true);
}
/** Do "começar" ao menu sem navegar (depois de uma recarga). */
async function comecarAteMenu(page: Page) {
  await page.locator('.loading-comecar').click({ timeout: 90_000 });
  const menu = page.locator('.tela-menu');
  for (let i = 0; i < 80 && !(await menu.isVisible()); i++) {
    if (await page.locator('.dica-pular.visivel').isVisible()) await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  await expect(menu).toBeVisible();
}
async function escolher(page: Page, texto: string) {
  await expect.poll(async () => {
    const s = await st(page);
    const lista: string[] = s.escolhas ?? [];
    if (lista.some((e) => e.includes(texto))) return true;
    if (await page.locator(DICA_OK).isVisible()) await page.locator(DICA_OK).click({ timeout: 2000 }).catch(() => {});
    else if (!lista.length) await f(page, 'avancar');
    else if (lista.length === 1) await page.locator('.cena-escolha').first().click().catch(() => {});
    return false;
  }, { timeout: 90_000, intervals: [200] }).toBe(true);
  await page.locator('.cena-escolha', { hasText: texto }).first().click();
}
async function ateTexto(page: Page, trecho: string) {
  await expect.poll(async () => {
    const s = await st(page);
    if (s.digitando) return false;
    const t = (await page.locator('.cena-texto').textContent()) ?? '';
    if (t.includes(trecho)) return true;
    if (!(s.escolhas ?? []).length) await f(page, 'avancar');
    else if (s.escolhas.length === 1) await page.locator('.cena-escolha').first().click().catch(() => {});
    return false;
  }, { timeout: 45_000, intervals: [200] }).toBe(true);
}
async function fecharConversa(page: Page) {
  await expect.poll(async () => {
    const s = await st(page);
    if (!s.palco) return true;
    if (!(s.escolhas ?? []).length) await f(page, 'avancar');
    else await page.locator('.cena-escolha').first().click().catch(() => {});
    return false;
  }, { timeout: 45_000, intervals: [220] }).toBe(true);
}
async function vezDoHeroi(page: Page, cmd = 'bicuda') {
  await expect.poll(async () => {
    if (await page.locator(DICA_OK).isVisible()) await page.locator(DICA_OK).click({ timeout: 2000 }).catch(() => {});
    const s = await st(page);
    if (s.fim) return true;
    return s.tela === 'batalha' && s.vez === 'heroi' && !(await page.locator(`[data-comando="${cmd}"]`).isDisabled().catch(() => true));
  }, { timeout: 40_000, intervals: [200] }).toBe(true);
}

/* ======================================================================
   1. Pedaço dinâmico que não veio (404 depois de um deploy)
   ====================================================================== */

test('pedaço que não veio: tenta de novo, recarrega uma vez e mostra a tela amigável; o erro cru nunca aparece', async ({ page }, info) => {
  test.setTimeout(300_000);
  await semear(page, { sonhoConcluido: false });
  const pedidos: string[] = [];
  await page.route(/\/assets\/pacote-[\w-]+\.js/, (r) => { pedidos.push(r.request().url()); return r.fulfill({ status: 404, body: 'não existe' }); });
  let cargas = 0;
  page.on('load', () => cargas++);
  await continuar(page);
  // 1ª tentativa + 2 novas (500 ms e 1500 ms, com query nova) e então a recarga automática
  await expect.poll(() => cargas, { timeout: 30_000 }).toBe(2);
  expect(pedidos.length).toBeGreaterThanOrEqual(3);
  // O Safari não põe o endereço do pedaço na mensagem de erro: lá a nova tentativa usa o mesmo import().
  if (info.project.name !== 'iphone-13') expect(pedidos.some((u) => /\.js\?v=\d+$/.test(u))).toBe(true);
  // Depois da recarga, falha de novo: agora a tela amigável (sem segunda recarga)
  await comecarAteMenu(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.tela-erro')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tela-erro')).toContainText('O jogo foi atualizado ou a conexão falhou.');
  await expect(page.getByRole('button', { name: 'Recarregar' })).toBeVisible();
  const texto = await page.locator('body').innerText();
  expect(texto).not.toMatch(/TypeError|Failed to fetch|dynamically imported|pacote-/);
  expect(cargas).toBe(2);
  const b = (await page.getByRole('button', { name: 'Recarregar' }).boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(44);
  await foto(page, info.project.name, 'tela-erro');
  // Com o pedaço de volta, "Recarregar" volta ao jogo
  await page.unroute(/\/assets\/pacote-[\w-]+\.js/);
  await page.getByRole('button', { name: 'Recarregar' }).click();
  await comecarAteMenu(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.tela-sonho.pronto canvas')).toBeVisible({ timeout: 40_000 });
});

/* ======================================================================
   2. Registro de erros
   ====================================================================== */

test('registro de erros: no máximo 5 por sessão, sem dados pessoais; sem endereço do PocketBase, nada sai', async ({ page }) => {
  test.setTimeout(240_000);
  await semear(page, { campanha: MAPA() });
  const corpos: Record<string, unknown>[] = [];
  await page.route('https://pb.falso.test/**', (r) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    corpos.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '{}' });
  });
  await noMapa(page, '?test=1&pb=https://pb.falso.test');
  await page.evaluate(() => { for (let i = 0; i < 7; i++) setTimeout(() => { throw new Error(`erro de teste ${i}`); }, i * 30); });
  await expect.poll(() => corpos.length, { timeout: 10_000 }).toBe(5);
  await page.waitForTimeout(1500);
  expect(corpos.length).toBe(5);
  for (const c of corpos) {
    expect(Object.keys(c).sort()).toEqual(['mensagem', 'navegador', 'pilha', 'tela', 'url', 'versaoJogo']);
    expect(c.tela).toBe('mapa');
    expect(String(c.url)).not.toContain('?');
    expect(String(c.versaoJogo)).toMatch(/^([0-9a-f]{7}|dev)$/);
    expect(String(c.pilha).length).toBeLessThanOrEqual(4096);
  }
  expect(corpos[0].mensagem).toContain('erro de teste 0');
  const tudo = JSON.stringify(corpos);
  expect(tudo).not.toContain(HEROI.nome);
  expect(tudo).not.toMatch(/personagem|campanha|fdg\.save/);
});

test('sem VITE_PB_URL (build local), um erro não sai do navegador', async ({ page, baseURL }) => {
  await semear(page, { campanha: MAPA() });
  const fora: string[] = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(baseURL!).origin) fora.push(r.url()); });
  await noMapa(page);
  await page.evaluate(() => setTimeout(() => { throw new Error('erro sem pocketbase'); }, 0));
  await page.waitForTimeout(1500);
  expect(fora).toEqual([]);
});

/* ======================================================================
   3. Herói no limbo depois de levar a Aylin para casa
   ====================================================================== */

const CAMINHOS: Record<string, (page: Page) => Promise<void>> = {
  acalmar: async (page) => {
    await f(page, 'forceRoll', [18]);
    await escolher(page, 'Agachar devagar');
    await page.locator('.rolagem-seguir').click({ timeout: 10_000 });
  },
  intimidar: async (page) => {
    await f(page, 'forceRoll', [18]);
    await escolher(page, 'Gritar e bater no peito');
    await page.locator('.rolagem-seguir').click({ timeout: 10_000 });
  },
  lutar: async (page) => {
    await escolher(page, 'enfrentá-lo');
    await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('batalha');
    await f(page, 'setPvInimigo', 1);
    for (let i = 0; i < 8; i++) {
      await vezDoHeroi(page);
      if ((await st(page)).fim || (await page.locator('.batalha-continuar').isVisible())) break;
      await f(page, 'forceRoll', [19, 19, 19]);
      await page.locator('[data-comando="bicuda"]').click();
      if (await page.locator('.batalha-alvo').count()) await page.locator('.batalha-alvo').first().click();
      await page.waitForTimeout(1500);
      if (await page.locator('.batalha-continuar').isVisible()) break;
    }
    await page.locator('.batalha-continuar').click({ timeout: 20_000 });
    await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('mapa');
  },
  // Derrota: o Gerulf salva o herói, que fica com a flag `machucado`.
  machucado: async (page) => {
    await escolher(page, 'enfrentá-lo');
    await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('batalha');
    await expect.poll(async () => ((await st(page)).ordem ?? []).length, { timeout: 20_000 }).toBeGreaterThan(0);
    await f(page, 'setPv', 1);
    await f(page, 'forceRoll', [18, 18]);
    await expect.poll(async () => {
      const s = await st(page);
      if (s.fim) return s.fim;
      // O revide do Aguardar não pode vencer: o Mirtilo fica com PV de sobra até acertar.
      await f(page, 'setPvInimigo', 99);
      const aguardar = page.locator('[data-comando="aguardar"]');
      if (s.vez === 'heroi' && (await aguardar.isEnabled().catch(() => false))) await aguardar.click().catch(() => {});
      return null;
    }, { timeout: 60_000, intervals: [300] }).toBe('derrota');
    await page.locator('.batalha-continuar').click({ timeout: 20_000 }).catch(() => {});
    await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('mapa');
  },
};

for (const [nome, caminho] of Object.entries(CAMINHOS)) {
  test(`Aylin (${nome}): a escolta termina com o herói no controle, a câmera seguindo e a subida liberada`, async ({ page }, info) => {
    test.setTimeout(420_000);
    await semear(page, { campanha: MAPA() });
    await noMapa(page);
    await f(page, 'teleport', M(875), M(320));
    await expect.poll(async () => (await st(page)).cena, { timeout: 15_000 }).toBe('c01-pensamentos');
    await caminho(page);
    await escolher(page, 'impossível');
    await escolher(page, 'Levar a Aylin para casa');
    await expect.poll(async () => (await st(page)).palco, { timeout: 15_000 }).toBe(false);
    let s = await st(page);
    if (nome === 'machucado') expect(s.flags).toContain('machucado');
    // A Aylin nasce junto do herói (não do outro lado da vila, onde a conversa começou)
    expect(s.seguidores.map((x: { id: string }) => x.id)).toEqual(['aylin']);
    expect(Math.hypot(s.seguidores[0].x - s.heroi.x, s.seguidores[0].y - s.heroi.y)).toBeLessThan(60);
    expect(s.controle).toBe(true);
    // Leva a Aylin até a porta: caminho até perto e o último passo com a seta segurada (entrada real)
    await f(page, 'walkTo', M(1206), M(246));
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => (await st(page)).cena, { timeout: 10_000 }).toBe('c01-aylin-casa');
    await ateTexto(page, 'a Nyme fica longe de você!');
    await page.keyboard.up('ArrowUp');
    await fecharConversa(page);
    s = await st(page);
    expect(s.flags).toContain('aylin_em_casa');
    expect(s.seguidores).toEqual([]);
    expect(s.controle).toBe(true);
    expect(s.cameraSegue).toBe(true);
    expect(s.fora).toBe(false);
    // Ponto de retorno da cena (JSON do mapa → retornos)
    expect(Math.round(s.heroi.x)).toBe(M(1206));
    expect(Math.round(s.heroi.y)).toBe(M(258));
    // Anda livre e a câmera vai junto; ninguém mais mexe no herói sozinho
    await page.waitForTimeout(1200);
    const parado = (await st(page)).heroi;
    expect(Math.hypot(parado.x - s.heroi.x, parado.y - s.heroi.y)).toBeLessThan(1);
    await page.keyboard.down('ArrowDown');
    await expect.poll(async () => (await st(page)).heroi.y, { timeout: 15_000 }).toBeGreaterThan(parado.y + 20);
    await page.keyboard.up('ArrowDown');
    const depois = await st(page);
    expect(depois.cameraSegue).toBe(true);
    await expect.poll(async () => (await st(page)).heroiNaTela, { timeout: 10_000 }).toBe(true);
    await foto(page, info.project.name, `aylin-${nome}-controle`);
    // Subida do templo liberada
    await f(page, 'teleport', M(850), M(176));
    await expect.poll(async () => (await st(page)).cena, { timeout: 10_000 }).toBe('c01-caminho');
  });
}

test('vigia: herói jogado para fora do mapa volta sozinho; "Destravar personagem" tira o herói de dentro de uma casa', async ({ page }) => {
  test.setTimeout(240_000);
  await semear(page, { campanha: MAPA({ flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_em_casa'] }) });
  await noMapa(page);
  await f(page, 'teleport', M(-300), M(-300));
  await expect.poll(async () => { const s = await st(page); return s.fora === false && s.resgates >= 1; }, { timeout: 8000 }).toBe(true);
  let s = await st(page);
  expect(s.heroi.x).toBeGreaterThan(0);
  expect(s.heroi.y).toBeGreaterThan(0);
  expect(s.controle).toBe(true);
  expect(s.cameraSegue).toBe(true);
  // Dentro da casa da curandeira (colisão), com o menu aberto antes do vigia agir
  await f(page, 'teleport', M(300), M(120));
  await page.locator('.btn-pausa').click();
  await expect(page.locator('.btn-destravar')).toBeVisible();
  await page.getByRole('button', { name: 'Destravar personagem' }).click();
  await expect(page.locator('.modal-fundo')).toHaveCount(0);
  await expect.poll(async () => (await st(page)).fora, { timeout: 5000 }).toBe(false);
  s = await st(page);
  expect(s.controle).toBe(true);
  expect(s.cameraSegue).toBe(true);
  expect(Math.hypot(s.heroi.x - M(300), s.heroi.y - M(120))).toBeLessThan(M(150));
});

/* ======================================================================
   4. Intro de Füllmun: vila + herói
   ====================================================================== */

const ORIGENS: Record<string, string> = {
  estudioso: 'Suas noites são de livros e mapas antigos.',
  religioso: 'Mesmo atrasado, você nunca deixa de saudar o sol de Sólem.',
  campones: 'Você conhece cada bicho da vila pelo nome.',
  curandeiro: 'As ervas das colinas já fecharam mais de um corte pelas suas mãos.',
  guarda: 'Bran e Liessa te ensinaram a reparar em tudo. Você nunca perdeu o costume.',
};

async function abrirIntro(page: Page) {
  await page.goto('./?test=1&tela=intro-fullmun');
  await page.locator('.loading-comecar').click({ timeout: 90_000 });
  await expect.poll(async () => (await st(page)).tela, { timeout: 20_000 }).toBe('introFullmun');
}
async function irParaFrase(page: Page, n: number) {
  await expect.poll(async () => {
    const s = await st(page);
    if (s.frase >= n) return s.frase;
    // Estado vazio (tela em troca, máquina lenta): não avança às cegas, senão pula a intro inteira.
    if (s.tela === 'introFullmun' && typeof s.frase === 'number') await f(page, 'avancar');
    return s.frase;
  }, { timeout: 60_000, intervals: [550] }).toBe(n);
  await expect.poll(async () => (await st(page)).completa, { timeout: 10_000 }).toBe(true);
}

test('intro: 11 passos, nome e gênero, nomes em dourado, bustos, Compêndio sem aviso e texto centralizado', async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, { sonhoConcluido: false, heroi: { nome: 'Mirena', genero: 'f', origem: 'religioso' } });
  await abrirIntro(page);
  await expect.poll(async () => (await st(page)).completa, { timeout: 10_000 }).toBe(true);
  let s = await st(page);
  // A frase 1 avança sozinha depois de 8 s: numa máquina lenta, o teste pode chegar já na 2.
  expect(s.frase).toBeLessThanOrEqual(2);
  expect(s.total).toBe(11);
  expect(s.bloco).toBe(1);
  expect(s.texto).toContain('Füllmun é um vilarejo pequeno');
  expect(s.destaques).toEqual(['Füllmun']);
  await expect(page.locator('.intro-fullmun-toque.visivel')).toBeVisible();
  // Texto centralizado (horizontal e vertical). Celular deitado (Fase 5): imagem à esquerda, então o texto
  // fica centrado na coluna da direita.
  const vp = page.viewportSize()!;
  const caixa = (await page.locator('.intro-fullmun-frase').boundingBox())!;
  const deitado = vp.width > vp.height && vp.height <= 500;
  const coluna = deitado ? (await page.locator('.intro-fullmun-centro').boundingBox())! : { x: 0, width: vp.width };
  if (deitado) expect(caixa.x).toBeGreaterThanOrEqual(vp.width * 0.5);
  expect(Math.abs(caixa.x + caixa.width / 2 - (coluna.x + coluna.width / 2))).toBeLessThan(vp.width * 0.03);
  expect(Math.abs(caixa.y + caixa.height / 2 - vp.height / 2)).toBeLessThan(vp.height * 0.12);
  const estilo = await page.locator('.intro-fullmun-destaque, .intro-fullmun-frase .destaque').first().evaluate((e) => getComputedStyle(e).color);
  expect(estilo).toBe('rgb(240, 200, 96)');
  await foto(page, info.project.name, 'intro-bloco1');
  // Avanço automático depois de 8 s
  await expect.poll(async () => (await st(page)).frase, { timeout: 12_000, intervals: [500] }).toBeGreaterThanOrEqual(2);

  await irParaFrase(page, 5);
  s = await st(page);
  expect(s.bloco).toBe(2);
  expect(s.texto).toContain('foi acolhida por Bran e Liessa');
  expect(s.destaques).toEqual(['Füllmun', 'Mirena']);
  await irParaFrase(page, 6);
  s = await st(page);
  expect(s.busto).toBe('artho');
  expect(s.destaques).toEqual(['Artho', 'Sólem']);
  expect(s.compendio).toContain('artho');
  await expect(page.locator('.intro-fullmun-busto.visivel')).toBeVisible();
  await page.waitForTimeout(1100);
  await foto(page, info.project.name, 'intro-bloco2-artho');
  await irParaFrase(page, 7);
  s = await st(page);
  expect(s.texto).toContain('você é conhecida por duas coisas: chegar sempre atrasada… e fazer perguntas demais.');
  expect(s.texto).toContain('Mesmo atrasada, você nunca deixa de saudar o sol de Sólem.');
  expect(s.busto).toBeNull();
  await irParaFrase(page, 8);
  expect((await st(page)).destaques).toEqual(['alçapão', 'Artho']);
  await irParaFrase(page, 9);
  s = await st(page);
  expect(s.busto).toBe('nyme');
  expect(s.compendio).toContain('nyme');
  await irParaFrase(page, 11);
  s = await st(page);
  expect(s.texto).toBe('Naquela noite, você foi dormir tarde, entre livros sobre deuses antigos. E sonhou.');
  // O Compêndio foi liberado sem aviso
  expect(s.toasts.filter((t: string) => t.includes('Compêndio'))).toEqual([]);
  // Último toque: fade para o branco e o sonho
  await page.locator('.tela-intro-fullmun').click({ position: { x: 30, y: 200 } });
  await expect(page.locator('.tela-sonho')).toBeVisible({ timeout: 20_000 });
});

for (const [origem, linha] of Object.entries(ORIGENS)) {
  test(`intro: a frase 7 traz a linha da origem ${origem}`, async ({ page }) => {
    test.setTimeout(180_000);
    await semear(page, { sonhoConcluido: false, heroi: { origem } });
    await abrirIntro(page);
    await irParaFrase(page, 7);
    const s = await st(page);
    expect(s.texto).toContain('você é conhecido por duas coisas: chegar sempre atrasado…');
    expect(s.texto).toContain(linha);
  });
}

test('intro no computador (1366×768): bloco 1 e bloco 2 com o busto ao lado do texto', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel-7', 'uma vez só, em tela de computador');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await semear(page, { sonhoConcluido: false });
  await abrirIntro(page);
  await expect.poll(async () => (await st(page)).completa, { timeout: 10_000 }).toBe(true);
  await foto(page, 'desktop', 'intro-bloco1');
  await irParaFrase(page, 9);
  await page.waitForTimeout(1100);
  const busto = (await page.locator('.intro-fullmun-busto').boundingBox())!;
  const frase = (await page.locator('.intro-fullmun-frase').boundingBox())!;
  expect(busto.x + busto.width).toBeLessThanOrEqual(frase.x + 1); // ao lado, à esquerda do texto
  await foto(page, 'desktop', 'intro-bloco2-nyme');
});

/* ======================================================================
   5. Tutorial
   ====================================================================== */

test('tutorial: a pergunta só aparece no primeiro Novo Jogo; com "Sim" a dica da criação aparece uma vez', async ({ page }, info) => {
  test.setTimeout(180_000);
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Novo Jogo' }).click();
  const pergunta = page.locator('.pergunta-tutorial');
  await expect(pergunta).toBeVisible();
  await expect(pergunta).toContainText('Primeira vez em Icarus?');
  for (const b of await pergunta.locator('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.waitForTimeout(400);
  await foto(page, info.project.name, 'tutorial-pergunta');
  await page.getByRole('button', { name: 'Sim, quero as dicas' }).click();
  await expect(page.locator('.dica-tutorial[data-dica="criacao"]')).toBeVisible();
  expect(await page.locator('.dica-tutorial').count()).toBe(1);
  expect((await opcoes(page)).tutorial).toBe(true);
  await page.locator('.dica-ok').click();
  await expect(page.locator('.dica-tutorial')).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.locator('.tela-menu')).toBeVisible();
  // Segundo Novo Jogo: sem pergunta e sem a dica já vista
  await page.getByRole('button', { name: 'Novo Jogo' }).click();
  await expect(page.locator('.tela-criacao')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(pergunta).toHaveCount(0);
  await expect(page.locator('.dica-tutorial')).toHaveCount(0);
});

test('tutorial: com "Não", nenhuma dica aparece', async ({ page }) => {
  test.setTimeout(240_000);
  await irAteMenu(page, './?test=1');
  await novoJogo(page, false);
  expect((await opcoes(page)).tutorial).toBe(false);
  await page.waitForTimeout(1200);
  await expect(page.locator('.dica-tutorial')).toHaveCount(0);
});

test('tutorial: no mapa as dicas vêm uma por vez, em fila, com o jogo parado, e não voltam', async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, { campanha: MAPA({ flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_em_casa'] }), config: { tutorial: true, ajudaFullmunVista: true, dicasVistas: [] } });
  await noMapa(page);
  const vistas: string[] = [];
  for (let i = 0; i < 6; i++) {
    const aberta = page.locator('.dica-tutorial:not(.saindo)');
    if (!(await aberta.isVisible().catch(() => false))) {
      try { await expect(aberta).toBeVisible({ timeout: 3000 }); } catch { break; }
    }
    expect(await page.locator('.dica-tutorial:not(.saindo)').count()).toBe(1);
    const id = (await aberta.getAttribute('data-dica'))!;
    vistas.push(id);
    if (i === 0) {
      // Com a dica aberta o mapa fica parado
      const antes = (await st(page)).heroi;
      await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowLeft');
      const depois = (await st(page)).heroi;
      expect(Math.hypot(depois.x - antes.x, depois.y - antes.y)).toBeLessThan(1);
      await foto(page, info.project.name, `tutorial-dica-${id}`);
    }
    await page.locator('.dica-ok').click();
  }
  expect(vistas.slice(0, 2)).toEqual(['menu', 'salvar']);
  expect(new Set(vistas).size).toBe(vistas.length);
  expect(vistas).not.toContain('relogio');
  expect(vistas).not.toContain('missao');
  // Voltando ao mapa: nenhuma se repete
  await page.locator('.btn-pausa').click();
  await page.getByRole('button', { name: 'Voltar ao menu' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.pronto; }, { timeout: 40_000 }).toBe(true);
  await page.waitForTimeout(2500);
  for (const id of ['menu', 'salvar']) await expect(page.locator(`.dica-tutorial[data-dica="${id}"]`)).toHaveCount(0);
});

test('tutorial: "Pular todas as dicas" desliga o tutorial', async ({ page }) => {
  test.setTimeout(180_000);
  await semear(page, { campanha: MAPA({ flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_em_casa'] }), config: { tutorial: true, ajudaFullmunVista: true, dicasVistas: [] } });
  await noMapa(page);
  await expect(page.locator('.dica-tutorial')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Pular todas as dicas' }).click();
  await expect(page.locator('.dica-tutorial')).toHaveCount(0);
  expect((await opcoes(page)).tutorial).toBe(false);
  await page.waitForTimeout(2000);
  await expect(page.locator('.dica-tutorial')).toHaveCount(0);
  expect((await st(page)).controle).toBe(true);
});

test('tutorial: Opções têm o interruptor de dicas, "Rever todas as dicas" e a versão do jogo', async ({ page }) => {
  await semear(page, { config: { tutorial: true, ajudaFullmunVista: true, dicasVistas: ['menu', 'salvar', 'andar'] } });
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Opções' }).click();
  await expect(page.locator('#opcao-dicas')).toBeChecked();
  await page.getByRole('button', { name: 'Rever todas as dicas' }).click();
  await expect(page.locator('.opcao-aviso')).toHaveText('Pronto: as dicas vão aparecer de novo.');
  expect((await opcoes(page)).dicasVistas).toEqual([]);
  await expect(page.locator('.opcoes-versao')).toHaveText(/^versão ([0-9a-f]{7}|dev)$/);
  await page.locator('label[for="opcao-dicas"]').click();
  expect((await opcoes(page)).tutorial).toBe(false);
});

test('tutorial: dica de andar no sonho, com seta para o controle', async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, { sonhoConcluido: false, config: soDicas('andar') });
  await continuar(page);
  await expect(page.locator('.dica-tutorial[data-dica="andar"]')).toBeVisible({ timeout: 40_000 });
  if (await page.locator('.joystick:not([hidden])').isVisible()) await expect(page.locator('.dica-seta')).toBeVisible();
  await page.waitForTimeout(400);
  await foto(page, info.project.name, 'tutorial-dica-andar');
  await page.locator('.dica-ok').click();
  await expect(page.locator('.dica-tutorial')).toHaveCount(0);
});

test('tutorial: dicas do primeiro teste e da primeira batalha', async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, { campanha: { cena: 'c01-grito', modo: 'escolhas', local: { tela: 'capitulo' } }, config: soDicas('teste', 'batalha-turnos') });
  await continuar(page);
  await expect.poll(async () => ((await st(page)).escolhas ?? []).some((e: string) => e.includes('Gritar e bater no peito')), { timeout: 45_000 }).toBe(true);
  await f(page, 'forceRoll', [1]);
  await escolher(page, 'Gritar e bater no peito');
  await expect(page.locator('.dica-tutorial[data-dica="teste"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.dica-tutorial')).toContainText('Um teste é d20 + seus bônus.');
  await page.waitForTimeout(300);
  await foto(page, info.project.name, 'tutorial-dica-teste');
  await page.locator('.dica-ok').click();
  await page.locator('.rolagem-seguir').click({ timeout: 10_000 });
  // Intimidação falhou: o Mirtilo enfurecido parte para a luta
  await escolher(page, 'Enfrentar o Mirtilo');
  await expect(page.locator('.dica-tutorial[data-dica="batalha-turnos"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.dica-tutorial')).toContainText('A ordem dos turnos sai da Iniciativa: d20 + Destreza.');
  await page.waitForTimeout(400);
  await foto(page, info.project.name, 'tutorial-dica-batalha');
  await page.locator('.dica-ok').click();
});

test('batalha: segurar um comando mostra a ajuda de uma linha e não executa o comando', async ({ page }) => {
  test.setTimeout(180_000);
  await semear(page, { campanha: { cena: 'c01-grito', modo: 'escolhas', local: { tela: 'capitulo' } } });
  await continuar(page);
  await page.locator('.cena-escolha', { hasText: 'enfrentá-lo' }).click({ timeout: 30_000 });
  await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('batalha');
  const bicuda = page.locator('[data-comando="bicuda"]');
  await expect(bicuda).toBeVisible({ timeout: 20_000 });
  await bicuda.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7, isPrimary: true });
  await expect(page.locator('.batalha-cmd-ajuda')).toHaveText('Ataque básico: d20 + Luta contra a Defesa do alvo.', { timeout: 3000 });
  await bicuda.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7, isPrimary: true });
  await bicuda.dispatchEvent('click');
  await page.waitForTimeout(500);
  expect(((await st(page)).log as string[]).some((l) => l.startsWith('Bicuda'))).toBe(false);
  // Mouse em cima: a mesma ajuda
  await page.locator('[data-comando="aguardar"]').dispatchEvent('pointerenter', { pointerType: 'mouse' });
  await expect(page.locator('.batalha-cmd-ajuda')).toContainText('Prepara uma Bicuda');
});

/* ======================================================================
   6. Ajuda de Füllmun
   ====================================================================== */

for (const tutorial of [true, false]) {
  test(`ajuda de Füllmun (dicas ${tutorial ? 'ligadas' : 'desligadas'}): aparece na primeira entrada, não na segunda e volta pelo menu`, async ({ page }, info) => {
    test.setTimeout(240_000);
    await semear(page, { campanha: MAPA({ flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_em_casa'] }), config: { tutorial, ajudaFullmunVista: false, dicasVistas: [] } });
    await noMapa(page);
    const ajuda = page.locator('.ajuda-fullmun');
    await expect(ajuda).toBeVisible({ timeout: 10_000 });
    await expect(ajuda).toContainText('Füllmun desperta');
    await expect(ajuda.locator('.ajuda-fullmun-item')).toHaveCount(6);
    await expect(page.locator('.dica-tutorial')).toHaveCount(0);
    // "Entendi" sempre visível, com pelo menos 44 px
    const vp = page.viewportSize()!;
    const b = (await page.locator('.ajuda-entendi').boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
    // Jogo pausado
    const antes = (await st(page)).heroi;
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowLeft');
    expect((await st(page)).heroi.x).toBeCloseTo(antes.x, 0);
    await page.waitForTimeout(300);
    if (tutorial) await foto(page, info.project.name, 'ajuda-fullmun');
    await page.getByRole('button', { name: 'Entendi' }).first().click();
    await expect(ajuda).toHaveCount(0);
    expect((await opcoes(page)).ajudaFullmunVista).toBe(true);
    // As dicas de missão e relógio nunca aparecem (a ajuda já cobre)
    for (let i = 0; i < 5 && (await page.locator(DICA_OK).isVisible({ timeout: 2000 }).catch(() => false)); i++) {
      expect(['missao', 'relogio']).not.toContain(await page.locator('.dica-tutorial:not(.saindo)').getAttribute('data-dica'));
      await page.locator(DICA_OK).click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
    // Segunda entrada: não aparece sozinha
    await page.locator('.btn-pausa').click();
    await page.getByRole('button', { name: 'Voltar ao menu' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.pronto; }, { timeout: 40_000 }).toBe(true);
    await page.waitForTimeout(2000);
    await expect(ajuda).toHaveCount(0);
    // Pelo menu de pausa
    await page.locator('.btn-pausa').click();
    await page.getByRole('button', { name: 'Ajuda: tarefas de Füllmun' }).click();
    await expect(ajuda).toBeVisible();
    await page.getByRole('button', { name: 'Ver de novo depois' }).click();
    await expect(ajuda).toHaveCount(0);
    expect((await st(page)).controle).toBe(true);
  });
}
