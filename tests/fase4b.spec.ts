import { expect, test, type Page } from '@playwright/test';
import { avancar, irAteMenu } from './ajudantes';
/** Füllmun passou a ter 2400 px de largura (Fase 5): coordenadas do mapa antigo → novas. */
const M = (v: number) => Math.round((v * 2400) / 1672);

/* Fase 4B: bustos dos heróis, expressões de NPC e saves (1 automático + 2 manuais). */

type Estado = Record<string, any>;
type Slot = 'auto' | 'manual1' | 'manual2';
const HEROI = {
  nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones',
  atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
  atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
  classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
};

/** Save antigo (chave única de antes da Fase 4B): a migração o transforma no slot automático. */
function semear(page: Page, campanha: Record<string, unknown>, heroi: Record<string, unknown> = {}) {
  return page.addInitScript((op) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1, versaoSave: 4,
      config: { musica: 0.7, efeitos: 0.8, mudo: false, ajudaFullmunVista: true },
      personagem: { ...op.heroi, ...op.extra },
      sonho: { concluido: true, ouvidas: ['solem', 'justar', 'irae'] },
      campanha: { capitulo: 1, cena: null, modo: 'falas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null, ...op.campanha },
    }));
  }, { campanha, heroi: HEROI, extra: heroi });
}

/** Um save já no formato dos slots (para montar cenários de Continuar, Carregar e cópia). */
function registro(o: { nome: string; salvoEm: string; tipo?: 'auto' | 'manual'; capitulo?: number; local?: string; tempo?: number; raca?: string; genero?: string; campanha?: Record<string, unknown> }) {
  const personagem = { ...HEROI, nome: o.nome, raca: o.raca ?? HEROI.raca, genero: o.genero ?? HEROI.genero };
  return {
    formato: 'forja-do-heroi-save', versaoSave: 5,
    meta: {
      nomeHeroi: o.nome, raca: personagem.raca, variante: null, genero: personagem.genero, classe: 'arcanista',
      capitulo: o.capitulo ?? 1, local: o.local ?? 'Füllmun', tempoDeJogo: o.tempo ?? 600, salvoEm: o.salvoEm, tipo: o.tipo ?? 'manual', versaoSave: 5,
    },
    jogo: {
      personagem, sonho: { concluido: true, ouvidas: ['solem'] },
      campanha: { capitulo: o.capitulo ?? 1, cena: 'c01-soleira', modo: 'escolhas', local: { tela: 'capitulo' }, ...o.campanha },
      tempoDeJogo: o.tempo ?? 600,
    },
  };
}
/** Grava os slots direto (string = conteúdo cru, para o save corrompido). */
function semearSlots(page: Page, slots: Partial<Record<Slot, unknown>>) {
  return page.addInitScript((s) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    for (const [k, v] of Object.entries(s)) localStorage.setItem(`fdg.save.${k}`, typeof v === 'string' ? v : JSON.stringify(v));
    // A ajuda de Füllmun (Fase 4D) já foi vista: estes testes são dos saves.
    if (!localStorage.getItem('fdg.opcoes')) localStorage.setItem('fdg.opcoes', JSON.stringify({ musica: 0.7, efeitos: 0.8, mudo: false, ajudaFullmunVista: true }));
  }, slots);
}
const diasAtras = (n: number, h = 15) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 20, 0, 0); return d.toISOString(); };

const st = (page: Page): Promise<Estado> => page.evaluate(() => (window as unknown as { __fdg?: { state(): Estado } }).__fdg?.state() ?? {});
const f = (page: Page, m: string, ...args: unknown[]) =>
  page.evaluate(([mm, aa]) => (window as unknown as { __fdg?: Record<string, (...x: unknown[]) => unknown> }).__fdg?.[mm as string]?.(...(aa as unknown[])), [m, args] as const);
