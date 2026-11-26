import { expect, test } from '@playwright/test';
import LATERAL from '../src/data/lateral/ato1.json' with { type: 'json' };
import DICAS from '../src/data/tutorial.json' with { type: 'json' };
import {
  ateFala, cenaLateral, efeitosNomes, f, fecharFala, foto, irA, lat, livre, naLateral, salvoAuto, st, umAparelho,
} from './fase6-ajuda';

/* Fase 6: a fase lateral do Ato I (motor e Partes 2 a 5). */

const P = (LATERAL as unknown as { partes: Record<string, any> }).partes;
const fotoGrande = (nome: string) => nome === 'pixel-7' || nome === 'paisagem-844x390';

/* ======================================================================
   1. Motor lateral e Parte 2 · O túnel
   ====================================================================== */

test('motor lateral: câmera só na horizontal, faixa de chão, pulo (botão e Espaço), parallax da frente e a luz da tocha seguindo o herói', async ({ page }, info) => {
  test.setTimeout(180_000);
  // O cartão dura ~2 s: um observador anota cada cartão que aparece (com a máquina carregada, o teste pode chegar depois dele).
  await page.addInitScript(() => {
    const w = window as unknown as { __cartoes: string[] };
    w.__cartoes = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.cartao-tela.cartao-parte')) {
        const t = el.textContent?.trim() ?? '';
        if (t && !w.__cartoes.includes(t)) w.__cartoes.push(t);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await naLateral(page, 2, { coletados: ['lateral:p2:poca'] });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __cartoes: string[] }).__cartoes), { timeout: 30_000 }).toContain('Parte 2 · O túnel');
  await cenaLateral(page, 't-inicio', 30_000);
  await ateFala(page, 'Por que Artho me mandou para cá?');
  await fecharFala(page);
  await livre(page);
  const a = await lat(page);
  expect(a.camY).toBe(0);
  // Luz ambiente quase nenhuma (8%) e o círculo da tocha em volta do herói (~30% da altura).
  expect(a.luz.ambiente).toBeCloseTo(0.08, 2);
  expect(a.luz.raio).toBeGreaterThan(220);
  expect(a.luz.raio).toBeLessThan(300);
  if (fotoGrande(info.project.name)) await foto(page, info, 'tunel-tocha');
  // Anda para a direita (teclado): a câmera acompanha só no x.
  // Segura até andar 200 px (com a máquina carregada o quadro cai; o tempo fixo não basta).
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await lat(page)).x, { timeout: 20_000, intervals: [200] }).toBeGreaterThan(a.x + 200);
  await page.keyboard.up('ArrowRight');
  const b = await lat(page);
  expect(b.camY).toBe(0);
  expect(b.camX).toBeGreaterThanOrEqual(a.camX);
  expect(b.luz.x).toBe(b.x);
  // Parallax: a camada da frente anda 1,25 vez o que a câmera andou.
  const dCam = b.camX - a.camX;
  if (dCam > 50) {
    const dFrente = a.frente[0].x - b.frente[0].x;
    expect(dFrente / dCam).toBeGreaterThan(1.15);
    expect(dFrente / dCam).toBeLessThan(1.35);
  }
  // Faixa de chão: para cima até o fundo (escala 0,9) e para baixo até a frente (1,0).
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowUp');
  const cima = await lat(page);
  expect(cima.y).toBe(585);
  expect(cima.escala).toBeCloseTo(0.9, 2);
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(1800); await page.keyboard.up('ArrowDown');
  const baixo = await lat(page);
  expect(baixo.y).toBe(790);
  expect(baixo.escala).toBeCloseTo(1, 2);
  // Pulo com Espaço.
  await page.keyboard.press('Space');
  await expect.poll(async () => (await lat(page)).z, { timeout: 2000, intervals: [30] }).toBeGreaterThan(40);
  await expect.poll(async () => (await lat(page)).noAr, { timeout: 3000 }).toBe(false);
  // Botão PULAR (no celular).
  const btn = page.locator('.btn-pular');
  if (await btn.isVisible()) {
    const caixa = (await btn.boundingBox())!;
    expect(caixa.width).toBeGreaterThanOrEqual(44);
    await btn.dispatchEvent('pointerdown');
    await expect.poll(async () => (await lat(page)).z, { timeout: 2000, intervals: [30] }).toBeGreaterThan(40);
  }
});

