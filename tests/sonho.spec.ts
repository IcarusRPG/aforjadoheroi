import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { irAteMenu } from './ajudantes';

type Raca = 'arake' | 'azakar' | 'nyashi' | 'ayoran';
type Genero = 'm' | 'f';

/** Herói pronto (com classe) que ainda não terminou o sonho: Continuar começa no sonho. */
function semearHeroi(page: Page, sonho = { concluido: false, ouvidas: [] as string[] }, raca: Raca = 'ayoran', genero: Genero = 'm') {
  return page.addInitScript(([s, r, g]) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('a-forja-do-heroi:estado', JSON.stringify({
      versao: 1,
      config: { musica: 0.7, efeitos: 0.8, mudo: false, ajudaFullmunVista: true },
      personagem: {
        nome: 'Thaelion', genero: g, raca: r, variante: null, origem: 'estudioso',
        atributosComprados: { FOR: 0, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 1 }, bonusArake: [],
        atributosFinais: { FOR: 0, DES: 3, CON: 2, INT: 4, SAB: 1, CAR: 2 },
        classe: 'arcanista', pvMax: 14, pmMax: 10, criadoEm: '2026-11-17T12:00:00.000Z',
      },
      sonho: s,
    }));
  }, [sonho, raca, genero] as const);
}

interface EstadoSonho {
  pronto: boolean;
  heroi: { x: number; y: number; direcao: string } | null;
  proximo: string | null;
  ouvidas: string[];
  concluido: boolean;
  falaAberta: boolean;
  climax: boolean;
  feixes: number;
  caminhando: boolean;
  atrasDe: string | null;
  sprite: string;
  tremores: number;
  tremorCamera: boolean;
  cameraTremendo: boolean;
  neblina: { camadas: number; nivel: number } | null;
  fps: number;
}
type Ganchos = { state(): EstadoSonho } & Record<string, (x?: string) => unknown>;
const estado = (page: Page) => page.evaluate(() =>
  (window as unknown as { __fdg?: Ganchos }).__fdg?.state() ?? ({ pronto: false } as EstadoSonho));
type Metodo = 'teleport' | 'interact' | 'fecharFala' | 'walkTo' | 'tremor' | 'reduzirClima';
const fdg = (page: Page, metodo: Metodo, arg?: string) =>
  page.evaluate(([m, a]) => (window as unknown as { __fdg: Ganchos }).__fdg[m](a), [metodo, arg] as const);
/** Marcos registrados pela cena (sobrevivem à troca de tela). */
type Marco = { evento: string; x?: number; y?: number; direcao?: string; n?: number };
const marcos = (page: Page) => page.evaluate(() => (window as unknown as { __fdgLog?: Marco[] }).__fdgLog ?? []);
const marco = async (page: Page, evento: string, timeout = 30_000) => {
  await expect.poll(async () => (await marcos(page)).some((m) => m.evento === evento), { timeout }).toBe(true);
  return (await marcos(page)).find((m) => m.evento === evento)!;
};
const andar = async (page: Page, x: number, y: number) => expect(await fdg(page, 'walkTo', `${x},${y}`)).toBe(true);