const saves = async (page: Page): Promise<Estado[]> => (await f(page, 'saves')) as Estado[];
const slotCru = (page: Page, s: Slot) => page.evaluate((k) => localStorage.getItem(`fdg.save.${k}`), s);
const foto = (page: Page, projeto: string, nome: string) => page.screenshot({ path: `tests/screenshots/${projeto}-fase4b-${nome}.png` });

async function continuar(page: Page) {
  await irAteMenu(page, './?test=1');
  await page.locator('.btn-continuar').click();
}
async function noMapa(page: Page, mapa: string) {
  await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.mapa === mapa && s.pronto; }, { timeout: 90_000 }).toBe(true);
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
async function escolher(page: Page, texto: string) {
  await expect.poll(async () => {
    const s = await st(page);
    const lista: string[] = s.escolhas ?? [];
    if (lista.some((e) => e.includes(texto))) return true;
    if (!lista.length && !s.digitando) await f(page, 'avancar');
    return false;
  }, { timeout: 45_000, intervals: [200] }).toBe(true);
  await page.locator('.cena-escolha', { hasText: texto }).first().click();
}
const carregada = (page: Page, sel: string) => page.locator(sel).evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0);
const card = (page: Page, s: Slot) => page.locator(`.save-card[data-slot="${s}"]`);

/* ------------------------------------------------ bustos ------------------------------------------------ */

test('bustos: a fala do herói mostra o busto certo nas 8 combinações de raça e gênero', async ({ page }) => {
  test.setTimeout(420_000);
  await semear(page, { cena: 'c01-aylin', modo: 'falas' });
  // Troca o herói no slot automático antes do jogo carregar (a página anterior pode gravar ao sair).
  await page.addInitScript(() => {
    const c = sessionStorage.getItem('combo');
    if (!c) return;
    sessionStorage.removeItem('combo');
    const [r, g] = c.split(',');
    const a = JSON.parse(localStorage.getItem('fdg.save.auto')!);
    Object.assign(a.jogo.personagem, { raca: r, genero: g, variante: r === 'azakar' ? 'sombra' : null });
    Object.assign(a.jogo.campanha, { cena: 'c01-aylin', modo: 'falas', local: { tela: 'capitulo' } });
    localStorage.setItem('fdg.save.auto', JSON.stringify(a));
  });
  // A primeira é a do save semeado (Ayoran homem); as outras entram trocando o herói antes de cada carga.
  const combinacoes = [['ayoran', 'm'], ['ayoran', 'f'], ['arake', 'm'], ['arake', 'f'], ['azakar', 'm'], ['azakar', 'f'], ['nyashi', 'm'], ['nyashi', 'f']];
  for (const [i, [raca, genero]] of combinacoes.entries()) {
    if (i > 0) await page.evaluate((c) => sessionStorage.setItem('combo', c), `${raca},${genero}`);
    await continuar(page);
    await ateTexto(page, 'Você está bem?');
    const heroi = page.locator('.cena-busto-heroi');
    await expect(heroi).toBeVisible();
    await expect(heroi).toHaveAttribute('data-retrato', `img/retratos/heroi-${raca}-${genero}.webp`);
    await expect.poll(() => carregada(page, '.cena-busto-heroi')).toBe(true);
    await expect(heroi).not.toHaveClass(/apagado/);
    await expect(page.locator('.cena-caixa.heroi .cena-nome')).toHaveText('Thaelion');
  }
});