test('Parte 2: os gatilhos aparecem uma vez; teto baixo com metade da velocidade; termina na Parte 3', async ({ page }) => {
  test.setTimeout(180_000);
  await naLateral(page, 2);
  await cenaLateral(page, 't-inicio', 30_000);
  await fecharFala(page);
  await livre(page);
  await irA(page, 1000, 700);
  await cenaLateral(page, 't-poca');
  await ateFala(page, 'Lá em cima, a vila queima');
  await fecharFala(page);
  await livre(page);
  await irA(page, 900, 700);
  await irA(page, 1050, 700);
  await page.waitForTimeout(600);
  expect((await st(page)).cena).toBeNull();
  await irA(page, 2100, 700);
  await cenaLateral(page, 't-teto');
  await fecharFala(page);
  await livre(page);
  // Teto baixo: metade da velocidade (e o normal depois dele).
  await expect.poll(async () => (await lat(page)).velocidade).toBe(0.5);
  await irA(page, 2900, 700);
  await expect.poll(async () => (await lat(page)).velocidade).toBe(1);
  // (A memória tem o seu próprio teste.)
  await irA(page, 3010, 700);
  await cenaLateral(page, 't-memoria');
  for (let i = 0; i < 8; i++) { if ((await st(page)).cena !== 't-memoria') break; await fecharFala(page); }
  await livre(page);
  await irA(page, 4520, 700);
  await cenaLateral(page, 't-laje');
  await fecharFala(page);
  await irA(page, 5200, 700);
  await expect.poll(async () => (await salvoAuto(page))?.jogo?.campanha?.parte, { timeout: 20_000 }).toBe(3);
  await expect(page.locator('.cartao-tela.cartao-parte')).toHaveText('Parte 3 · Os símbolos', { timeout: 30_000 });
});

for (const reduzidas of [false, true]) {
  test(`Parte 2: a memória da mãe ${reduzidas ? 'sem efeitos (animações reduzidas)' : 'tremula e fragmenta, fica nítida na Liessa e se estilhaça'}`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await naLateral(page, 2, { coletados: ['lateral:p2:inicio', 'lateral:p2:poca', 'lateral:p2:teto'], local: { tela: 'lateral', x: 2900, y: 700 }, cena: null }, { config: { animacoesReduzidas: reduzidas } });
    await livre(page, 40_000);
    await irA(page, 3010, 700);
    await cenaLateral(page, 't-memoria');
    await ateFala(page, 'Uma lembrança atravessa o escuro');
    await expect.poll(async () => (await st(page)).memoria?.ativa).toBe(!reduzidas);
    expect((await st(page)).musicaAbafada).toBe(true);
    if (!reduzidas && umAparelho(info)) { await page.waitForTimeout(900); await foto(page, info, 'memoria'); }
    await ateFala(page, 'Porque queremos que você tenha certeza');
    const nitida = (await st(page)).memoria;
    expect(nitida.modo).toBe('memoria-nitida');
    expect(nitida.ativa).toBe(false);
    await ateFala(page, 'Eu queria ser forte.');
    const fim = (await st(page)).memoria;
    expect(fim.quebrada).toBe(true);
    expect(fim.cacos).toBe(reduzidas ? 0 : 24);
    await fecharFala(page);
    expect((await st(page)).flags).toContain('memoria_liessa');
    expect((await st(page)).caderno.anotacoes).toContain('memoria-liessa');
  });
}

/* ======================================================================
   2. Parte 3 · Os símbolos
   ====================================================================== */

const G3 = P['3'].grade;
const centro = (g: any, col: number, lin: number) => ({
  x: g.x + col * g.larguraLaje + g.larguraLaje / 2,
  y: g.y + g.alturas.slice(0, lin).reduce((a: number, b: number) => a + b, 0) + g.alturas[lin] / 2,
});

