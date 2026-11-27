import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import LATERAL from '../src/data/lateral/ato1.json' with { type: 'json' };
import DICAS from '../src/data/tutorial.json' with { type: 'json' };
import { centroLaje, colunas, contarCaminhos, dentroDaFaixa, ehQuebrada, juntaX, linhas, menorTrocas, type GradeLajes } from '../src/exploracao/grade';
import {
  ateFala, cenaLateral, efeitosNomes, f, fecharFala, foto, irA, lat, livre, naLateral, salvoAuto, st, umAparelho,
} from './fase6-ajuda';

/* Fase 6 e 6B: a fase lateral do Ato I (motor e Partes 2 a 5). */

/** Anota todo cartão que aparecer (a Fase 6B tirou os de "Parte N"). */
const vigiarCartoes = (page: Page) => page.addInitScript(() => {
  const w = window as unknown as { __cartoes: string[] };
  w.__cartoes = [];
  new MutationObserver(() => {
    for (const el of document.querySelectorAll('.cartao-tela')) {
      const t = el.textContent?.trim() ?? '';
      if (t && !w.__cartoes.includes(t)) w.__cartoes.push(t);
    }
  }).observe(document, { childList: true, subtree: true, characterData: true });
});
const cartoesVistos = (page: Page) => page.evaluate(() => (window as unknown as { __cartoes?: string[] }).__cartoes ?? []);
/** Nenhum texto visível com "Parte" seguido de número. */
const semParteN = async (page: Page) => {
  expect(await page.evaluate(() => /Parte\s*\d/.test(document.body.innerText))).toBe(false);
  expect((await cartoesVistos(page)).filter((t) => /Parte\s*\d/.test(t))).toEqual([]);
};

const P = (LATERAL as unknown as { partes: Record<string, any> }).partes;
const fotoGrande = (nome: string) => nome === 'pixel-7' || nome === 'paisagem-844x390';

/* ======================================================================
   1. Motor lateral e Parte 2 · O túnel
   ====================================================================== */