test('conversa: NPC à esquerda escurecido quando o herói fala, herói à direita; pausa com o busto do herói', async ({ page }, info) => {
  await semear(page, { capitulo: 2, cena: 'c02-artho', modo: 'escolhas', flags: ['nyme_seguindo'], local: { tela: 'mapa', mapa: 'templo-biblioteca' } });
  await continuar(page);
  await noMapa(page, 'templo-biblioteca');
  await f(page, 'goto', 't-estante-2');
  await ateTexto(page, 'Um porco azul fugiu do chiqueiro');
  const npc = page.locator('.cena-busto');
  const heroi = page.locator('.cena-busto-heroi');
  await expect(npc).toBeVisible();
  await expect(npc).toHaveAttribute('data-retrato', 'img/retratos/npc-nyme.webp');
  await expect(npc).toHaveClass(/apagado/);
  await expect(heroi).toBeVisible();
  await expect(heroi).not.toHaveClass(/apagado/);
  expect(await npc.evaluate((e) => getComputedStyle(e).filter)).toContain('brightness(0.5)');
  // NPC à esquerda, herói à direita, cada um com no máximo 30% da largura
  const [bn, bh, bp] = [await npc.boundingBox(), await heroi.boundingBox(), await page.locator('.cena-bustos').boundingBox()];
  expect(bn!.x + bn!.width / 2).toBeLessThan(bh!.x + bh!.width / 2);
  expect(bh!.width).toBeLessThanOrEqual(bp!.width * 0.3 + 1);
  await page.waitForTimeout(500);
  await foto(page, info.project.name, 'conversa-dois-bustos');
  if (info.project.name === 'pixel-7') {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'tests/screenshots/desktop-fase4b-conversa-dois-bustos.png' });
  }
});

test('menu de pausa: busto pequeno, nome, raça, classe e PV', async ({ page }, info) => {
  await semear(page, { cena: 'c01-aylin', modo: 'falas', pvAtual: 9 });
  await continuar(page);
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c01-aylin');
  await page.locator('.cena-btn-pausa').click();
  await expect(page.locator('.pausa-busto')).toHaveAttribute('data-retrato', /img\/retratos\/heroi-ayoran-m\.webp$/);
  await expect.poll(() => carregada(page, '.pausa-busto')).toBe(true);
  await expect(page.locator('.pausa-nome')).toHaveText('Thaelion');
  await expect(page.locator('.pausa-linha')).toHaveText('Ayoran · Arcanista (Mago) · PV 9/12');
  // O botão de tela cheia (Fase 5) é contado à parte: só existe onde o navegador permite (não no iPhone).
  const nomes = await page.locator('.pausa-botoes > .btn:not(.btn-tela-cheia)').allTextContents();
  const telaCheia = await page.locator('.pausa-botoes > .btn-tela-cheia').count();
  expect(telaCheia).toBe(await page.evaluate(() => (/iPhone|iPad/.test(navigator.userAgent) || !document.fullscreenEnabled ? 0 : 1)));
  expect(nomes.map((n) => n.trim())).toEqual(['Continuar', 'Salvar', 'Itens', 'Caderno', 'Compêndio', 'Diário', 'Opções', 'Voltar ao menu']);
  await foto(page, info.project.name, 'pausa');
});

/* ------------------------------------------------ expressões ------------------------------------------------ */

test('expressão: a Aylin chora em C01-05 e em C01-07, volta ao normal (crossfade) e chora de novo no "É poeira"', async ({ page }, info) => {
  // "machucado": a fala do "sangrando!" vem logo depois do choro (troca direta de expressão).
  await semear(page, { cena: 'c01-grito', modo: 'falas', flags: ['machucado'] });
  await continuar(page);
  await ateTexto(page, 'Me ajuda!');
  await expect(page.locator('.cena-busto')).toHaveAttribute('data-retrato', 'img/retratos/npc-aylin-chorando.webp');
  await expect.poll(() => carregada(page, '.cena-busto')).toBe(true);
  await page.waitForTimeout(400);
  await foto(page, info.project.name, 'aylin-chorando');
  await f(page, 'goto', 'c01-aylin');
  await ateTexto(page, 'Agora estou, sim');
  await expect(page.locator('.cena-busto')).toHaveAttribute('data-retrato', 'img/retratos/npc-aylin-chorando.webp');
  // Fala seguinte: busto normal (crossfade de 150 ms; a camada de troca some no fim)
  await ateTexto(page, 'sangrando!');
  await expect(page.locator('.cena-busto')).toHaveAttribute('data-retrato', 'img/retratos/npc-aylin.webp');
  await expect(page.locator('.cena-busto-troca')).toBeHidden();
  await escolher(page, 'Chorando por causa de um porco');
  await ateTexto(page, 'Não tô chorando!');
  await expect(page.locator('.cena-busto')).toHaveAttribute('data-retrato', 'img/retratos/npc-aylin-chorando.webp');
  // O Compêndio continua com o busto normal da Aylin
  await page.locator('.cena-btn-pausa').click();
  await page.locator('.btn-compendio').click();
  await page.locator('[data-ficha="aylin"]').click();
  await expect(page.locator('.compendio-ficha .ficha-busto')).toHaveAttribute('data-retrato', /npc-aylin\.webp$/);
});