test('Parte 3: o tabuleiro tem um caminho seguro (só os outros 6), com pelo menos 4 trocas de fileira; os sóis bloqueiam as linhas retas', () => {
  const t: string[] = G3.tabuleiro;
  expect(t.length).toBe(4);
  expect(t.every((l) => l.length === 12)).toBe(true);
  expect(t.every((l) => l[0] === 'S')).toBe(true);
  for (const l of t) expect(l.slice(1)).toContain('S');
  // Menor número de trocas de fileira num caminho só de não-Sólem, da coluna 2 à 12.
  const custo = new Map<string, number>();
  const fila: [number, number, number][] = [];
  for (let lin = 0; lin < 4; lin++) if (t[lin][1] !== 'S') { fila.push([1, lin, 0]); custo.set(`1,${lin}`, 0); }
  let melhor = Infinity;
  while (fila.length) {
    fila.sort((a, b) => a[2] - b[2]);
    const [c, l, k] = fila.shift()!;
    if (c === 11) melhor = Math.min(melhor, k);
    for (const [dc, dl, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]]) {
      const nc = c + dc, nl = l + dl;
      if (nc < 1 || nc > 11 || nl < 0 || nl > 3 || t[nl][nc] === 'S') continue;
      const nk = k + dk, ch = `${nc},${nl}`;
      if ((custo.get(ch) ?? Infinity) <= nk) continue;
      custo.set(ch, nk);
      fila.push([nc, nl, nk]);
    }
  }
  expect(melhor).toBeLessThan(Infinity);
  expect(melhor).toBeGreaterThanOrEqual(4);
});

/** O caminho seguro, casa a casa (coluna, linha), a partir da coluna 2. */
const CAMINHO: [number, number][] = [[1, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 3], [5, 3], [6, 3], [6, 2], [6, 1], [7, 1], [8, 1], [8, 0], [9, 0], [10, 0], [10, 1], [11, 1]];

test('Parte 3: a primeira flecha é inevitável e dispara o LEVANTE; pistas (passiva e nome da laje); o caminho seguro dá a tolerância', async ({ page }, info) => {
  test.setTimeout(240_000);
  await naLateral(page, 3, { pvAtual: 12 });
  await cenaLateral(page, 's-inscricao', 30_000);
  await ateFala(page, 'A luz de Sólem banha todos os caminhos');
  // Parado ao lado da primeira laje de Sólem (logo no começo): o teste passivo (Audição/Visão) e o de
  // Religião (o nome da laje).
  await f(page, 'forceRoll', [20, 20]);
  await fecharFala(page);
  const c0 = centro(G3, 0, 1);
  await expect.poll(async () => (await st(page)).cena, { timeout: 30_000 }).toMatch(/^s-solta-/);
  await fecharFala(page);
  await expect.poll(async () => (await st(page)).nomeLaje, { timeout: 20_000 }).toBe('Laje de Sólem');
  await livre(page);
  if (fotoGrande(info.project.name)) await foto(page, info, 'tabuleiro');
  // A primeira flecha: a coluna 1 é toda de Sólem.
  await f(page, 'forceRoll', [1]);
  await f(page, 'forceDano', [3]);
  await irA(page, c0.x, c0.y);
  await cenaLateral(page, 's-levante', 20_000);
  expect(await efeitosNomes(page)).toEqual(expect.arrayContaining(['armadilha-estalo', 'flecha-nyme']));
  await ateFala(page, 'LEVANTE!');
  if (umAparelho(info)) await foto(page, info, 'levante');
  await fecharFala(page);
  await livre(page);
  let s = await st(page);
  expect(s.flags).toContain('levantou');
  expect(s.pv).toBe(9);
  // O caminho seguro, sem mais flechas.
  for (const [col, lin] of CAMINHO) {
    const c = centro(G3, col, lin);
    await irA(page, c.x, c.y);
  }
  await livre(page);
  s = await st(page);
  expect(s.contadores.flechas_p3).toBe(1);
  await irA(page, P['3'].fim + 5, centro(G3, 11, 1).y);
  await cenaLateral(page, 's-fim');
  await fecharFala(page);
  expect((await st(page)).flags).toContain('caminho_tolerancia');
  await expect.poll(async () => (await salvoAuto(page))?.jogo?.campanha?.parte, { timeout: 20_000 }).toBe(4);
});

