import { expect, test, type Page } from '@playwright/test';
import { irAteMenu } from './ajudantes';
import DICAS from '../src/data/tutorial.json' with { type: 'json' };
/** Füllmun passou a ter 2400 px de largura (Fase 5): coordenadas do mapa antigo → novas. */
const M = (v: number) => Math.round((v * 2400) / 1672);

/* Fase 4: Füllmun explorável, missões, relações, Compêndio, inventário, batalhas novas e Capítulo 02. */

type Estado = Record<string, any>;
const HEROI = {
  nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones',
  atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
  atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
  classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
};

/** Save pronto (Fase 4) no ponto pedido; `config` permite desligar os tremores. */
function semear(page: Page, campanha: Record<string, unknown>, o: { origem?: string; config?: Record<string, unknown>; versaoSave?: number | null; ouvidas?: string[] } = {}) {
  return page.addInitScript((op) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    const dados: Record<string, unknown> = {
      versao: 1,
      config: { musica: 0.7, efeitos: 0.8, mudo: false, ajudaFullmunVista: true, ...(op.config ?? {}) },
      personagem: { ...op.heroi, origem: op.origem ?? op.heroi.origem },
      sonho: { concluido: true, ouvidas: op.ouvidas ?? ['solem', 'justar', 'irae'] },
      campanha: { capitulo: 1, cena: null, modo: 'falas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null, ...op.campanha },
    };
    if (op.versaoSave !== null) dados.versaoSave = op.versaoSave ?? 4;
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify(dados));
  }, { campanha, heroi: HEROI, ...o });
}
/** O "Entendi" da dica aberta (não o da que está saindo, que some no meio do clique). */
const DICA_OK = '.dica-tutorial:not(.saindo) .dica-ok';
/** Tutorial ligado só com as dicas pedidas (as outras contam como já vistas). */
const soDicas = (...ids: string[]) => ({ tutorial: true, dicasVistas: (DICAS as { id: string }[]).map((d) => d.id).filter((id) => !ids.includes(id)) });
const MAPA = (mapa: string, extra: Record<string, unknown> = {}) => ({ cena: 'c01-soleira', modo: 'escolhas', local: { tela: 'mapa', mapa }, ...extra });

const st = (page: Page): Promise<Estado> => page.evaluate(() => (window as unknown as { __fdg?: { state(): Estado } }).__fdg?.state() ?? {});
const f = (page: Page, m: string, ...args: unknown[]) =>
  page.evaluate(([mm, aa]) => (window as unknown as { __fdg?: Record<string, (...x: unknown[]) => unknown> }).__fdg?.[mm as string]?.(...(aa as unknown[])), [m, args] as const);
const foto = (page: Page, projeto: string, nome: string) => page.screenshot({ path: `tests/screenshots/${projeto}-fase4-${nome}.png` });