test('expressão inexistente cai no busto normal, sem erro', async ({ page }) => {
  await page.route('**/img/retratos/npc-aylin-chorando.webp', (r) => r.fulfill({ status: 404, body: '' }));
  await semear(page, { cena: 'c01-grito', modo: 'falas' });
  await continuar(page);
  await ateTexto(page, 'Me ajuda!');
  await expect(page.locator('.cena-busto')).toHaveAttribute('data-retrato', 'img/retratos/npc-aylin.webp');
  await expect.poll(() => carregada(page, '.cena-busto')).toBe(true);
});

/* ------------------------------------------------ saves ------------------------------------------------ */

test('salvar manual no mapa: Manual 1 guarda a posição exata; o autosave segue sem mexer nos manuais', async ({ page }, info) => {
  await semear(page, { cena: 'c01-soleira', modo: 'escolhas', local: { tela: 'mapa', mapa: 'fullmun' } });
  await continuar(page);
  await noMapa(page, 'fullmun');
  // Ponto livre na praça (no mapa novo, M(640, 520) cai dentro dos pés da barraca vermelha).
  await f(page, 'teleport', M(640), 700);
  const pos = (await st(page)).heroi;
  await page.locator('.btn-pausa').click();
  await page.locator('.btn-salvar').click();
  await expect(card(page, 'auto')).toBeVisible();
  await expect(card(page, 'auto').locator('.save-btn-salvar')).toHaveCount(0);
  await expect(card(page, 'manual1')).toHaveClass(/vazio/);
  await expect(card(page, 'manual1').locator('.save-aviso')).toHaveCount(0); // no mapa não volta ao início de cena nenhuma
  await card(page, 'manual1').locator('.save-btn-salvar').click();
  await expect(page.locator('.toast', { hasText: 'Jogo salvo no Manual 1' })).toBeVisible();
  await expect(card(page, 'manual1')).toHaveClass(/piscando/);
  await expect(card(page, 'manual1')).toContainText('Füllmun — Praça do mercado');
  await expect(card(page, 'manual1')).toContainText('Salvo por você');
  await expect(card(page, 'manual1')).toContainText('MANUAL 1');
  await expect(card(page, 'auto')).toContainText('AUTOMÁTICO');
  await expect(card(page, 'auto')).toContainText('Salvo pelo jogo');
  const m1 = (await saves(page)).find((s) => s.slot === 'manual1')!;
  expect(m1).toMatchObject({ estado: 'ok', tipo: 'manual', nomeHeroi: 'Thaelion', ato: 0, local: 'Füllmun — Praça do mercado', versaoSave: 7 });
  await page.waitForTimeout(600);
  await foto(page, info.project.name, 'tela-salvar');
  await page.locator('.saves-fechar').click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  // Continua jogando: o autosave muda, os manuais não
  const manualAntes = await slotCru(page, 'manual1');
  const autoAntes = await slotCru(page, 'auto');
  await f(page, 'teleport', M(300), M(860));
  await f(page, 'setFlag', 'depois_do_save');
  await expect.poll(() => slotCru(page, 'auto')).not.toBe(autoAntes);
  expect(await slotCru(page, 'manual1')).toBe(manualAntes);
  expect(await slotCru(page, 'manual2')).toBeNull();
  // Menu → Carregar → Manual 1: volta ao ponto exato
  await irAteMenu(page, './?test=1');
  await page.locator('.btn-carregar').click();
  await card(page, 'manual1').locator('.save-btn-carregar').click();
  await noMapa(page, 'fullmun');
  const s = await st(page);
  expect(Math.round(s.heroi.x)).toBe(Math.round(pos.x));
  expect(Math.round(s.heroi.y)).toBe(Math.round(pos.y));
  expect(s.flags).not.toContain('depois_do_save');
});