test('Parte 3: flechas extras tiram a tolerância e trazem a ajuda progressiva (2ª e 3ª flechas)', async ({ page }) => {
  test.setTimeout(240_000);
  await naLateral(page, 3, {
    pvAtual: 30, flags: ['fim_capitulo_02', 'nyme_caiu', 'levantou'], contadores: { flechas_p3: 1 },
    coletados: ['lateral:p3:inscricao', 'lateral:p3:passivo', 'lateral:p3:religiao', 'lateral:p3:laje:0,1'],
  }, { config: { tutorial: true, dicasVistas: (DICAS as { id: string }[]).map((d) => d.id) } });
  await livre(page, 40_000);
  await f(page, 'forceRoll', [1, 1]);
  await f(page, 'forceDano', [1, 1]);
  let c = centro(G3, 2, 0);
  await irA(page, c.x, c.y);
  await cenaLateral(page, 's-flecha2', 20_000);
  await ateFala(page, 'Será que o caminho não é só dele?');
  await fecharFala(page);
  await livre(page);
  c = centro(G3, 3, 1);
  await irA(page, c.x, c.y);
  await cenaLateral(page, 's-flecha3', 20_000);
  await ateFala(page, 'Sólem não pede que você o siga sozinho');
  await fecharFala(page);
  await livre(page);
  expect((await st(page)).contadores.flechas_p3).toBe(3);
  await irA(page, P['3'].fim + 5, 700);
  await cenaLateral(page, 's-fim');
  await fecharFala(page);
  expect((await st(page)).flags).not.toContain('caminho_tolerancia');
});

/* ======================================================================
   3. Parte 4 · O corredor de Sólem
   ====================================================================== */

const G4 = P['4'].grade;

test('Parte 4: Audição dá +2; o pulo com Atletismo alcança 3 lajes (sucesso) ou 2 (falha); cada pouso dispara a flecha', async ({ page }, info) => {
  test.setTimeout(240_000);
  await naLateral(page, 4, { pvAtual: 30, flags: ['fim_capitulo_02', 'nyme_caiu', 'levantou'] });
  await cenaLateral(page, 'c-chegada', 30_000);
  await ateFala(page, 'Só o sol. De um lado ao outro.');
  await fecharFala(page);
  await livre(page);
  // Audição (SAB) CD 14, pelo botão de interação (E).
  await irA(page, P['4'].audicao.x, 700);
  await expect.poll(async () => (await st(page)).interacao).toBe(true);
  await f(page, 'forceRoll', [20]);
  await page.keyboard.press('KeyE');
  await cenaLateral(page, 'c-audicao', 20_000);
  await fecharFala(page);
  await livre(page);
  expect((await st(page)).flags).toContain('ouviu_mecanismo');
  // Pulo com sucesso: 3 lajes (da frente da grade até a 3ª).
  await irA(page, G4.x - 80, 700);
  await f(page, 'forceRoll', [15, 1]);
  await f(page, 'forceDano', [2]);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await lat(page)).noAr, { timeout: 10_000, intervals: [50] }).toBe(true);
  if (fotoGrande(info.project.name)) await foto(page, info, 'corredor-pulo');
  await expect.poll(async () => (await st(page)).casa?.col, { timeout: 10_000 }).toBe(2);
  await livre(page);
  expect((await st(page)).contadores.flechas_p4).toBe(1);
  // Pulo com falha: 2 lajes (da 3ª até a 5ª).
  await f(page, 'forceRoll', [2, 20]);
  await f(page, 'forceDano', [4]);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await st(page)).casa?.col, { timeout: 10_000 }).toBe(4);
  await livre(page);
  const s = await st(page);
  expect(s.contadores.flechas_p4).toBe(2);
  // Reflexos (com o +2 da Audição) passou no 20: o dano 4 cai à metade.
  expect(s.pv).toBe(30 - 2 - 2);
  // 20 natural: atravessa tudo.
  await f(page, 'forceRoll', [20]);
  await page.keyboard.press('Space');
  await cenaLateral(page, 'c-fim', 20_000);
  await ateFala(page, 'Eu não posso desistir. Não ainda.');
  await fecharFala(page);
  expect((await st(page)).flags).toContain('atravessou_solem');
  await expect.poll(async () => (await salvoAuto(page))?.jogo?.campanha?.parte, { timeout: 20_000 }).toBe(5);
});