test('motor lateral: câmera só na horizontal, faixa de chão, pulo (botão e Espaço), parallax da frente e a luz da tocha seguindo o herói', async ({ page }, info) => {
  test.setTimeout(180_000);
  await vigiarCartoes(page);
  await naLateral(page, 2, { coletados: ['lateral:p2:poca'] });
  await cenaLateral(page, 't-inicio', 30_000);
  // Fase 6B: sem cartão de "Parte N" (só o fade curto da entrada).
  await semParteN(page);
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
  // Botão PULAR (Fase 6B: sempre visível), à direita e acima do botão de interação, com 44 px no mínimo.
  const btn = page.locator('.btn-pular');
  await expect(btn).toBeVisible();
  const caixa = (await btn.boundingBox())!;
  expect(caixa.width).toBeGreaterThanOrEqual(44);
  expect(caixa.height).toBeGreaterThanOrEqual(44);
  const vp = page.viewportSize()!;
  expect(caixa.x + caixa.width / 2).toBeGreaterThan(vp.width / 2);
  await btn.dispatchEvent('pointerdown');
  await expect.poll(async () => (await lat(page)).z, { timeout: 2000, intervals: [30] }).toBeGreaterThan(40);
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
  // Os símbolos: o card de save mostra o nome do lugar, sem "Parte 3".
  await expect.poll(async () => (await salvoAuto(page))?.meta?.local, { timeout: 20_000 }).toBe('Os símbolos');
  await expect.poll(async () => (await st(page)).parte, { timeout: 30_000 }).toBe(3);
  expect((await page.locator('.cartao-tela').count())).toBe(0);
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
   2. A grade alinhada com o piso e os dois tabuleiros (dados)
   ====================================================================== */

const G3 = P['3'].grade as GradeLajes;
const G4 = P['4'].grade as GradeLajes;
const PAINEIS = (LATERAL as unknown as { paineis: { id: string; x: number; w: number; chao: [number, number] }[] }).paineis;
const pe = (g: GradeLajes, col: number, lin: number) => { const c = centroLaje(g, col, lin); return { x: c.x, y: c.y }; };
const passouDa = (g: GradeLajes, y: number) => juntaX(g, colunas(g), y) + 60;

for (const [nome, g, painel] of [['corredor-1', G3, 'corredor-1'], ['corredor-2', G4, 'corredor-2']] as const) {
  test(`grade do ${nome}: 4 fileiras dentro da faixa de chão, uma laje lógica por laje pintada`, () => {
    const pn = PAINEIS.find((q) => q.id === painel)!;
    expect(linhas(g)).toBe(4);
    expect(g.tabuleiro.length).toBe(4);
    expect(g.tabuleiro.every((l) => l.length === colunas(g))).toBe(true);
    expect(dentroDaFaixa(g, pn.chao)).toBe(true);
    // As juntas ficam dentro do painel e na ordem (sem lajes cruzadas).
    for (let i = 0; i < g.juntas.length; i++) {
      for (const y of g.fileiras) {
        expect(juntaX(g, i, y)).toBeGreaterThanOrEqual(pn.x - 1);
        expect(juntaX(g, i, y)).toBeLessThanOrEqual(pn.x + pn.w + 1);
        if (i) expect(juntaX(g, i, y)).toBeGreaterThan(juntaX(g, i - 1, y) + 80);
      }
    }
  });
}

test('primeiro tabuleiro (corredor-1): a primeira coluna tem uma laje segura; existe um caminho sem Sólem, com pelo menos 4 trocas de fileira', () => {
  expect([0, 1, 2, 3].some((lin) => G3.tabuleiro[lin][0] !== 'S')).toBe(true);
  const trocas = menorTrocas(G3, (l) => l !== 'S');
  expect(trocas).not.toBeNull();
  expect(trocas!).toBeGreaterThanOrEqual(4);
  // Nenhuma linha reta sem Sólem.
  for (const linha of G3.tabuleiro) expect(linha).toContain('S');
});

test('segundo tabuleiro (corredor-2): o único caminho seguro é o de Sólem, com 4+ trocas de fileira e duas lajes quebradas nele', () => {
  expect(colunas(G4)).toBeGreaterThanOrEqual(9);
  expect(contarCaminhos(G4, (l) => l === 'S')).toBe(1);
  expect(menorTrocas(G4, (l) => l === 'S')!).toBeGreaterThanOrEqual(4);
  // Fora do caminho, só os outros 6 deuses (todas as lajes de Sólem estão no caminho).
  const sois = G4.tabuleiro.join('').split('').filter((l) => l === 'S').length;
  expect(sois).toBe(CAMINHO4.length);
  expect(G4.quebradas?.length).toBe(2);
  for (const [c, l] of G4.quebradas!) {
    expect(G4.tabuleiro[l][c]).toBe('S');
    // Dá para pular: a laje de trás e a da frente são de Sólem, na mesma fileira.
    expect(G4.tabuleiro[l][c - 1]).toBe('S');
    expect(G4.tabuleiro[l][c + 1]).toBe('S');
  }
});

/** O caminho seguro do primeiro tabuleiro (coluna, fileira). */
const CAMINHO3: [number, number][] = [[0, 2], [1, 2], [1, 1], [2, 1], [3, 1], [3, 0], [4, 0], [4, 1], [4, 2], [4, 3], [5, 3], [6, 3], [6, 2], [7, 2], [7, 1], [8, 1]];
/** O caminho de Sólem do segundo (as quebradas no meio: 2,1 e 6,2). */
const CAMINHO4: [number, number][] = [[0, 1], [1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [4, 3], [5, 3], [5, 2], [6, 2], [7, 2], [7, 1], [7, 0], [8, 0]];

/* ======================================================================
   3. Parte 3 · Os símbolos (a tolerância)
   ====================================================================== */

test('Parte 3: os símbolos ficam no centro das lajes pintadas; Religião com a frase de antes e a de depois, e os nomes aparecem', async ({ page }, info) => {
  test.setTimeout(240_000);
  await naLateral(page, 3, { pvAtual: 12 });
  await cenaLateral(page, 's-inscricao', 30_000);
  await ateFala(page, 'A luz de Sólem banha todos os caminhos');
  // Cada símbolo no centro da sua laje.
  for (const l of (await lat(page) as any).lajes) {
    const c = centroLaje(G3, l.col, l.lin);
    expect(Math.abs(l.x - c.x)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(l.y - c.y)).toBeLessThanOrEqual(1.5);
  }
  // Parado diante da primeira coluna, na fileira de baixo (Sólem): o teste passivo e o de Religião.
  await f(page, 'forceRoll', [20, 15]);
  await fecharFala(page);
  await irA(page, juntaX(G3, 0, 740) - 50, 740);
  await expect.poll(async () => (await st(page)).cena, { timeout: 30_000 }).toMatch(/^s-solta-/);
  await fecharFala(page);
  // Antes do dado: a frase do que o herói tenta.
  await cenaLateral(page, 's-religiao', 20_000);
  await ateFala(page, 'Artho me fez decorar cada um deles');
  await ateFala(page, '(Religião CD 10)');
  await fecharFala(page);
  // O dado (o selo mostra a perícia) e, depois, o que mudou.
  await cenaLateral(page, 's-religiao-ok', 20_000);
  await ateFala(page, 'Você reconhece todos.');
  if (umAparelho(info)) await foto(page, info, 'religiao-ok');
  await fecharFala(page);
  await expect.poll(async () => (await st(page)).nomeLaje, { timeout: 20_000 }).toBe('Laje de Sólem');
  await expect(page.locator('.lateral-nome-laje.destaque')).toBeVisible();
  const reg = (await st(page)).registro as { texto: string }[];
  expect(reg.map((r) => r.texto)).toEqual(expect.arrayContaining([expect.stringMatching(/^Religião \(CD 10\): /)]));
  expect((await st(page)).flags).toContain('nomes_lajes');
});

test('Parte 3: na falha de Religião os nomes não aparecem; o passivo que falha não mostra nada', async ({ page }) => {
  test.setTimeout(240_000);
  await naLateral(page, 3, { pvAtual: 12, coletados: ['lateral:p3:inscricao'] });
  await livre(page, 40_000);
  await f(page, 'forceRoll', [1, 1]);
  await irA(page, juntaX(G3, 0, 740) - 50, 740);
  // O passivo falhou: nenhuma fala de pista; direto a Religião.
  await cenaLateral(page, 's-religiao', 30_000);
  await fecharFala(page);
  await cenaLateral(page, 's-religiao-falha', 20_000);
  await ateFala(page, 'os nomes fogem da sua memória');
  await fecharFala(page);
  await livre(page);
  expect((await st(page)).nomeLaje).toBeNull();
  expect((await st(page)).flags).not.toContain('nomes_lajes');
});

test('Parte 3: a primeira flecha traz a visão, sem o "LEVANTE!"; o caminho sem Sólem atravessa o resto sem flechas', async ({ page }, info) => {
  test.setTimeout(240_000);
  await naLateral(page, 3, { pvAtual: 12, coletados: ['lateral:p3:inscricao', 'lateral:p3:passivo', 'lateral:p3:religiao'] });
  await livre(page, 40_000);
  if (fotoGrande(info.project.name)) await foto(page, info, 'tabuleiro');
  // Uma laje de Sólem na primeira coluna.
  await f(page, 'forceRoll', [1]);
  await f(page, 'forceDano', [3]);
  const s0 = pe(G3, 0, 1);
  await irA(page, s0.x, s0.y);
  await cenaLateral(page, 's-visao', 20_000);
  expect(await efeitosNomes(page)).toEqual(expect.arrayContaining(['armadilha-estalo', 'flecha-nyme']));
  await ateFala(page, 'Se você quer ser forte, continue.');
  if (umAparelho(info)) await foto(page, info, 'visao');
  await fecharFala(page);
  await livre(page);
  let s = await st(page);
  expect(s.flags).toContain('visao_vista');
  expect(s.flags).not.toContain('levantou');
  expect(s.pv).toBe(9);
  // A frase da flecha (Reflexos) foi para o Diário.
  expect((s.registro as { texto: string }[]).some((r) => r.texto.startsWith('Reflexos (CD 12)'))).toBe(true);
  // O caminho sem Sólem, sem mais flechas.
  await irA(page, juntaX(G3, 0, 650) - 40, 650);
  for (const [col, lin] of CAMINHO3) { const c = pe(G3, col, lin); await irA(page, c.x, c.y); }
  await livre(page);
  s = await st(page);
  expect(s.contadores.flechas_p3).toBe(1);
  const fim = pe(G3, 8, 1);
  await irA(page, passouDa(G3, fim.y), fim.y);
  await cenaLateral(page, 's-fim');
  await fecharFala(page);
  // Uma flecha: sem a tolerância.
  expect((await st(page)).flags).not.toContain('caminho_tolerancia');
  await expect.poll(async () => (await salvoAuto(page))?.jogo?.campanha?.parte, { timeout: 20_000 }).toBe(4);
});

test('Parte 3: atravessar sem nenhuma flecha dá a tolerância (e a visão não aparece)', async ({ page }) => {
  test.setTimeout(240_000);
  await naLateral(page, 3, { pvAtual: 12, coletados: ['lateral:p3:inscricao', 'lateral:p3:passivo', 'lateral:p3:religiao'] });
  await livre(page, 40_000);
  await irA(page, juntaX(G3, 0, 650) - 40, 650);
  for (const [col, lin] of CAMINHO3) { const c = pe(G3, col, lin); await irA(page, c.x, c.y); }
  const fim = pe(G3, 8, 1);
  await irA(page, passouDa(G3, fim.y), fim.y);
  await cenaLateral(page, 's-fim', 20_000);
  await fecharFala(page);
  const s = await st(page);
  expect(s.flags).toContain('caminho_tolerancia');
  expect(s.flags).not.toContain('visao_vista');
  expect(s.contadores.flechas_p3 ?? 0).toBe(0);
});

test('LEVANTE: só a 0 PV (volta com 1 PV); a 2ª flecha e a 3ª trazem a ajuda progressiva', async ({ page }) => {
  test.setTimeout(240_000);
  await naLateral(page, 3, {
    pvAtual: 3, flags: ['fim_capitulo_02', 'nyme_caiu', 'visao_vista'], contadores: { flechas_p3: 1 },
    coletados: ['lateral:p3:inscricao', 'lateral:p3:passivo', 'lateral:p3:religiao', 'lateral:p3:laje:0,1'],
  }, { config: { tutorial: true, dicasVistas: (DICAS as { id: string }[]).map((d) => d.id) } });
  await livre(page, 40_000);
  // 2ª flecha, 4 de dano: os PV chegam a 0 → LEVANTE (texto grande), volta com 1 PV.
  await f(page, 'forceRoll', [1]);
  await f(page, 'forceDano', [4]);
  let c = pe(G3, 1, 0);
  await irA(page, c.x, c.y);
  await cenaLateral(page, 's-levante', 20_000);
  await ateFala(page, 'LEVANTE!');
  await expect(page.locator('.cena-caixa.estilo-levante')).toBeVisible();
  await fecharFala(page);
  await cenaLateral(page, 's-flecha2', 20_000);
  await fecharFala(page);
  await livre(page);
  const s = await st(page);
  expect(s.flags).toContain('levantou');
  expect(s.pv).toBe(1);
});

/* ======================================================================
   4. Parte 4 · O corredor de Sólem (o inverso)
   ====================================================================== */

test('Parte 4: a voz interior na chegada e diante da primeira laje; o caminho de Sólem com os dois pulos (sucesso, falha e 20 natural); seguiu_a_luz e a visão como recompensa', async ({ page }, info) => {
  test.setTimeout(300_000);
  await naLateral(page, 4, { pvAtual: 30, contadores: { flechas_p3: 0 } });
  await cenaLateral(page, 'c-chegada', 30_000);
  await ateFala(page, 'Lá atrás, quem pisava só no sol tropeçava');
  await ateFala(page, 'E se aqui… for o contrário?');
  await fecharFala(page);
  await livre(page);
  // Audição (SAB) CD 14, pelo botão de interação (E): a frase de antes e a de depois.
  await irA(page, P['4'].audicao.x, 700);
  await expect.poll(async () => (await st(page)).interacao).toBe(true);
  await f(page, 'forceRoll', [20]);
  await page.keyboard.press('KeyE');
  await cenaLateral(page, 'c-audicao', 20_000);
  await fecharFala(page);
  await livre(page);
  expect((await st(page)).flags).toContain('ouviu_mecanismo');
  // Parado diante da primeira laje: "Na casa de Sólem, quem foge da luz se perde no escuro."
  const y1 = pe(G4, 0, 1).y;
  await irA(page, juntaX(G4, 0, y1) - 60, y1);
  await cenaLateral(page, 'c-primeira', 20_000);
  await fecharFala(page);
  await livre(page);
  // O caminho de Sólem até a primeira quebrada.
  for (const [col, lin] of [[0, 1], [1, 1]]) { const c = pe(G4, col, lin); await irA(page, c.x, c.y); }
  // Pulo com sucesso (Atletismo 15).
  await f(page, 'forceRoll', [15]);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await lat(page)).noAr, { timeout: 10_000, intervals: [50] }).toBe(true);
  if (fotoGrande(info.project.name)) await foto(page, info, 'corredor-pulo');
  await expect.poll(async () => (await st(page)).casa, { timeout: 10_000 }).toEqual({ col: 3, lin: 1 });
  await livre(page);
  for (const [col, lin] of [[3, 2], [3, 3], [4, 3], [5, 3], [5, 2]]) { const c = pe(G4, col, lin); await irA(page, c.x, c.y); }
  await livre(page);
  // Pulo com falha: cai na beira (1d4) e volta para a laje de trás.
  await f(page, 'forceRoll', [2]);
  await f(page, 'forceDano', [3]);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await st(page)).casa, { timeout: 15_000 }).toEqual({ col: 5, lin: 2 });
  await livre(page);
  expect((await st(page)).pv).toBe(27);
  // 20 natural: atravessa e "Você nem sentiu o vão."
  await f(page, 'forceRoll', [20]);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await st(page)).aviso, { timeout: 10_000 }).toBe('Você nem sentiu o vão.');
  await expect.poll(async () => (await st(page)).casa, { timeout: 10_000 }).toEqual({ col: 7, lin: 2 });
  await livre(page);
  for (const [col, lin] of [[7, 1], [7, 0], [8, 0]]) { const c = pe(G4, col, lin); await irA(page, c.x, c.y); }
  await livre(page);
  expect((await st(page)).contadores.flechas_p4 ?? 0).toBe(0);
  const fim = pe(G4, 8, 0);
  await irA(page, passouDa(G4, fim.y), fim.y);
  await cenaLateral(page, 'c-fim', 20_000);
  await ateFala(page, 'Desta vez, a luz não feriu. Guiou.');
  await ateFala(page, 'Eu não posso desistir. Não ainda.');
  await fecharFala(page);
  // Nenhuma flecha nos dois tabuleiros: a visão, sem queda, como recompensa.
  await cenaLateral(page, 'c-visao', 20_000);
  await ateFala(page, 'Se você quer ser forte, continue.');
  await fecharFala(page);
  const s = await st(page);
  expect(s.flags).toEqual(expect.arrayContaining(['atravessou_solem', 'seguiu_a_luz', 'visao_vista']));
  await expect.poll(async () => (await salvoAuto(page))?.jogo?.campanha?.parte, { timeout: 20_000 }).toBe(5);
});