async function continuar(page: Page, query = '?test=1') {
  await irAteMenu(page, `./${query}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
}
async function noMapa(page: Page, mapa: string, query = '?test=1') {
  await continuar(page, query);
  await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.mapa === mapa && s.pronto; }, { timeout: 90_000 }).toBe(true);
}

/** Avança as falas e toca em "Continuar" até a escolha pedida aparecer; então escolhe. */
async function escolher(page: Page, texto: string) {
  await expect.poll(async () => {
    const s = await st(page);
    const lista: string[] = s.escolhas ?? [];
    if (lista.some((e) => e.includes(texto))) return true;
    if (await page.locator(DICA_OK).isVisible()) await page.locator(DICA_OK).click({ timeout: 2000 }).catch(() => {});
    else if (!lista.length) await f(page, 'avancar');
    else if (lista.length === 1) await page.locator('.cena-escolha').first().click().catch(() => {});
    return false;
  }, { timeout: 45_000, intervals: [200] }).toBe(true);
  await page.locator('.cena-escolha', { hasText: texto }).first().click();
}
/** Avança até o texto aparecer na caixa (lê antes de avançar). */
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
/** Avança a última fala até as escolhas aparecerem e devolve os textos. */
async function ateEscolhas(page: Page): Promise<string[]> {
  let lista: string[] = [];
  await expect.poll(async () => {
    const s = await st(page);
    lista = s.escolhas ?? [];
    if (lista.length) return true;
    if (!s.digitando) await f(page, 'avancar');
    return false;
  }, { timeout: 15_000, intervals: [250] }).toBe(true);
  return lista;
}
/** Termina a conversa no mapa (avança e toca na primeira escolha até o palco fechar). */
async function fecharConversa(page: Page) {
  await expect.poll(async () => {
    const s = await st(page);
    if (!s.palco) return true;
    if (!(s.escolhas ?? []).length) await f(page, 'avancar');
    else await page.locator('.cena-escolha').first().click().catch(() => {});
    return false;
  }, { timeout: 45_000, intervals: [220] }).toBe(true);
}
async function falarCom(page: Page, alvo: string) {
  await expect.poll(async () => f(page, 'interactWith', alvo), { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => (await st(page)).palco, { timeout: 10_000 }).toBe(true);
}
/** Fecha dicas de tutorial e espera a vez do herói com o comando liberado. */
async function vezDoHeroi(page: Page, cmd = 'bicuda') {
  await expect.poll(async () => {
    if (await page.locator(DICA_OK).isVisible()) await page.locator(DICA_OK).click({ timeout: 2000 }).catch(() => {});
    const s = await st(page);
    if (s.fim) return true;
    return s.tela === 'batalha' && s.vez === 'heroi' && !(await page.locator(`[data-comando="${cmd}"]`).isDisabled().catch(() => true));
  }, { timeout: 40_000, intervals: [200] }).toBe(true);
}

test('Füllmun: câmera segue o herói, marcadores, relógio do atraso e subida bloqueada antes da Aylin', async ({ page }, info) => {
  await semear(page, MAPA('fullmun'));
  await noMapa(page, 'fullmun');
  const s0 = await st(page);
  const marc = Object.fromEntries(s0.npcs.map((n: { id: string; marcador: string | null }) => [n.id, n.marcador]));
  expect(marc).toMatchObject({ 'vo-hulda': '!', osric: '!', kobanu: '!', tobias: '!', selene: null, dagna: null });
  expect(s0.npcs.map((n: { id: string }) => n.id)).not.toContain('gerulf');
  await expect(page.locator('.relogio-estado')).toHaveText('Atrasado');
  await expect(page.locator('.relogio-bolinhas .cheia')).toHaveCount(0);
  // A câmera acompanha o herói
  await f(page, 'teleport', M(640), M(640));
  await page.waitForTimeout(600);
  const c0 = (await st(page)).camera;
  await f(page, 'teleport', M(1000), 860); // ponto livre (M(640) cai num pé de objeto do mapa novo)
  await expect.poll(async () => (await st(page)).camera.x, { timeout: 10_000 }).toBeGreaterThan(c0.x + 40);
  await page.waitForTimeout(700);
  await foto(page, info.project.name, 'fullmun-hud');
  // O relógio mostra o estado certo
  await f(page, 'setAtraso', 3);
  await expect(page.locator('.relogio-estado')).toHaveText('Atrasadíssimo');
  await expect(page.locator('.relogio-bolinhas .cheia')).toHaveCount(3);
  await f(page, 'setAtraso', 4);
  await expect(page.locator('.relogio-estado')).toHaveText('Artho vai te esfolar');
  // Subida do templo bloqueada antes de a Aylin chegar em casa
  await f(page, 'teleport', M(850), M(176));
  await expect.poll(async () => (await st(page)).cena, { timeout: 10_000 }).toBe('m-subida-aylin');
  await ateTexto(page, 'Primeiro, a Aylin.');
  await fecharConversa(page);
  expect((await st(page)).heroi.y).toBeGreaterThan(M(220));
});

test('conversa no mapa e missão "Roupas ao vento": busto, as 3 peças, Atletismo e a camisa dobrada', async ({ page }, info) => {
  await semear(page, MAPA('fullmun'));
  await noMapa(page, 'fullmun');
  await falarCom(page, 'npc:vo-hulda');
  await ateTexto(page, 'Bom dia, Thaelion! O sol chegou antes de você hoje');
  await expect(page.locator('.cena-busto')).toHaveAttribute('data-retrato', 'img/retratos/npc-vo-hulda.webp');
  await expect(page.locator('.cena-nome')).toHaveText('Vó Hulda');
  await page.waitForTimeout(400);
  await foto(page, info.project.name, 'conversa-busto');
  await escolher(page, 'Bom dia, Vó Hulda!');
  await escolher(page, 'Eu acho, Vó!');
  await fecharConversa(page);
  let s = await st(page);
  expect(s.missoes.hulda).toBe('aceita');
  expect(s.relacoes['vo-hulda']).toBe(1);
  expect(s.toasts).toContain('Vó Hulda ♥ +1');
  expect(s.npcs.find((n: { id: string }) => n.id === 'vo-hulda').marcador).toBe('…');
  expect(s.objetos).toEqual(expect.arrayContaining(['lencol', 'lenco', 'camisa']));
  for (const peca of ['lencol', 'lenco']) {
    await falarCom(page, `obj:${peca}`);
    await fecharConversa(page);
  }
  await f(page, 'forceRoll', [9]);
  await falarCom(page, 'obj:camisa');
  await escolher(page, 'Subir pelo barril');
  await expect(page.locator('.rolagem-conta')).toHaveText('9 + FOR 1 = 10 · CD 10', { timeout: 10_000 });
  await page.locator('.rolagem-seguir').click();
  await ateTexto(page, 'Você sobe pelo barril e alcança a camisa.');
  await fecharConversa(page);
  s = await st(page);
  expect(s.inventario).toMatchObject({ lencol: 1, lenco: 1, camisa: 1 });
  expect(s.npcs.find((n: { id: string }) => n.id === 'vo-hulda').marcador).toBe('?');
  // Entrega
  await falarCom(page, 'npc:vo-hulda');
  await escolher(page, 'Entregar a camisa dobrada');
  await ateTexto(page, 'Você é um bom menino. Ele ia gostar de você.');
  await fecharConversa(page);
  s = await st(page);
  expect(s.missoes.hulda).toBe('concluida');
  expect(s.relacoes['vo-hulda']).toBe(4);
  expect(s.inventario['pao-de-mel']).toBe(1);
  expect(s.inventario.lencol).toBeUndefined();
  expect(s.atraso).toBe(1);
  expect(s.flags).toContain('missao_hulda');
  expect(s.compendio.vistos['vo-hulda']).toBe(2);
  expect(s.toasts).toContain('Compêndio atualizado: Vó Hulda');
  await expect(page.locator('.relogio-bolinhas .cheia')).toHaveCount(1);
});

test('camisa: Atletismo falha e o herói desce rápido demais (−1 PV)', async ({ page }) => {
  await semear(page, MAPA('fullmun', { missoes: { hulda: 'aceita' }, flags: ['falou_hulda'], pvAtual: 8 }));
  await noMapa(page, 'fullmun');
  await f(page, 'forceRoll', [2]);
  await falarCom(page, 'obj:camisa');
  await escolher(page, 'Subir pelo barril');
  await page.locator('.rolagem-seguir').click({ timeout: 10_000 });
  await ateTexto(page, 'desce bem mais rápido do que subiu');
  await fecharConversa(page);
  const s = await st(page);
  expect(s.pv).toBe(7);
  expect(s.inventario.camisa).toBe(1);
});

for (const [nome, escolha, roll, reais, relacao, flag] of [
  ['aceitar os 5 Reais', 'Aceitar os 5 Reais', null, 5, 2, null],
  ['deixar pra lá', 'Deixa pra lá', null, 0, 3, 'gentileza_osric'],
  ['Barganha com sucesso', 'vale dez', 15, 10, 1, null],
  ['Barganha com falha', 'vale dez', 2, 5, 1, null],
] as const) {
  test(`Osric: ${nome}`, async ({ page }) => {
    await semear(page, MAPA('fullmun', { missoes: { osric: 'aceita' }, flags: ['falou_osric'], inventario: { repolho: 5 } }));
    await noMapa(page, 'fullmun');
    expect((await st(page)).npcs.find((n: { id: string }) => n.id === 'osric').marcador).toBe('?');
    if (roll !== null) await f(page, 'forceRoll', [roll]);
    await falarCom(page, 'npc:osric');
    await escolher(page, escolha);
    if (roll !== null) {
      await expect(page.locator('.rolagem-conta')).toHaveText(`${roll} + CAR 2 = ${roll + 2} · CD 12`, { timeout: 10_000 });
      await page.locator('.rolagem-seguir').click();
    }
    await fecharConversa(page);
    const s = await st(page);
    expect(s.reais).toBe(reais);
    expect(s.relacoes.osric).toBe(relacao);
    expect(s.missoes.osric).toBe('concluida');
    expect(s.atraso).toBe(1);
    expect(s.inventario.repolho).toBeUndefined();
    if (flag) expect(s.flags).toContain(flag);
  });
}

test('Kobanu: zombar dá −2 (Ressentido); ratazanas com 3 inimigos, alvo, dicas e nenhuma abóbora quebrada', async ({ page }, info) => {
  await semear(page, MAPA('fullmun'), { config: soDicas('batalha-turnos', 'batalha-atacar', 'batalha-aguardar') });
  await noMapa(page, 'fullmun');
  await falarCom(page, 'npc:kobanu');
  await escolher(page, 'presas tortas');
  await ateTexto(page, 'Tem ratazana nas abóboras');
  let s = await st(page);
  expect(s.relacoes.kobanu).toBe(-2);
  expect(s.toasts).toEqual(expect.arrayContaining(['Kobanu ♡ −2', 'Kobanu agora é Ressentido']));
  await f(page, 'forceRoll', Array(60).fill(10));
  await escolher(page, 'Eu ajudo');
  await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('batalha');
  // Dica do início
  await expect(page.locator('.dica-tutorial')).toContainText('A ordem dos turnos sai da Iniciativa', { timeout: 15_000 });
  await page.waitForTimeout(400);
  await foto(page, info.project.name, 'ratazanas-dica');
  await page.locator('.dica-ok').click();
  await vezDoHeroi(page);
  s = await st(page);
  expect(s.inimigos).toHaveLength(3);
  expect(s.inimigos.map((i: { nome: string }) => i.nome)).toEqual(['Ratazana A', 'Ratazana B', 'Ratazana C']);
  // As três ratazanas aparecem em pontos diferentes da arena (sem se sobrepor por inteiro)
  const caixas = await page.locator('.batalha-lado.inimigos .sprite-batalha').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; }));
  expect(caixas).toHaveLength(3);
  // e nenhuma fica atrás do cenário
  expect(await page.locator('.batalha-lado.inimigos .sprite-batalha').evaluateAll((els) => els.every((e) => Number(getComputedStyle(e).zIndex) > 0))).toBe(true);
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) expect(Math.hypot(caixas[a].x - caixas[b].x, caixas[a].y - caixas[b].y)).toBeGreaterThan(caixas[a].w * 0.4);
  expect(s.compendio.bestiario.ratazana).toEqual({ sabe: false });
  // Seleção de alvo
  await page.locator('[data-comando="bicuda"]').click();
  await expect(page.locator('.batalha-alvo')).toHaveCount(3);
  await expect(page.locator('.sprite-batalha.alvo-ativo')).toHaveCount(1);
  await page.waitForTimeout(300);
  await foto(page, info.project.name, 'ratazanas-alvo');
  await page.locator('.batalha-alvo').nth(1).click();
  // Até vencer: sempre Bicuda no primeiro alvo vivo
  for (let i = 0; i < 20; i++) {
    const t = await st(page);
    if (t.fim) break;
    await vezDoHeroi(page);
    if ((await st(page)).fim) break;
    await page.locator('[data-comando="bicuda"]').click();
    if (await page.locator('.batalha-alvo').count()) await page.locator('.batalha-alvo').first().click();
    await page.waitForTimeout(300);
  }
  await expect.poll(async () => (await st(page)).fim, { timeout: 30_000 }).toBe('vitoria');
  expect((await st(page)).contadores.aboboras_quebradas ?? 0).toBe(0);
  await page.locator('.batalha-continuar').click();
  await expect.poll(async () => (await st(page)).cena, { timeout: 30_000 }).toBe('f-kobanu-vitoria');
  await ateTexto(page, 'Nem uma abóbora arranhada!');
  await fecharConversa(page);
  s = await st(page);
  expect(s.relacoes.kobanu).toBe(1);
  expect(s.inventario.bandagem).toBe(1);
  expect(s.missoes.kobanu).toBe('concluida');
  expect(s.atraso).toBe(1);
  expect(s.flags).toEqual(expect.arrayContaining(['abobora_artho', 'missao_kobanu']));
  expect(s.compendio.bestiario.ratazana).toEqual({ sabe: true });
  expect(s.compendio.vistos.kobanu).toBe(2);
});

test('Kobanu: derrota nas ratazanas (1 PV, bandagem dada, sem abóbora para o Artho)', async ({ page }) => {
  await semear(page, MAPA('fullmun', { flags: ['falou_kobanu'], pvAtual: 1 }));
  await noMapa(page, 'fullmun');
  // Herói por último; a primeira ratazana acerta.
  await f(page, 'forceRoll', [1, 20, 20, 20, 15]);
  await falarCom(page, 'npc:kobanu');
  await escolher(page, 'Deixa as ratazanas comigo');
  await expect.poll(async () => {
    if (await page.locator(DICA_OK).isVisible()) await page.locator(DICA_OK).click({ timeout: 2000 }).catch(() => {});
    return (await st(page)).fim ?? null;
  }, { timeout: 40_000 }).toBe('derrota');
  await expect.poll(async () => (await st(page)).cena, { timeout: 30_000 }).toBe('f-kobanu-derrota');
  await ateTexto(page, 'Você tentou, garoto. Isso conta.');
  await fecharConversa(page);
  const s = await st(page);
  expect(s.pv).toBe(1);
  expect(s.inventario.bandagem).toBe(1);
  expect(s.relacoes.kobanu).toBe(1);
  expect(s.flags).not.toContain('abobora_artho');
  expect(s.atraso).toBe(1);
});

test('Tobias: o cesto de pães; comer um pão (com confirmação) quebra o cesto e tira 1 de relação; sem atraso', async ({ page }) => {
  await semear(page, MAPA('fullmun', { pvAtual: 6 }));
  await noMapa(page, 'fullmun');
  await falarCom(page, 'npc:tobias');
  await escolher(page, 'Levo, sim!');
  await fecharConversa(page);
  let s = await st(page);
  expect(s.inventario['cesto-paes']).toBe(6);
  expect(s.relacoes.tobias).toBe(1);
  expect(s.atraso).toBe(0);
  await page.locator('.btn-pausa').click();
  await page.getByRole('button', { name: 'Itens', exact: true }).click();
  await expect(page.locator('[data-item="cesto-paes"]')).toContainText('Pães 6/6 · intacto');
  await page.getByRole('button', { name: 'Comer um pão' }).click();
  await expect(page.locator('.itens-confirmar')).toContainText('Artho vai perceber que falta pão. Comer mesmo assim?');
  await page.getByRole('button', { name: 'Comer', exact: true }).click();
  await expect(page.locator('[data-item="cesto-paes"]')).toContainText('Pães 5/6 · falta pão');
  s = await st(page);
  expect(s.flags).toContain('comeu_pao');
  expect(s.relacoes.tobias).toBe(0);
  expect(s.pv).toBeGreaterThan(6);
  expect(s.pv).toBeLessThanOrEqual(12);
  expect(s.toasts).toContain('Tobias Miolo ♡ −1');
});

test('inventário: cura fora da batalha (sem passar do máximo) e o comando Item gasta o turno', async ({ page }) => {
  await semear(page, { cena: 'c01-grito', modo: 'escolhas', pvAtual: 11, inventario: { unguento: 1, 'pao-de-mel': 1 }, local: { tela: 'capitulo' } });
  await continuar(page);
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c01-grito');
  await page.locator('.cena-btn-pausa').click();
  await page.getByRole('button', { name: 'Itens', exact: true }).click();
  await expect(page.locator('.itens-pv')).toHaveText('PV 11 / 12');
  await page.locator('[data-item="unguento"] .item-usar').click();
  await expect(page.locator('.itens-pv')).toHaveText('PV 12 / 12');
  await page.getByRole('button', { name: 'Fechar' }).last().click();
  await page.getByRole('button', { name: 'Fechar' }).last().click();
  await expect(page.locator('.modal-fundo')).toHaveCount(0);
  // Na batalha
  await f(page, 'forceRoll', [15, 1, 1]);
  await escolher(page, 'enfrentá-lo');
  await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('batalha');
  await f(page, 'setPv', 4);
  await vezDoHeroi(page, 'item');
  await page.locator('[data-comando="item"]').click();
  await page.locator('[data-item="pao-de-mel"]').click();
  await expect.poll(async () => (await st(page)).log.some((l: string) => l.startsWith('Item: Pão de mel')), { timeout: 10_000 }).toBe(true);
  const s = await st(page);
  expect(s.pvHeroi).toBeGreaterThan(4);
  expect(s.pvHeroi).toBeLessThanOrEqual(12);
  // O Item gastou o turno: a próxima linha do registro já é do inimigo.
  await expect.poll(async () => {
    const log: string[] = (await st(page)).log;
    const i = log.findIndex((l) => l.startsWith('Item: Pão de mel'));
    return log.length > i + 1;
  }, { timeout: 10_000 }).toBe(true);
});

test('Mirtilo no mapa: soma 1 marca, Gerulf +2 (acalmou), a Aylin segue o herói até em casa e o capítulo segue para o 02', async ({ page }, info) => {
  test.setTimeout(420_000);
  await semear(page, MAPA('fullmun'));
  await noMapa(page, 'fullmun');
  await f(page, 'teleport', M(875), M(320));
  await expect.poll(async () => (await st(page)).cena, { timeout: 15_000 }).toBe('c01-pensamentos');
  await f(page, 'forceRoll', [18]);
  await escolher(page, 'Agachar devagar');
  await page.locator('.rolagem-seguir').click({ timeout: 10_000 });
  await escolher(page, 'impossível');
  await escolher(page, 'Levar a Aylin para casa');
  await expect.poll(async () => (await st(page)).palco, { timeout: 15_000 }).toBe(false);
  let s = await st(page);
  expect(s.atraso).toBe(1);
  expect(s.relacoes.gerulf).toBe(2);
  expect(s.relacoes.aylin).toBe(4);
  expect(s.seguidores.map((x: { id: string }) => x.id)).toEqual(['aylin']);
  expect(s.dica).toBe('Leve a Aylin para casa');
  expect(s.npcs.map((n: { id: string }) => n.id)).toContain('gerulf');
  // A Aylin anda atrás do herói
  const antes = s.seguidores[0];
  await f(page, 'walkTo', M(1206), M(250));
  await page.waitForTimeout(800);
  s = await st(page);
  expect(Math.hypot(s.seguidores[0].x - antes.x, s.seguidores[0].y - antes.y)).toBeGreaterThan(10);
  await foto(page, info.project.name, 'aylin-seguindo');
  await f(page, 'teleport', M(1206), M(214));
  await expect.poll(async () => (await st(page)).cena, { timeout: 10_000 }).toBe('c01-aylin-casa');
  await ateTexto(page, 'a Nyme fica longe de você!');
  await fecharConversa(page);
  s = await st(page);
  expect(s.flags).toContain('aylin_em_casa');
  expect(s.seguidores).toEqual([]);
  // Subida do templo: sem missões pendentes, segue para C01-09 e o fim
  await f(page, 'teleport', M(850), M(176));
  await expect.poll(async () => (await st(page)).cena, { timeout: 10_000 }).toBe('c01-caminho');
  await escolher(page, 'Entrar no templo');
  // Fase 5C: um capítulo só. Sem "Fim do Capítulo": o cartão de local leva à parte do templo.
  await expect(page.locator('.cena-cartao-titulo.cartao-local.visivel')).toContainText('Templo de Sólem', { timeout: 15_000 });
  await expect(page.locator('.tela-fim-capitulo')).toHaveCount(0);
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c02-lamina');
  s = await st(page);
  expect(s.capitulo).toBe(1);
  expect(s.parte).toBe('templo');
  expect(s.flags).toContain('acalmou');
});

test('subida com missão aceita e não concluída pergunta antes de seguir', async ({ page }) => {
  await semear(page, MAPA('fullmun', { flags: ['aylin_em_casa', 'evento_mirtilo', 'evento_mirtilo_fim'], missoes: { osric: 'aceita' } }));
  await noMapa(page, 'fullmun');
  await f(page, 'teleport', M(850), M(176));
  await ateTexto(page, 'Seguir para o templo? As tarefas que você aceitou vão ficar para trás.');
  expect(await ateEscolhas(page)).toEqual(['Seguir', 'Ficar']);
  await page.locator('.cena-escolha', { hasText: 'Ficar' }).click();
  await expect.poll(async () => (await st(page)).palco, { timeout: 10_000 }).toBe(false);
});

test('Compêndio: abas, fichas, silhuetas, bestiário e vozes; pausa (ponto de novidade) e menu inicial', async ({ page }, info) => {
  await semear(page, MAPA('fullmun', {
    compendio: { conhecidos: ['kobanu', 'vo-hulda'], bestiario: { mirtilo: { sabe: true }, ratazana: { sabe: false } }, vistos: { kobanu: 1, 'vo-hulda': 1 }, novidade: true },
    relacoes: { artho: 2, nyme: 2, aylin: 1, 'vo-hulda': 3, osric: 0, kobanu: -2, gerulf: 0, tobias: 0, selene: 0, dagna: 0 },
  }), { ouvidas: ['solem', 'justar', 'irae'] });
  await noMapa(page, 'fullmun');
  await page.locator('.btn-pausa').click();
  await expect(page.locator('.btn-compendio .ponto-novidade')).toBeVisible();
  await page.locator('.btn-compendio').click();
  await expect(page.locator('.compendio')).toBeVisible();
  await expect(page.locator('[data-ficha="kobanu"]')).toContainText('Kobanu');
  await expect(page.locator('[data-ficha="kobanu"]')).toContainText('Ressentido');
  await expect(page.locator('[data-ficha="vo-hulda"]')).toContainText('Amigo');
  await expect(page.locator('.compendio-item.bloqueado')).toHaveCount(8);
  await page.waitForTimeout(300);
  await foto(page, info.project.name, 'compendio-lista');
  await page.locator('[data-ficha="kobanu"]').click();
  await expect(page.locator('.compendio-ficha')).toContainText('Plantador de abóboras de Füllmun. Gentil, apesar das presas.');
  await expect(page.locator('.ficha-paragrafo.bloqueado')).toHaveCount(2);
  expect((await page.locator('.compendio-voltar').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await foto(page, info.project.name, 'compendio-ficha');
  await page.locator('.compendio-voltar').click();
  await page.getByRole('tab', { name: 'Bestiário' }).click();
  await page.locator('[data-ficha="mirtilo"]').click();
  await expect(page.locator('.compendio-ficha')).toContainText('Gritos e peito estufado o fazem recuar.');
  await foto(page, info.project.name, 'compendio-bestiario');
  await page.locator('.compendio-voltar').click();
  await page.locator('[data-ficha="ratazana"]').click();
  await expect(page.locator('.compendio-ficha .ficha-paragrafo.bloqueado')).toHaveText('???');
  await page.locator('.compendio-voltar').click();
  await page.getByRole('tab', { name: 'Vozes' }).click();
  await expect(page.locator('.compendio-voz[data-voz]')).toHaveCount(3);
  await expect(page.locator('.compendio-voz.bloqueado')).toHaveCount(4);
  await expect(page.locator('[data-voz="justar"]')).toContainText('Uma voz prateada');
  await expect(page.locator('[data-voz="justar"]')).toContainText('A Forja revelará este nome.');
  await foto(page, info.project.name, 'compendio-vozes');
  await page.locator('.compendio-fechar').click();
  // Menu inicial
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Compêndio' }).click();
  await expect(page.locator('.compendio')).toBeVisible();
});

for (const [atraso, cesto, final, fala, castigo, manchas] of [
  [1, true, 0, 'Pouco atraso, para os seus padrões', 'Hoje você vai limpar a biblioteca.', 0],
  [2, false, 2, 'O sol andou demais no céu, Thaelion. Demais.', 'Hoje você vai esfregar o piso do salão principal.', 6],
  [4, false, 4, 'Eu já ia mandar a guarda inteira atrás de você.', 'polir o altar de Sólem', 10],
] as const) {
  test(`sermão: atrasoFinal ${final} (${cesto ? 'cesto intacto' : 'sem cesto'}): fala, castigo e ${manchas} manchas`, async ({ page }, info) => {
    await semear(page, {
      capitulo: 2, cena: 'c02-artho', modo: 'falas', atraso, inventario: cesto ? { 'cesto-paes': 6 } : {},
      flags: ['missao_hulda', 'acalmou', 'abobora_artho', 'gentileza_osric', 'salvou_aylin', 'venceu_treino'], local: { tela: 'capitulo' },
    });
    await continuar(page);
    await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c02-artho');
    const textos: string[] = [];
    await expect.poll(async () => {
      const s = await st(page);
      if (s.digitando) return false;
      const t = (await page.locator('.cena-texto').textContent()) ?? '';
      if (t && textos[textos.length - 1] !== t) textos.push(t);
      if ((s.escolhas ?? []).length) return true;
      await f(page, 'avancar');
      return false;
    }, { timeout: 60_000, intervals: [150] }).toBe(true);
    const tudo = textos.join('\n');
    expect(tudo).toContain(fala);
    expect(tudo).toContain(castigo);
    if (cesto) expect(tudo).toContain('Pelo menos você trouxe o pão.');
    else expect(tudo).toContain('E o pão do templo? O Tobias não te viu?');
    // No máximo 3 boas ações, na ordem de prioridade
    const boas = ['varal completo', 'acalmou o Mirtilo', 'me trazer uma abóbora', 'não cobrou nada', 'salvou a pequena Aylin'].filter((b) => tudo.includes(b));
    expect(boas).toEqual(['varal completo', 'acalmou o Mirtilo', 'me trazer uma abóbora']);
    if (final === 4) await foto(page, info.project.name, 'sermao');
    await escolher(page, 'Sim, senhor.');
    await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.pronto; }, { timeout: 40_000 }).toBe(true);
    const s = await st(page);
    expect(s.objetos.filter((o: string) => o.startsWith('mancha')).length).toBe(manchas);
    if (manchas) await expect(page.locator('.hud-contador')).toHaveText(`Manchas 0/${manchas}`);
    if (final === 4) {
      await page.waitForTimeout(800);
      await foto(page, info.project.name, 'salao-manchas');
    }
    // A porta da biblioteca só abre com o castigo cumprido
    await falarCom(page, 'obj:porta-biblioteca');
    if (manchas) {
      await ateTexto(page, 'O piso primeiro, Thaelion.');
      await fecharConversa(page);
    } else {
      await expect.poll(async () => (await st(page)).mapa, { timeout: 30_000 }).toBe('templo-biblioteca');
    }
  });
}

test('treino com Nyme: a Rasteira vence o teste oposto e encerra o treino; os PV voltam ao valor de antes', async ({ page }, info) => {
  await semear(page, { capitulo: 2, cena: 'c02-nyme', modo: 'falas', pvAtual: 1, flags: ['machucado'], local: { tela: 'capitulo' } }, { config: soDicas('rasteira') });
  await continuar(page);
  await escolher(page, 'Vamos lá');
  await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('batalha');
  await f(page, 'forceRoll', [15, 1, 18, 2]);
  await expect(page.locator('.dica-tutorial')).toContainText('Rasteira é uma manobra', { timeout: 20_000 });
  expect((await st(page)).pvHeroi).toBe(12);
  await page.locator('.dica-ok').click();
  await vezDoHeroi(page, 'rasteira');
  await page.locator('[data-comando="rasteira"]').click();
  await expect(page.locator('.rolagem-oposta')).toContainText('ELA CAI!', { timeout: 10_000 });
  await foto(page, info.project.name, 'treino-rasteira');
  await expect.poll(async () => (await st(page)).fim, { timeout: 15_000 }).toBe('rasteira');
  await expect(page.locator('.batalha-continuar')).toBeVisible({ timeout: 10_000 });
  const s = await st(page);
  expect(s.log.join('\n')).toContain('Rasteira: 18 + FOR 1 = 19 × Fortitude de Nyme: 2 + 2 = 4 · ELA CAI!');
  expect(s.inimigos[0].pose).toBe('caida');
  expect(s.flags).toEqual(expect.arrayContaining(['venceu_treino_rasteira']));
  expect(s.flags).not.toContain('venceu_treino');
  expect(s.relacoes.nyme).toBe(3);
  expect(s.musica.faixa).not.toBe('music/vitoria.mp3');
  await page.locator('.batalha-continuar').click();
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c02-depois-treino');
  expect((await st(page)).pv).toBe(1);
  await ateTexto(page, 'Nem só de força se vencem as batalhas.');
});

test('treino com Nyme: vencer pelos PV e perder pelos PV', async ({ page }) => {
  await semear(page, { capitulo: 2, cena: 'c02-nyme', modo: 'falas', pvAtual: 9, local: { tela: 'capitulo' } });
  await continuar(page);
  await escolher(page, 'Vamos lá');
  await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('batalha');
  // Vencer pelos PV: a Nyme com 8 (metade de 14 = 7); um crítico encerra.
  await vezDoHeroi(page);
  await f(page, 'setPvInimigo', 8);
  await f(page, 'forceRoll', [20]);
  await page.locator('[data-comando="bicuda"]').click();
  await expect.poll(async () => (await st(page)).fim, { timeout: 20_000 }).toBe('vitoria');
  await expect(page.locator('.batalha-continuar')).toBeVisible({ timeout: 10_000 });
  expect((await st(page)).flags).toContain('venceu_treino');
  await page.locator('.batalha-continuar').click();
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c02-depois-treino');
  expect((await st(page)).pv).toBe(9);
  // Perder pelos PV: de novo, com o herói em 7 (metade de 12 = 6)
  await f(page, 'goto', 'c02-nyme');
  await escolher(page, 'Vamos lá');
  await expect.poll(async () => (await st(page)).tela, { timeout: 30_000 }).toBe('batalha');
  await vezDoHeroi(page, 'rasteira');
  await f(page, 'forcarAcaoInimigo', 'espada');
  await f(page, 'setPv', 7);
  await f(page, 'forceRoll', [1, 20, 20, 20]);
  await page.locator('[data-comando="rasteira"]').click();
  await expect.poll(async () => (await st(page)).fim, { timeout: 20_000 }).toBe('derrota');
  await expect(page.locator('.batalha-continuar')).toBeVisible({ timeout: 10_000 });
  const s = await st(page);
  expect(s.flags).toContain('perdeu_treino');
  expect(s.inimigos[0].pose).toBe('rindo');
  await page.locator('.batalha-continuar').click();
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c02-depois-treino');
  expect((await st(page)).pv).toBe(9);
  await ateTexto(page, 'você vai ao chão, com ela por cima');
});

test('biblioteca: falas da Nyme na ordem, os 3 livros (Artho +1), pista do sonho e o frame do alçapão', async ({ page }, info) => {
  test.setTimeout(420_000);
  await semear(page, MAPA('templo-biblioteca', { capitulo: 2, cena: 'c02-artho', atraso: 1, flags: ['nyme_seguindo', 'pista_sonho', 'sem_reclamar', 'venceu_treino'] }));
  await noMapa(page, 'templo-biblioteca');
  expect((await st(page)).seguidores.map((x: { id: string }) => x.id)).toEqual(['nyme']);
  // Alçapão trancado antes da hora
  await falarCom(page, 'obj:alcapao');
  await ateTexto(page, 'Trancado, como sempre. Só o Artho tem a chave.');
  await fecharConversa(page);
  // Os três livros
  for (const l of ['livro-solem', 'livro-alfars']) {
    await f(page, 'interactWith', `obj:${l}`);
    await expect(page.locator('.livro')).toBeVisible({ timeout: 10_000 });
    if (l === 'livro-alfars') await foto(page, info.project.name, 'livro');
    await page.locator('.livro-fechar').click();
  }
  const cenas: string[] = [];
  for (let i = 1; i <= 5; i++) {
    await f(page, 'interactWith', `obj:estante-${i}`);
    await expect.poll(async () => (await st(page)).contadores.estantes ?? 0, { timeout: 10_000 }).toBe(i);
    await page.waitForTimeout(300);
    const s = await st(page);
    if (s.cena) cenas.push(s.cena);
    if (i === 1) {
      await ateTexto(page, 'Eu só caí porque deixei!');
      await foto(page, info.project.name, 'biblioteca-nyme');
    }
    if (i === 3) {
      await ateTexto(page, 'Será que isso realmente aconteceu?');
      expect(await ateEscolhas(page)).toHaveLength(3);
      await escolher(page, 'Todo herói das velhas canções');
      await ateTexto(page, 'Você anda lendo demais, Thaelion.');
    }
    if (i === 2) {
      await escolher(page, 'Imitar a Aylin');
      await escolher(page, 'Eu… eu também gosto de você');
    }
    await fecharConversa(page);
  }
  expect(cenas).toEqual(['t-estante-1', 't-estante-2', 't-estante-3', 't-estantes-fim']);
  const s = await st(page);
  expect(s.flags).toEqual(expect.arrayContaining(['carinho_nyme', 'alcapao_liberado', 'leu_tres_livros']));
  expect(s.relacoes.artho).toBe(3);
  expect(s.relacoes.nyme).toBe(5);
  expect(s.toasts).toContain('Artho ♥ +1');
  // O alçapão agora tem o "!" e abre o frame em tela cheia
  await falarCom(page, 'obj:alcapao');
  await expect(page.locator('.palco-cena.visual-alcapao')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.palco-cena .cena-fundo.visivel')).toHaveAttribute('data-cena', 'cena-alcapao');
  await page.waitForTimeout(900);
  await foto(page, info.project.name, 'alcapao');
});

test('biblioteca: a escolha da pista do sonho só aparece com a flag', async ({ page }) => {
  await semear(page, MAPA('templo-biblioteca', { capitulo: 2, cena: 'c02-artho', atraso: 1, flags: ['nyme_seguindo'] }));
  await noMapa(page, 'templo-biblioteca');
  await f(page, 'goto', 't-estante-3');
  await ateTexto(page, 'Será que isso realmente aconteceu?');
  expect(await ateEscolhas(page)).toHaveLength(2);
});

// A tragédia da Fase 4 (gritos sintetizados, sem flechas) foi substituída pela da Fase 5C: tests/fase5c.spec.ts.

test('fluxo: Continuar retoma no meio do mapa, na posição salva', async ({ page }) => {
  await semear(page, MAPA('templo-salao', { capitulo: 2, cena: 'c02-artho', atraso: 2, flags: ['nyme_seguindo'] }));
  await noMapa(page, 'templo-salao');
  await f(page, 'interactWith', 'obj:mancha-1');
  await expect.poll(async () => (await st(page)).contadores.manchas ?? 0, { timeout: 10_000 }).toBe(1);
  await f(page, 'teleport', 900, 800);
  const antes = (await st(page)).heroi;
  await noMapa(page, 'templo-salao');
  const s = await st(page);
  expect(Math.round(s.heroi.x)).toBe(Math.round(antes.x));
  expect(Math.round(s.heroi.y)).toBe(Math.round(antes.y));
  expect(s.contadores.manchas).toBe(1);
  expect(s.objetos).not.toContain('mancha-1');
});

test('save antigo da Fase 3 (parado em "Capítulo 02 · Em breve") migra para o começo do templo (Capítulo 01, parte 2)', async ({ page }) => {
  await semear(page, { capitulo: 2, cena: 'inicio', flags: ['intimidou', 'salvou_aylin'], pvAtual: 12 }, { versaoSave: null });
  await continuar(page);
  await expect(page.locator('.cena-cartao-titulo.cartao-local.visivel')).toContainText('Templo de Sólem', { timeout: 15_000 });
  await expect.poll(async () => (await st(page)).cena, { timeout: 20_000 }).toBe('c02-lamina');
  const s = await st(page);
  expect(s.atraso).toBe(2);
  expect(s.inventario).toEqual({});
  expect(s.relacoes).toMatchObject({ artho: 2, nyme: 2, aylin: 1, kobanu: 0 });
  expect(s.capitulo).toBe(1);
  expect(s.parte).toBe('templo');
  const salvo = await page.evaluate(() => ((a) => ({ ...(a?.jogo ?? {}), versaoSave: a?.versaoSave, config: JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}') }))(JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null')));
  expect(salvo.versaoSave).toBe(7);
});

test('modo de ajuste (F2) nos três mapas novos', async ({ page }, info) => {
  await semear(page, MAPA('fullmun'));
  await noMapa(page, 'fullmun', '?test=1&debug=1');
  await page.waitForTimeout(800);
  await foto(page, info.project.name, 'f2-fullmun');
  for (const [mapa, x, y] of [['templo-salao', 586, 700], ['templo-biblioteca', 700, 520]] as const) {
    await f(page, 'gotoMapa', mapa, x, y);
    await expect.poll(async () => { const s = await st(page); return s.mapa === mapa && s.pronto; }, { timeout: 40_000 }).toBe(true);
    await page.waitForTimeout(800);
    await foto(page, info.project.name, `f2-${mapa}`);
  }
});