async function entrarNoSonho(page: Page, query = '?test=1') {
  await irAteMenu(page, `./${query}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.tela-sonho.pronto canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await estado(page)).pronto).toBe(true);
}

const foto = (page: Page, nome: string, projeto: string) => page.screenshot({ path: `tests/screenshots/${projeto}-${nome}.png` });

const ESTATUAS = ['solem', 'justar', 'ardor', 'expiria', 'eternus', 'mentis', 'irae'];
const MAPA = JSON.parse(readFileSync('src/data/mapas/sonho.json', 'utf8')) as {
  interacoes: { id: string; x: number; y: number }[];
  pontos: { altar: { x: number; y: number } };
};
const ponto = (id: string) => MAPA.interacoes.find((i) => i.id === id)!;
const ALTAR = MAPA.pontos.altar;

/** Ouve a voz da estátua de onde o herói está e fecha a fala. */
async function ouvir(page: Page, id: string) {
  await expect.poll(async () => (await estado(page)).proximo).toBe(id);
  await fdg(page, 'interact');
  await expect(page.locator('.caixa-fala')).toBeVisible();
  await fdg(page, 'fecharFala');
}

test('sprites: as 8 folhas existem com 192 × 192 px', async () => {
  for (const r of ['arake', 'azakar', 'nyashi', 'ayoran']) for (const g of ['m', 'f']) {
    const m = await sharp(`public/assets/sprites/chibi-${r}-${g}.png`).metadata();
    expect([m.width, m.height, m.hasAlpha], `chibi-${r}-${g}`).toEqual([192, 192, true]);
  }
});

test('sprites: cada raça e gênero carrega a própria folha (não o boneco provisório)', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel-7', 'não depende do tamanho da tela: roda uma vez só');
  const combinacoes: [Raca, Genero][] = [['arake', 'm'], ['arake', 'f'], ['azakar', 'm'], ['azakar', 'f'], ['nyashi', 'm'], ['nyashi', 'f'], ['ayoran', 'm'], ['ayoran', 'f']];
  await semearHeroi(page);
  await entrarNoSonho(page);
  for (const [r, g] of combinacoes) {
    await page.evaluate(([rr, gg]) => {
      // O herói mora no slot automático (Fase 4B).
      const a = JSON.parse(localStorage.getItem('fdg.save.auto')!);
      a.jogo.personagem.raca = rr;
      a.jogo.personagem.genero = gg;
      localStorage.setItem('fdg.save.auto', JSON.stringify(a));
    }, [r, g]);
    await entrarNoSonho(page);
    expect((await estado(page)).sprite).toBe(`sprites/chibi-${r}-${g}.png`);
  }
});

test('sonho dos deuses: andar, ouvir as sete vozes, caminhada sozinho até o altar, clímax e despertar', async ({ page }, info) => {
  test.setTimeout(420_000);
  const toque = info.project.use.hasTouch === true;
  await semearHeroi(page);
  await entrarNoSonho(page);

  // Canvas, contador, neblina e (no celular) joystick
  await expect(page.locator('.sonho-contador')).toHaveText('Vozes ouvidas: 0 / 7');
  expect((await estado(page)).sprite).toBe('sprites/chibi-ayoran-m.png');
  expect((await estado(page)).neblina).toEqual({ camadas: 2, nivel: 0 });
  if (toque) {
    await expect(page.locator('.joystick')).toBeVisible();
    const j = (await page.locator('.joystick').boundingBox())!;
    expect(j.width).toBeGreaterThanOrEqual(44);
  }
  const pausa = (await page.locator('.btn-pausa').boundingBox())!;
  expect(pausa.width).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.btn-interagir')).toBeHidden();
  await page.waitForTimeout(800);
  await foto(page, 'sonho-inicio', info.project.name);

  // Andar com o teclado (sobe a escada)
  const antes = (await estado(page)).heroi!;
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await estado(page)).heroi!.y, { timeout: 10_000 }).toBeLessThan(antes.y - 60);
  await page.keyboard.up('ArrowUp');
  expect((await estado(page)).heroi!.direcao).toBe('cima');

  // Andar contra a borda: não sai da escada para as nuvens
  await fdg(page, 'teleport', '627,1150');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowLeft');
  expect((await estado(page)).heroi!.x).toBeGreaterThan(548);

  // No celular, o joystick também anda
  if (toque) {
    const j = (await page.locator('.joystick').boundingBox())!;
    const y0 = (await estado(page)).heroi!.y;
    const cx = j.x + j.width / 2;
    const cy = j.y + j.height / 2;
    const opcoes = { pointerId: 7, isPrimary: true, pointerType: 'touch', clientX: cx, clientY: cy - j.height * 0.45 };
    await page.locator('.joystick').dispatchEvent('pointerdown', opcoes);
    await expect.poll(async () => (await estado(page)).heroi!.y, { timeout: 10_000 }).toBeLessThan(y0 - 30);
    await page.locator('.joystick').dispatchEvent('pointerup', { ...opcoes, clientY: cy });
  }

  // Perto de uma estátua: o botão ✦ aparece
  await fdg(page, 'teleport', 'justar');
  await expect(page.locator('.btn-interagir')).toBeVisible();
  expect((await estado(page)).proximo).toBe('justar');
  const btn = (await page.locator('.btn-interagir').boundingBox())!;
  expect(btn.width).toBeGreaterThanOrEqual(44);

  // Interagir: caixa de fala com o título "Uma voz {cor}", sem o nome da divindade
  if (toque) await page.locator('.btn-interagir').tap();
  else await page.keyboard.press('e');
  await expect(page.locator('.caixa-fala')).toBeVisible();
  await expect(page.locator('.fala-titulo')).toHaveText('Uma voz prateada');
  await expect(page.locator('.fala-texto')).toHaveText('Toda mentira pesa na balança. Um dia, ela pende.', { timeout: 5000 });
  await expect(page.locator('.caixa-fala')).not.toContainText('Justar');
  await expect(page.locator('.sonho-contador')).toHaveText('Vozes ouvidas: 1 / 7');
  await page.waitForTimeout(500);
  await foto(page, 'sonho-estatua-fala', info.project.name);
  // O texto já está completo: um clique fecha
  await page.locator('.caixa-fala').click();
  await expect(page.locator('.caixa-fala')).toBeHidden();

  // Altar antes das sete vozes: não acontece nada (nem fala, nem clímax)
  await fdg(page, 'teleport', 'altar');
  await andar(page, ALTAR.x, ALTAR.y);
  await page.waitForTimeout(1200);
  await expect(page.locator('.caixa-fala')).toBeHidden();
  expect((await estado(page)).climax).toBe(false);
  expect((await estado(page)).caminhando).toBe(false);

  // Outras cinco vozes
  for (const id of ['solem', 'ardor', 'expiria', 'eternus', 'mentis']) {
    await fdg(page, 'teleport', id);
    await ouvir(page, id);
  }
  await expect(page.locator('.sonho-contador')).toHaveText('Vozes ouvidas: 6 / 7');
  expect((await estado(page)).caminhando).toBe(false);

  // A 7ª voz: ao fechar a fala, os controles somem e o herói anda sozinho até o altar
  await fdg(page, 'teleport', 'irae');
  await ouvir(page, 'irae');
  expect((await estado(page)).ouvidas.sort()).toEqual([...ESTATUAS].sort());
  const inicio = await marco(page, 'caminhada');
  await expect(page.locator('.tela-sonho.controles-ocultos')).toBeVisible();
  await expect(page.locator('.btn-interagir')).toHaveCSS('opacity', '0');
  if (toque) await expect(page.locator('.joystick')).toHaveCSS('opacity', '0');
  await page.waitForTimeout(2200);
  await foto(page, 'sonho-caminhada-altar', info.project.name);

  // Chega ao centro (andando, não teletransportado), vira para baixo e o clímax começa
  const noAltar = await marco(page, 'altar');
  expect(noAltar).toMatchObject({ chegou: true, direcao: 'baixo' });
  expect(Math.hypot(noAltar.x! - ALTAR.x, noAltar.y! - ALTAR.y)).toBeLessThan(4);
  expect(Math.hypot(noAltar.x! - inicio.x!, noAltar.y! - inicio.y!)).toBeGreaterThan(100);
  await marco(page, 'climax');
  expect((await marco(page, 'feixes')).n).toBe(7);
  await page.waitForTimeout(700);
  await foto(page, 'sonho-climax', info.project.name);
  await marco(page, 'escolhido');

  // Despertar e tela provisória
  await expect(page.locator('.tela-sequencia')).toContainText('Você acorda num sobressalto.', { timeout: 20_000 });
  const salvo = await page.evaluate(() => ((a) => ({ ...(a?.jogo ?? {}), versaoSave: a?.versaoSave, config: JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}') }))(JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null')).sonho);
  expect(salvo.concluido).toBe(true);
  // Depois do despertar, o Capítulo 01 começa com o cartão de título
  await expect(page.locator('.tela-capitulo .cena-cartao-titulo')).toContainText('Amanhecer Tardio', { timeout: 30_000 });
  await expect(page.locator('.tela-capitulo .cena-cartao-titulo')).toContainText('Prólogo');
  await foto(page, 'sonho-fim-capitulo01', info.project.name);
});

test('mapa: percorre o anel, as 4 pontes e a escada e ouve as 7 estátuas', async ({ page }) => {
  test.setTimeout(420_000);
  await semearHeroi(page);
  await entrarNoSonho(page);
  // Escada até o anel
  await andar(page, 627, 1010);
  // Anel inteiro, no sentido anti-horário, passando por seis estátuas
  for (const id of ['eternus', 'mentis', 'irae', 'solem', 'justar', 'ardor']) {
    const p = ponto(id);
    await andar(page, p.x, p.y);
    await ouvir(page, id);
  }
  expect((await estado(page)).ouvidas).toHaveLength(6);
  // As quatro pontes, sempre passando pelo altar (com 6 vozes, o altar não faz nada)
  for (const [x, y, fora] of [[834, 540, [950, 540]], [627, 690, [627, 800]], [420, 540, [300, 540]], [627, 390, [627, 320]]] as const) {
    await andar(page, ALTAR.x, ALTAR.y);
    await andar(page, x, y);
    await andar(page, fora[0], fora[1]);
  }
  expect((await estado(page)).climax).toBe(false);
  await expect(page.locator('.caixa-fala')).toBeHidden();
  // Fecha a volta no anel (lado direito, de cima para baixo) até a última estátua
  await andar(page, 1180, 700);
  const ultima = ponto('expiria');
  await andar(page, ultima.x, ultima.y);
  await ouvir(page, 'expiria');
  // A 7ª voz leva o herói sozinho até o altar
  expect(await marco(page, 'altar', 45_000)).toMatchObject({ chegou: true });
  await marco(page, 'climax');
});

test('profundidade: o herói fica atrás da estátua ao passar por trás e na frente ao passar pela frente', async ({ page }, info) => {
  await semearHeroi(page);
  await entrarNoSonho(page);
  // Atrás de Justar: os pés acima da base, o corpo coberto pelo recorte da estátua
  await fdg(page, 'teleport', '880,262');
  await page.waitForTimeout(900);
  expect((await estado(page)).atrasDe).toBe('estatua-justar');
  await foto(page, 'profundidade-atras', info.project.name);
  // Na frente, junto da escadinha: o herói por cima
  await fdg(page, 'teleport', '934,385');
  await page.waitForTimeout(900);
  expect((await estado(page)).atrasDe).toBeNull();
  await foto(page, 'profundidade-frente', info.project.name);
  // Junto da balaustrada de baixo, as colunas ficam na frente
  await fdg(page, 'teleport', '160,850');
  await page.waitForTimeout(300);
  expect((await estado(page)).atrasDe).toBe('balaustrada-esquerda');
});

test('altar: recarregar com as sete vozes faz o herói ir sozinho até o altar', async ({ page }) => {
  await semearHeroi(page, { concluido: false, ouvidas: ESTATUAS });
  await entrarNoSonho(page);
  await expect(page.locator('.sonho-contador')).toHaveText('Vozes ouvidas: 7 / 7');
  await marco(page, 'caminhada');
  const h = await marco(page, 'altar', 45_000);
  expect(h).toMatchObject({ chegou: true, direcao: 'baixo' });
  expect(Math.hypot(h.x! - ALTAR.x, h.y! - ALTAR.y)).toBeLessThan(4);
  await marco(page, 'climax');
});

test('clima: neblina em camadas e tremores que podem ser desligados nas Opções', async ({ page }, info) => {
  await semearHeroi(page);
  await entrarNoSonho(page);
  await fdg(page, 'teleport', '200,700');
  await page.waitForTimeout(1500);
  await foto(page, 'sonho-neblina', info.project.name);

  // Ligado (padrão): a câmera treme, o som toca
  const antes = (await estado(page)).tremores;
  expect(await fdg(page, 'tremor')).toEqual({ ok: true, cameraTremendo: true });
  expect((await estado(page)).tremorCamera).toBe(true);
  // Espera o tremor acabar antes de pausar (a pausa congela a câmera no meio do tremor)
  await expect.poll(async () => (await estado(page)).cameraTremendo, { timeout: 10_000 }).toBe(false);

  // Desliga em Pausa → Opções → "Tremores de tela"
  await page.locator('.btn-pausa').click();
  await page.getByRole('button', { name: 'Opções' }).click();
  const chave = page.getByLabel('Tremores de tela');
  await expect(chave).toBeChecked();
  await chave.setChecked(false);
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.waitForTimeout(1000);
  expect(await fdg(page, 'tremor')).toEqual({ ok: true, cameraTremendo: false });
  const s2 = await estado(page);
  expect(s2.tremores).toBeGreaterThanOrEqual(antes + 2);
  expect(s2.tremorCamera).toBe(false);
  const salvo = await page.evaluate(() => ((a) => ({ ...(a?.jogo ?? {}), versaoSave: a?.versaoSave, config: JSON.parse(localStorage.getItem('fdg.opcoes') ?? '{}') }))(JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null')).config.tremores);
  expect(salvo).toBe(false);

  // FPS baixo: a neblina perde camadas
  await fdg(page, 'reduzirClima');
  expect((await estado(page)).neblina).toEqual({ camadas: 1, nivel: 1 });
});

test('clima: com prefers-reduced-motion, os tremores de tela começam desligados', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await semearHeroi(page);
  await entrarNoSonho(page);
  expect(await fdg(page, 'tremor')).toEqual({ ok: true, cameraTremendo: false });
  expect((await estado(page)).tremorCamera).toBe(false);
});

test('sonho: Continuar retoma com as vozes já ouvidas; modo de ajuste mostra as colisões', async ({ page }, info) => {
  await semearHeroi(page, { concluido: false, ouvidas: ['solem', 'irae'] });
  await entrarNoSonho(page, '?test=1&debug=1');
  await expect(page.locator('.sonho-contador')).toHaveText('Vozes ouvidas: 2 / 7');
  await expect(page.locator('.debug-coords')).toBeVisible();
  await fdg(page, 'teleport', '627,640');
  await page.waitForTimeout(900);
  await foto(page, 'sonho-debug-colisoes', info.project.name);
});

test('sonho concluído: Continuar abre o Capítulo 01', async ({ page }) => {
  await semearHeroi(page, { concluido: true, ouvidas: ESTATUAS });
  await irAteMenu(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.tela-capitulo')).toBeVisible({ timeout: 15_000 });
});