test('Parte 4: as lajes dos outros deuses disparam a flecha e racham; a voz interior depois da 1ª e da 2ª; o passivo de Visão; andar no buraco derruba; sem seguiu_a_luz', async ({ page }) => {
  test.setTimeout(300_000);
  await naLateral(page, 4, {
    pvAtual: 30, flags: ['fim_capitulo_02', 'nyme_caiu', 'visao_vista'],
    coletados: ['lateral:p4:chegada', 'lateral:p4:audicao'],
  }, { config: { tutorial: true, dicasVistas: (DICAS as { id: string }[]).map((d) => d.id) } });
  await livre(page, 40_000);
  // Parado diante de uma laje errada (fileira 0: Justar): Visão passiva CD 12.
  await f(page, 'forceRoll', [20]);
  const y0 = pe(G4, 0, 0).y;
  await irA(page, juntaX(G4, 0, y0) - 60, y0);
  await cenaLateral(page, 'c-primeira', 20_000);
  await fecharFala(page);
  // Ainda parado diante da laje errada: a Visão passiva vem logo depois.
  await cenaLateral(page, 'c-solta', 20_000);
  await ateFala(page, 'Esta laje parece solta…');
  await fecharFala(page);
  await livre(page);
  // 1ª flecha (laje de outro deus).
  await f(page, 'forceRoll', [1]);
  await f(page, 'forceDano', [2]);
  let c = pe(G4, 0, 0);
  await irA(page, c.x, c.y);
  await cenaLateral(page, 'c-flecha1', 20_000);
  await ateFala(page, 'A dor veio dos outros caminhos, desta vez. Siga a luz.');
  await fecharFala(page);
  await livre(page);
  expect((await lat(page) as any).lajes.find((l: any) => l.col === 0 && l.lin === 0).disparada).toBe(true);
  // 2ª: a memória do Artho.
  await f(page, 'forceRoll', [1]);
  await f(page, 'forceDano', [2]);
  c = pe(G4, 1, 0);
  await irA(page, c.x, c.y);
  await cenaLateral(page, 'c-flecha2', 20_000);
  await ateFala(page, 'Às vezes, a coragem é escolher o seu.');
  await fecharFala(page);
  await livre(page);
  expect((await st(page)).contadores.flechas_p4).toBe(2);
  // Andar para dentro do buraco (sem pular): cai na beira e volta.
  await f(page, 'forceDano', [1]);
  c = pe(G4, 1, 1);
  await irA(page, c.x, c.y);
  const q = pe(G4, 2, 1);
  await irA(page, q.x, q.y);
  await expect.poll(async () => (await st(page)).casa, { timeout: 15_000 }).toEqual({ col: 1, lin: 1 });
  await livre(page);
  // Atravessa o resto pelo caminho (pulando as quebradas) e termina sem seguiu_a_luz.
  await f(page, 'forceRoll', [15]);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await st(page)).casa, { timeout: 10_000 }).toEqual({ col: 3, lin: 1 });
  await livre(page);
  for (const [col, lin] of [[3, 2], [3, 3], [4, 3], [5, 3], [5, 2]]) { const p2 = pe(G4, col, lin); await irA(page, p2.x, p2.y); }
  await livre(page);
  await f(page, 'forceRoll', [15]);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await st(page)).casa, { timeout: 10_000 }).toEqual({ col: 7, lin: 2 });
  await livre(page);
  for (const [col, lin] of [[7, 1], [7, 0], [8, 0]]) { const p2 = pe(G4, col, lin); await irA(page, p2.x, p2.y); }
  const fim = pe(G4, 8, 0);
  await irA(page, passouDa(G4, fim.y), fim.y);
  await cenaLateral(page, 'c-fim', 20_000);
  await fecharFala(page);
  const s = await st(page);
  expect(s.flags).toContain('atravessou_solem');
  expect(s.flags).not.toContain('seguiu_a_luz');
  expect(ehQuebrada(G4, 2, 1)).toBe(true);
});