test('salvar manual numa cena: volta ao início da cena, sem repetir os efeitos de entrada', async ({ page }) => {
  await semear(page, { cena: 'c01-pensamentos', modo: 'falas' });
  await continuar(page);
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c01-pensamentos');
  await f(page, 'goto', 'c01-aylin'); // aoEntrar: Aylin +2 (de 1 para 3)
  await ateTexto(page, 'Agora estou, sim');
  expect((await st(page)).relacoes.aylin).toBe(3);
  await page.locator('.cena-btn-pausa').click();
  await page.locator('.btn-salvar').click();
  await expect(card(page, 'manual2').locator('.save-aviso')).toHaveText('Você vai voltar ao início desta cena.');
  await card(page, 'manual2').locator('.save-btn-salvar').click();
  await expect(page.locator('.toast', { hasText: 'Jogo salvo no Manual 2' })).toBeVisible();
  await page.locator('.saves-fechar').click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await escolher(page, 'Aylin, você é impossível.');
  await expect.poll(async () => (await st(page)).cena, { timeout: 15_000 }).toBe('c01-gerulf');
  await irAteMenu(page, './?test=1');
  await page.locator('.btn-carregar').click();
  await card(page, 'manual2').locator('.save-btn-carregar').click();
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c01-aylin');
  await expect.poll(async () => (await page.locator('.cena-texto').textContent()) ?? '', { timeout: 10_000 }).toContain('Você para ao lado da Aylin');
  expect((await st(page)).relacoes.aylin).toBe(3);
});

test('substituir: salvar por cima de um slot ocupado pede confirmação', async ({ page }, info) => {
  await semearSlots(page, {
    manual1: registro({ nome: 'Thaelion', salvoEm: diasAtras(2), local: 'Füllmun — Praça do mercado', campanha: { local: { tela: 'mapa', mapa: 'fullmun', x: 640, y: 520 } } }),
  });
  await continuar(page);
  await noMapa(page, 'fullmun');
  const antes = await slotCru(page, 'manual1');
  await page.locator('.btn-pausa').click();
  await page.locator('.btn-salvar').click();
  await card(page, 'manual1').locator('.save-btn-salvar').click();
  const pergunta = page.locator('.confirmar-substituir');
  await expect(pergunta).toContainText('Substituir o save de Thaelion · Prólogo · Füllmun — Praça do mercado · salvo há 2 dias?');
  await foto(page, info.project.name, 'confirmar-substituir');
  await pergunta.getByRole('button', { name: 'Cancelar' }).click();
  await expect(pergunta).toHaveCount(0);
  expect(await slotCru(page, 'manual1')).toBe(antes);
  await card(page, 'manual1').locator('.save-btn-salvar').click();
  await page.locator('.confirmar-substituir').getByRole('button', { name: 'Substituir' }).click();
  await expect(page.locator('.toast', { hasText: 'Jogo salvo no Manual 1' })).toBeVisible();
  expect(await slotCru(page, 'manual1')).not.toBe(antes);
  await expect(card(page, 'manual1')).toContainText('hoje');
});