test('Parte 4: andar sem pular também pousa na laje; a segunda queda a 0 PV é game over e o Continuar volta ao início da parte, sem a flag levantou', async ({ page }) => {
  test.setTimeout(240_000);
  await naLateral(page, 4, { pvAtual: 2, flags: ['fim_capitulo_02', 'nyme_caiu', 'levantou'], coletados: ['lateral:p4:chegada'] });
  await livre(page, 40_000);
  await f(page, 'forceRoll', [1]);
  await f(page, 'forceDano', [4]);
  const c = centro(G4, 0, 2);
  await irA(page, c.x, c.y);
  await expect(page.locator('.tela-game-over')).toBeVisible({ timeout: 30_000 });
  await page.locator('.tela-game-over').getByRole('button', { name: 'Continuar' }).click({ timeout: 10_000 });
  await expect.poll(async () => (await st(page)).tela, { timeout: 60_000 }).toBe('lateral');
  const s = await st(page);
  expect(s.parte).toBe(4);
  expect(s.flags).not.toContain('levantou');
  expect(s.pv).toBeGreaterThanOrEqual(1);
});

/* ======================================================================
   4. Parte 5 · A escuridão e a porta
   ====================================================================== */

for (const leal of [true, false]) {
  test(`Parte 5: a tocha apaga, voltar é bloqueado, Vontade grava a flag, a lembrança da Nyme ${leal ? 'aparece (Leal)' : 'não aparece'}, as tochas acendem e a porta abre`, async ({ page }, info) => {
    test.setTimeout(360_000);
    await naLateral(page, 5, { relacoes: { nyme: leal ? 6 : 2 } });
    await cenaLateral(page, 'e-apaga', 40_000);
    const l = await lat(page);
    expect(l.luz.acesa).toBe(false);
    expect(l.luz.ambiente).toBeCloseTo(0.03, 2);
    expect(await efeitosNomes(page)).toContain('vento-sopro');
    if (leal && fotoGrande(info.project.name)) await foto(page, info, 'escuro-total');
    await fecharFala(page);
    await livre(page);
    // Voltar: o pensamento e a parede invisível.
    await irA(page, P['5'].avisoVoltar - 20, 700);
    await cenaLateral(page, 'e-voltar');
    await fecharFala(page);
    await livre(page);
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(800); await page.keyboard.up('ArrowLeft');
    expect((await lat(page)).x).toBeGreaterThanOrEqual(P['5'].parede);
    // O primeiro passo para a direita: Vontade (SAB) CD 12.
    await f(page, 'forceRoll', [20]);
    await irA(page, P['5'].inicio.x + 60, 700);
    await cenaLateral(page, 'e-vontade-ok', 20_000);
    await fecharFala(page);
    if (leal) { await cenaLateral(page, 'e-nyme'); await ateFala(page, 'mas sempre chega'); await fecharFala(page); }
    await livre(page);
    expect((await st(page)).flags).toContain('coragem_escuro');
    expect((await st(page)).cena).toBeNull();
    // As tochas acendem em cascata, até a porta.
    await irA(page, P['5'].acenderEm + 10, 700);
    await expect.poll(async () => (await lat(page)).tochasAcesas, { timeout: 10_000 }).toBeGreaterThan(1);
    if (leal && fotoGrande(info.project.name)) await foto(page, info, 'tochas-acendendo');
    await expect.poll(async () => (await lat(page)).tochasAcesas, { timeout: 15_000 }).toBe(P['5'].tochas.length);
    expect(await efeitosNomes(page)).toContain('tochas-acendendo');
    await expect.poll(async () => (await lat(page)).luz.ambiente, { timeout: 10_000 }).toBeGreaterThan(0.55);
    await expect.poll(async () => (await st(page)).caderno.anotacoes, { timeout: 10_000 }).toContain('tochas');
    // A porta.
    await irA(page, P['5'].porta.x - 100, 700);
    await expect.poll(async () => (await st(page)).interacao).toBe(true);
    await page.keyboard.press('KeyE');
    await cenaLateral(page, 'e-porta');
    await expect(page.locator('.palco-cena .cena-fundo.visivel')).toHaveAttribute('data-cena', 'cena-porta-solem');
    await fecharFala(page);
    await expect.poll(async () => (await efeitosNomes(page)).includes('porta-antiga'), { timeout: 10_000 }).toBe(true);
    await expect.poll(async () => (await salvoAuto(page))?.jogo?.campanha?.parte, { timeout: 20_000 }).toBe(6);
  });
}