test('Parte 4: a segunda queda a 0 PV é game over e o Continuar volta ao início da parte, sem a flag levantou', async ({ page }) => {
  test.setTimeout(240_000);
  await naLateral(page, 4, { pvAtual: 2, flags: ['fim_capitulo_02', 'nyme_caiu', 'levantou', 'visao_vista'], coletados: ['lateral:p4:chegada', 'lateral:p4:primeira'] });
  await livre(page, 40_000);
  await f(page, 'forceRoll', [1]);
  await f(page, 'forceDano', [4]);
  const c = pe(G4, 0, 2);
  await irA(page, c.x, c.y);
  await expect(page.locator('.tela-game-over')).toBeVisible({ timeout: 30_000 });
  await page.locator('.tela-game-over').getByRole('button', { name: 'Continuar' }).click({ timeout: 10_000 });
  await expect.poll(async () => (await st(page)).tela, { timeout: 60_000 }).toBe('lateral');
  const s = await st(page);
  expect(s.parte).toBe(4);
  expect(s.flags).not.toContain('levantou');
  expect(s.pv).toBeGreaterThanOrEqual(1);
});

test('retomar o save no meio de um trecho continua dali (não recomeça a parte)', async ({ page }) => {
  test.setTimeout(180_000);
  await naLateral(page, 2, { cena: null, local: { tela: 'lateral', x: 2400, y: 700 }, coletados: ['lateral:p2:inicio', 'lateral:p2:poca', 'lateral:p2:teto'] });
  await livre(page, 40_000);
  expect((await lat(page)).x).toBeGreaterThan(2300);
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
    // As tochas acendem da esquerda para a direita, na ordem dos candelabros.
    const ts = (await lat(page) as any).tochas as { x: number; acesa: boolean }[];
    expect(ts.map((t) => t.x)).toEqual([...ts.map((t) => t.x)].sort((a, b) => a - b));
    const acesas = ts.map((t) => t.acesa);
    expect(acesas.indexOf(false) === -1 || acesas.slice(acesas.indexOf(false)).every((a) => !a)).toBe(true);
    if (leal && fotoGrande(info.project.name)) await foto(page, info, 'tochas-acendendo');
    await expect.poll(async () => (await lat(page)).tochasAcesas, { timeout: 15_000 }).toBe(P['5'].tochas.length);
    expect(await efeitosNomes(page)).toContain('tochas-acendendo');
    await expect.poll(async () => (await lat(page)).luz.ambiente, { timeout: 10_000 }).toBeGreaterThan(0.55);
    // Fase 6B: a tocha do herói sai de cena (o furo fecha) e nenhum retângulo fica em volta dele.
    await expect.poll(async () => (await lat(page) as any).escuro.furo, { timeout: 10_000 }).toBe(false);
    await semRetangulo(page);
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

/**
 * Nenhum retângulo em volta do herói: a média de brilho numa faixa logo fora do sprite e numa faixa um
 * pouco mais longe (dos dois lados, na mesma altura) é parecida. Com a moldura da Fase 6, a faixa de
 * perto ficava bem mais clara (ou escura) que a de longe.
 */
async function semRetangulo(page: Page) {
  await page.waitForTimeout(4500);
  const vp = page.viewportSize()!;
  // O canvas do jogo (no celular em pé ele não ocupa a tela toda): px do mundo → px da tela.
  const tela = (await page.locator('.lateral-jogo canvas').boundingBox())!;
  const zoom = tela.height / 887;
  const alt = 213;
  const a = await lat(page);
  // Faixas do mundo logo fora do sprite (dos dois lados), da cintura à cabeça.
  const faixas = [[a.x - alt * 0.75, a.x - alt * 0.42], [a.x + alt * 0.42, a.x + alt * 0.75]].map(([x0, x1]) => ({ x0, x1, y0: a.y - alt * 0.9, y1: a.y - alt * 0.2 }));
  const medir = async () => {
    const l = await lat(page);
    const png = await page.screenshot();
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    const k = info.width / vp.width;
    return faixas.map((r) => {
      const X0 = Math.round((tela.x + (r.x0 - l.camX) * zoom) * k), X1 = Math.round((tela.x + (r.x1 - l.camX) * zoom) * k);
      const Y0 = Math.round((tela.y + (r.y0 - l.camY) * zoom) * k), Y1 = Math.round((tela.y + (r.y1 - l.camY) * zoom) * k);
      let soma = 0, n = 0;
      for (let y = Math.max(0, Y0); y < Math.min(info.height, Y1); y++) for (let x = Math.max(0, X0); x < Math.min(info.width, X1); x++) { soma += data[y * info.width + x]; n++; }
      return n ? soma / n : NaN;
    });
  };
  const comHeroi = await medir();
  // O herói se afasta (300 px: no celular em pé a vista tem ~960 px do mundo): a mesma região, sem ele.
  await f(page, 'teleportar', a.x + 300, a.y);
  await page.waitForTimeout(1200);
  const semHeroi = await medir();
  for (let i = 0; i < faixas.length; i++) expect(Math.abs(comHeroi[i] - semHeroi[i])).toBeLessThan(6);
}