test('batalha: o botão Salvar fica desabilitado, com a dica', async ({ page }) => {
  await semear(page, { cena: 'c01-grito', modo: 'escolhas' });
  await continuar(page);
  await f(page, 'forceRoll', [15, 1]);
  await escolher(page, 'enfrentá-lo');
  await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('batalha');
  await page.locator('.batalha-btn-pausa').click();
  await expect(page.locator('.btn-salvar')).toBeDisabled();
  await expect(page.locator('.pausa-dica')).toHaveText('Não dá para salvar durante uma batalha.');
  expect((await page.locator('.batalha-btn-pausa').boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('Continuar carrega sempre o save mais recente; o menu mostra Continuar e Carregar', async ({ page }, info) => {
  await semearSlots(page, {
    auto: registro({ nome: 'Auto', tipo: 'auto', salvoEm: diasAtras(5) }),
    manual1: registro({ nome: 'Velho', salvoEm: diasAtras(9) }),
    manual2: registro({ nome: 'Recente', salvoEm: diasAtras(3), capitulo: 2, local: 'Templo de Sólem', campanha: { cena: 'c02-artho', modo: 'escolhas' } }),
  });
  await irAteMenu(page, './?test=1');
  await expect(page.locator('.btn-continuar')).toBeVisible();
  await expect(page.locator('.btn-carregar')).toBeVisible();
  await expect(page.locator('.menu-continuar-info')).toHaveText('Recente · Prólogo · há 3 dias'); // o antigo Capítulo 02 é a parte do templo do 01
  const ordem = (await page.locator('.menu-botoes > .btn').allTextContents()).map((t) => t.split('Recente')[0].trim());
  expect(ordem.slice(0, 3)).toEqual(['Continuar', 'Carregar', 'Novo Jogo']);
  await page.waitForTimeout(1500);
  await foto(page, info.project.name, 'menu');
  // Relógio simulado: duas semanas depois
  await f(page, 'setRelogio', new Date(Date.now() + 14 * 86_400_000).toISOString());
  await page.locator('.btn-carregar').click();
  await expect(card(page, 'manual2').locator('.save-data')).toContainText('há 2 semanas');
  await expect(card(page, 'auto').locator('.save-tempo')).toHaveText('10min de jogo');
  await page.locator('.saves-fechar').click();
  await f(page, 'setRelogio', null);
  await page.locator('.btn-continuar').click();
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c02-artho');
  // O antigo Capítulo 02 é a parte do templo do Capítulo 01 (Fase 5C).
  expect((await st(page)).capitulo).toBe(1);
  expect((await st(page)).parte).toBe('templo');
});

test('novo jogo: aviso, desistir mantém o automático, e só o primeiro autosave da aventura nova troca o automático', async ({ page }, info) => {
  test.setTimeout(420_000);
  const auto = registro({ nome: 'Antigo', tipo: 'auto', salvoEm: diasAtras(1) });
  const manual = registro({ nome: 'Guardado', salvoEm: diasAtras(4) });
  await semearSlots(page, { auto, manual1: manual });
  await irAteMenu(page, './?test=1');
  const autoAntes = await slotCru(page, 'auto');
  await page.locator('.btn-novo-jogo').click();
  const aviso = page.locator('.aviso-novo-jogo');
  await expect(aviso).toContainText('Seus saves manuais continuam guardados.');
  await expect(aviso).toContainText('O save automático atual (Antigo, Prólogo) será substituído pela nova aventura.');
  await foto(page, info.project.name, 'aviso-novo-jogo');
  await aviso.getByRole('button', { name: 'Voltar' }).click();
  await expect(aviso).toHaveCount(0);
  await expect(page.locator('.tela-menu')).toBeVisible();
  // Começa e desiste no meio da criação: nada muda
  await page.locator('.btn-novo-jogo').click();
  await page.locator('.aviso-novo-jogo').getByRole('button', { name: 'Começar nova aventura' }).click();
  // Primeira vez: a pergunta do tutorial (Fase 4D); na segunda, não aparece mais.
  await page.locator('.tutorial-nao').click();
  await page.locator('.card-genero', { hasText: 'Mulher' }).click();
  await avancar(page).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.locator('.tela-menu')).toBeVisible();
  expect(await slotCru(page, 'auto')).toBe(autoAntes);
  // Criação completa: o automático passa a ser da aventura nova; o manual continua
  await page.locator('.btn-novo-jogo').click();
  await page.locator('.aviso-novo-jogo').getByRole('button', { name: 'Começar nova aventura' }).click();
  await page.locator('.card-genero', { hasText: 'Mulher' }).click();
  await avancar(page).click();
  await page.locator('.card-raca', { hasText: 'Nyashi' }).click();
  await avancar(page).click();
  await page.locator('.card-origem', { hasText: 'Camponês' }).click();
  await avancar(page).click();
  await page.locator('.card-classe').filter({ has: page.locator('.card-titulo').getByText('Ladina', { exact: true }) }).click();
  await avancar(page).click();
  await page.locator('.campo-nome').fill('Shirra');
  await avancar(page).click();
  for (const [a, n] of Object.entries({ Destreza: 3, Constituição: 2, Sabedoria: 2, Força: 2 }))
    for (let i = 0; i < n; i++) await page.getByRole('button', { name: `Aumentar ${a}` }).click();
  await avancar(page).click();
  expect(await slotCru(page, 'auto')).toBe(autoAntes); // ainda na revisão
  await avancar(page).click();
  await expect.poll(async () => (await saves(page)).find((s) => s.slot === 'auto')?.nomeHeroi, { timeout: 15_000 }).toBe('Shirra');
  const lista = await saves(page);
  expect(lista.find((s) => s.slot === 'manual1')).toMatchObject({ estado: 'ok', nomeHeroi: 'Guardado' });
  expect(lista.find((s) => s.slot === 'auto')).toMatchObject({ tipo: 'auto', ato: 0, local: 'O sonho dos deuses' });
});

test('persistência: recarregar e abrir um navegador novo com o mesmo armazenamento mantêm os 3 saves', async ({ page, browser }, info) => {
  await semearSlots(page, {
    auto: registro({ nome: 'Um', tipo: 'auto', salvoEm: diasAtras(0) }),
    manual1: registro({ nome: 'Dois', salvoEm: diasAtras(1) }),
    manual2: registro({ nome: 'Tres', salvoEm: diasAtras(2) }),
  });
  await irAteMenu(page, './?test=1');
  await page.reload();
  await irAteMenu(page, './?test=1');
  expect((await saves(page)).map((s) => s.nomeHeroi)).toEqual(['Um', 'Dois', 'Tres']);
  const armazenamento = await page.context().storageState();
  const u = info.project.use;
  const ctx = await browser.newContext({
    viewport: u.viewport, screen: u.screen, userAgent: u.userAgent, deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile, hasTouch: u.hasTouch, baseURL: u.baseURL, storageState: armazenamento,
  });
  const nova = await ctx.newPage();
  await irAteMenu(nova, './?test=1');
  expect((await saves(nova)).map((s) => s.nomeHeroi)).toEqual(['Um', 'Dois', 'Tres']);
  await ctx.close();
});

test('save corrompido aparece como "Save danificado", pode ser apagado e não trava o menu', async ({ page }) => {
  await semearSlots(page, { manual1: '{"formato": "forja-do-heroi-save", quebrado', manual2: registro({ nome: 'Inteiro', salvoEm: diasAtras(1) }) });
  await irAteMenu(page, './?test=1');
  await expect(page.locator('.menu-continuar-info')).toContainText('Inteiro');
  await page.locator('.btn-carregar').click();
  await expect(card(page, 'manual1')).toHaveClass(/danificado/);
  await expect(card(page, 'manual1')).toContainText('Save danificado');
  await expect(card(page, 'auto')).toHaveClass(/vazio/);
  await card(page, 'manual1').locator('.save-btn-apagar').click();
  await expect(page.locator('.confirmar-apagar')).toContainText('Apagar este save? Não dá para desfazer.');
  await page.locator('.confirmar-apagar').getByRole('button', { name: 'Apagar' }).click();
  await expect(card(page, 'manual1')).toHaveClass(/vazio/);
  expect(await slotCru(page, 'manual1')).toBeNull();
  await page.locator('.saves-fechar').click();
  await page.getByRole('button', { name: 'Opções' }).click();
  await expect(page.locator('.modal')).toBeVisible();
});

test('cópia de segurança: exportar os 3 slots e importar num navegador limpo (e recusar arquivo inválido)', async ({ page, browser }, info) => {
  await semearSlots(page, {
    auto: registro({ nome: 'Um', tipo: 'auto', salvoEm: diasAtras(0) }),
    manual1: registro({ nome: 'Dois', salvoEm: diasAtras(1) }),
    manual2: registro({ nome: 'Tres', salvoEm: diasAtras(2) }),
  });
  await irAteMenu(page, './?test=1');
  await page.locator('.btn-carregar').click();
  await page.locator('.saves-link').click();
  const [baixado] = await Promise.all([page.waitForEvent('download'), page.locator('.saves-exportar').click()]);
  expect(baixado.suggestedFilename()).toMatch(/^forja-do-heroi-saves-\d{4}-\d{2}-\d{2}\.json$/);
  const arquivo = info.outputPath('copia.json');
  await baixado.saveAs(arquivo);

  const u = info.project.use;
  const ctx = await browser.newContext({ viewport: u.viewport, screen: u.screen, userAgent: u.userAgent, deviceScaleFactor: u.deviceScaleFactor, isMobile: u.isMobile, hasTouch: u.hasTouch, baseURL: u.baseURL });
  const limpa = await ctx.newPage();
  await irAteMenu(limpa, './?test=1');
  await expect(limpa.locator('.btn-continuar')).toHaveCount(0);
  await expect(limpa.locator('.btn-carregar')).toHaveCount(0);
  await limpa.locator('.menu-importar').click();
  // Arquivo inválido: nada muda
  await limpa.locator('.saves-arquivo').setInputFiles({ name: 'errado.json', mimeType: 'application/json', buffer: Buffer.from('{"oi": 1}') });
  await expect(limpa.locator('.saves-erro')).toHaveText('Arquivo de save inválido');
  expect((await saves(limpa)).every((s) => s.estado === 'vazio')).toBe(true);
  // Arquivo exportado: mostra os saves e pergunta antes de substituir
  await limpa.locator('.saves-arquivo').setInputFiles(arquivo);
  const pergunta = limpa.locator('.confirmar-importar');
  await expect(pergunta).toContainText('Substituir os seus saves atuais por estes?');
  await expect(pergunta.locator('.save-card')).toHaveCount(3);
  await pergunta.getByRole('button', { name: 'Substituir' }).click();
  await expect(limpa.locator('.btn-continuar')).toBeVisible({ timeout: 10_000 });
  expect((await saves(limpa)).map((s) => s.nomeHeroi)).toEqual(['Um', 'Dois', 'Tres']);
  await ctx.close();
});

test('migração: o save único antigo vira o slot automático; os manuais começam vazios', async ({ page }) => {
  await semear(page, { capitulo: 1, cena: 'c01-soleira', modo: 'escolhas', flags: ['salvou_aylin'] });
  await irAteMenu(page, './?test=1');
  const lista = await saves(page);
  expect(lista.map((s) => s.estado)).toEqual(['ok', 'vazio', 'vazio']);
  expect(lista[0]).toMatchObject({ slot: 'auto', tipo: 'auto', nomeHeroi: 'Thaelion', ato: 0, local: 'Füllmun', versaoSave: 7 });
  expect(await page.evaluate(() => localStorage.getItem('a-forja-do-heroi:estado'))).toBeNull();
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('fdg.opcoes')))!)).toMatchObject({ musica: 0.7, efeitos: 0.8 });
  await page.locator('.btn-continuar').click();
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c01-soleira');
  expect((await st(page)).flags).toContain('salvou_aylin');
});
