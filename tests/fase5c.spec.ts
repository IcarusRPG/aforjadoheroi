import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { irAteMenu } from './ajudantes';

/* Fase 5C: um Capítulo 01 só (Füllmun + Templo), migração dos saves, a nova tragédia e os créditos. */

type Estado = Record<string, any>;
const HEROI = {
  nome: 'Thaelion', genero: 'm', raca: 'ayoran', variante: null, origem: 'campones',
  atributosComprados: { FOR: 1, DES: 1, CON: 2, INT: 2, SAB: 1, CAR: 1 }, bonusArake: [],
  atributosFinais: { FOR: 1, DES: 2, CON: 2, INT: 3, SAB: 1, CAR: 2 },
  classe: 'arcanista', pvMax: 14, pmMax: 9, criadoEm: '2026-11-17T12:00:00.000Z',
};
const CONFIG = { musica: 0.7, efeitos: 0.8, mudo: false, tutorial: false, ajudaFullmunVista: true };

/** Save no formato atual (versaoSave 6), direto no slot automático. */
function semear(page: Page, campanha: Record<string, unknown>, config: Record<string, unknown> = {}) {
  return page.addInitScript(([h, c, cf]) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('fdg.opcoes', JSON.stringify(cf));
    const campanha = { capitulo: 1, parte: 'fullmun', cena: null, modo: 'falas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null, local: { tela: 'capitulo' }, ...c };
    localStorage.setItem('fdg.save.auto', JSON.stringify({
      formato: 'forja-do-heroi-save', versaoSave: 6,
      meta: { nomeHeroi: h.nome, raca: h.raca, variante: null, genero: h.genero, classe: h.classe, capitulo: 1, local: '', tempoDeJogo: 60, salvoEm: new Date().toISOString(), tipo: 'auto', versaoSave: 6 },
      jogo: { personagem: h, sonho: { concluido: true, ouvidas: ['solem', 'justar', 'irae'] }, campanha, tempoDeJogo: 60 },
    }));
  }, [HEROI, campanha, { ...CONFIG, ...config }] as const);
}
/** Um save antigo (versaoSave 5, numeração de antes da Fase 5C) num slot. */
function registroAntigo(o: { nome: string; salvoEm: string; capitulo: number; local: string; campanha: Record<string, unknown> }) {
  return {
    formato: 'forja-do-heroi-save', versaoSave: 5,
    meta: { nomeHeroi: o.nome, raca: HEROI.raca, variante: null, genero: HEROI.genero, classe: 'arcanista', capitulo: o.capitulo, local: o.local, tempoDeJogo: 900, salvoEm: o.salvoEm, tipo: 'manual', versaoSave: 5 },
    jogo: {
      personagem: { ...HEROI, nome: o.nome }, sonho: { concluido: true, ouvidas: ['solem'] },
      campanha: { capitulo: o.capitulo, cena: null, modo: 'falas', flags: [], caminho: [], usadas: [], pvAtual: null, bonusProximoTeste: 0, cenaAntesDaBatalha: null, local: { tela: 'capitulo' }, ...o.campanha },
      tempoDeJogo: 900,
    },
  };
}

const st = (page: Page): Promise<Estado> => page.evaluate(() => (window as unknown as { __fdg?: { state(): Estado } }).__fdg?.state() ?? {});
const f = (page: Page, m: string, ...args: unknown[]) =>
  page.evaluate(([mm, aa]) => (window as unknown as { __fdg?: Record<string, (...x: unknown[]) => unknown> }).__fdg?.[mm as string]?.(...(aa as unknown[])), [m, args] as const);
const foto = (page: Page, info: TestInfo, nome: string) => page.screenshot({ path: `tests/screenshots/${info.project.name}-fase5c-${nome}.png` });
const umAparelho = (info: TestInfo) => info.project.name === 'pixel-7';
const textoFala = (page: Page) => page.locator('.palco-cena .cena-texto').innerText();
const salvoAuto = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('fdg.save.auto') ?? 'null'));

async function continuar(page: Page) {
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Continuar' }).click();
}
async function naCena(page: Page, id: string, timeout = 90_000) {
  await expect.poll(async () => (await st(page)).cena, { timeout }).toBe(id);
}
/** Espera a fala terminar de aparecer (sem tocar: um toque no instante em que ela termina pularia uma fala). */
async function falaCompleta(page: Page) {
  await expect.poll(async () => (await st(page)).digitando, { timeout: 20_000, intervals: [150] }).toBe(false);
}

/* ======================================================================
   1. Um capítulo só: Füllmun → cartão de local → Templo
   ====================================================================== */

test('capítulo único: o fim de Füllmun vira o cartão "Templo de Sólem", sem "Fim do Capítulo" nem cartão de capítulo; salva e anota no Caderno', async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, { cena: 'c01-caminho', modo: 'falas', flags: ['evento_mirtilo', 'evento_mirtilo_fim', 'aylin_em_casa', 'salvou_aylin'] });
  await continuar(page);
  await naCena(page, 'c01-caminho');
  const seguir = page.locator('.cena-seguir');
  await expect.poll(async () => {
    if (await seguir.isVisible()) return true;
    await f(page, 'avancar');
    return false;
  }, { timeout: 60_000, intervals: [250] }).toBe(true);
  await expect(seguir).toContainText('Entrar no templo');
  await seguir.click();
  // O cartão de local (e nada de "Fim do Capítulo" nem do cartão "Capítulo 02").
  const cartao = page.locator('.cartao-local');
  await expect(cartao).toBeVisible({ timeout: 30_000 });
  await expect(cartao).toHaveClass(/visivel/, { timeout: 10_000 });
  await expect(cartao.locator('.cartao-local-titulo')).toHaveText('Templo de Sólem');
  await expect(cartao.locator('.cartao-local-subtitulo')).toHaveText('Mais tarde, naquela manhã');
  await expect(page.locator('.tela-fim-capitulo')).toHaveCount(0);
  await expect(page.locator('.cartao-capitulo')).toHaveCount(0);
  await page.waitForTimeout(400);
  if (umAparelho(info) || info.project.name.startsWith('paisagem')) await foto(page, info, 'cartao-templo');
  // O save automático já está na parte do templo; o Caderno anota o fim de Füllmun na chegada.
  const salvo = await salvoAuto(page);
  expect(salvo.jogo.campanha.ato).toBe(0);
  expect(salvo.jogo.campanha.parte).toBe('templo');
  expect(salvo.meta.ato).toBe(0);
  const s = await st(page);
  expect(s.parte).toBe('templo');
  expect(s.caderno.anotacoes).toContain('fim-cap01');
  expect(s.caderno.anotacoes).not.toContain('fim-cap02');
  // O cartão some em ~2 s e a primeira cena do templo começa.
  await naCena(page, 'c02-lamina', 20_000);
  await expect(cartao).toBeHidden();
});

/* ======================================================================
   2. Fim do capítulo: resumo único e o "Em breve" do Capítulo 02
   ====================================================================== */

const FLAGS_JOGO = [
  'evento_mirtilo', 'evento_mirtilo_fim', 'aylin_em_casa', 'salvou_aylin', 'acalmou', 'pista_trinco', 'missao_hulda',
  'gentileza_osric', 'missao_osric', 'abobora_artho', 'venceu_treino', 'venceu_treino_rasteira', 'comeu_pao', 'limpou_tudo',
  'leu_tres_livros', 'perguntou_alcapao', 'artho_alcapao', 'chegou_templo', 'carinho_nyme',
];

test('fim: "Fim do Capítulo 01 — Amanhecer Tardio" com um resumo único (até 8 linhas, a Nyme por último) e depois "Capítulo 02 — Provação Sob a Luz · Em breve"', async ({ page }, info) => {
  test.setTimeout(240_000);
  await semear(page, { parte: 'templo', cena: 'c02-tragedia', modo: 'falas', flags: FLAGS_JOGO });
  await continuar(page);
  await naCena(page, 'c02-tragedia');
  // Diário durante a parte do templo: um capítulo só, com as linhas das duas partes.
  await page.locator('.btn-menu').click();
  await page.getByRole('button', { name: 'Diário' }).click();
  await expect(page.locator('.diario h3')).toHaveCount(1);
  await expect(page.locator('.diario h3')).toHaveText('Prólogo · Amanhecer Tardio');
  const diario = await page.locator('.diario-resumo li').allInnerTexts();
  expect(diario).toContain('Você acalmou o Mirtilo.');
  expect(diario).toContain('Você leu os três livros da biblioteca.');
  if (umAparelho(info)) await foto(page, info, 'diario');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-fundo')).toHaveCount(0);
  // Até o fim da tragédia.
  const fim = page.locator('.tela-fim-capitulo');
  await expect.poll(async () => {
    if (await fim.isVisible()) return true;
    const seguir = page.locator('.cena-seguir');
    if (await seguir.isVisible()) await seguir.click().catch(() => {});
    else await f(page, 'avancar');
    return false;
  }, { timeout: 150_000, intervals: [400] }).toBe(true);
  await expect(fim.locator('.fim-rotulo')).toHaveText('Fim do Prólogo');
  await expect(fim.locator('.fim-titulo')).toHaveText('Amanhecer Tardio');
  const linhas = await fim.locator('.fim-resumo li').allInnerTexts();
  expect(linhas.length).toBeLessThanOrEqual(8);
  expect(linhas[linhas.length - 1]).toBe('A Nyme deu a vida pela vila.');
  // As escolhas raras entram primeiro (com mais de 8 possíveis).
  expect(linhas).toContain('Você acalmou o Mirtilo.');
  expect(linhas).toContain('Você derrubou a Nyme com uma rasteira.');
  expect(linhas).not.toContain('A Aylin está a salvo.');
  // Partes na ordem: Füllmun antes do templo.
  expect(linhas.indexOf('Você acalmou o Mirtilo.')).toBeLessThan(linhas.indexOf('Você derrubou a Nyme com uma rasteira.'));
  await page.waitForTimeout(1200);
  await foto(page, info, 'fim-capitulo');
  const salvo = await salvoAuto(page);
  expect(salvo.jogo.campanha.ato).toBe(1);
  expect(salvo.jogo.campanha.cena).toBe('inicio');
  expect(salvo.meta.ato).toBe(1);
  // O Caderno: a anotação do fim e a pergunta do ataque.
  const s = await st(page);
  expect(s.caderno.anotacoes).toEqual(expect.arrayContaining(['fim-cap01', 'fim-cap02']));
  expect(s.caderno.perguntas).toContain('ataque');
  // Fase 6: o Continuar abre o Ato I (cartão do ato).
  await fim.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.cartao-tela.cartao-ato')).toContainText('Provação Sob a Luz', { timeout: 15_000 });
});

/* ======================================================================
   3. Saves: cards e migração dos antigos
   ====================================================================== */

test('saves antigos: o antigo Capítulo 02 vira "Capítulo 01 · Templo de Sólem", o antigo 03 vira o Capítulo 02; os cards mostram a numeração nova', async ({ page }, info) => {
  test.setTimeout(240_000);
  const agora = Date.now();
  await page.addInitScript(([a, b, cf]) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('fdg.opcoes', JSON.stringify(cf));
    localStorage.setItem('fdg.save.manual1', JSON.stringify(a));
    localStorage.setItem('fdg.save.manual2', JSON.stringify(b));
  }, [
    registroAntigo({ nome: 'Templo', salvoEm: new Date(agora - 60_000).toISOString(), capitulo: 2, local: 'Templo de Sólem — Biblioteca',
      campanha: { cena: 'c02-artho', modo: 'escolhas', atraso: 2, flags: ['nyme_seguindo'], local: { tela: 'mapa', mapa: 'templo-biblioteca', x: 236, y: 610 } } }),
    registroAntigo({ nome: 'Breve', salvoEm: new Date(agora - 3_600_000).toISOString(), capitulo: 3, local: '', campanha: { cena: 'inicio', flags: ['fim_capitulo_02', 'nyme_caiu'] } }),
    CONFIG,
  ] as const);
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Carregar' }).click();
  const cards = page.locator('.save-local');
  await expect(cards.filter({ hasText: 'Templo de Sólem' })).toHaveText('Prólogo · Templo de Sólem — Biblioteca');
  await expect(cards.filter({ hasText: /^Ato I · Provação Sob a Luz$/ })).toHaveCount(1);
  if (umAparelho(info)) await foto(page, info, 'cards-migrados');
  // O antigo Capítulo 02 carrega na parte do templo, na mesma cena e no mesmo mapa.
  await page.locator('[data-slot="manual1"] .save-btn-carregar').click();
  await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.mapa === 'templo-biblioteca'; }, { timeout: 120_000 }).toBe(true);
  const s = await st(page);
  expect(s.capitulo).toBe(1);
  expect(s.parte).toBe('templo');
  expect(s.flags).toContain('chegou_templo');
  expect(s.caderno.anotacoes).toContain('fim-cap01');
});

test('migração: um save antigo em "Capítulo 03 · Em breve" abre o Ato I, Parte 1 (Fase 6)', async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!umAparelho(test.info()), 'um aparelho basta');
  await page.addInitScript(([a, cf]) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('fdg.opcoes', JSON.stringify(cf));
    localStorage.setItem('fdg.save.auto', JSON.stringify(a));
  }, [registroAntigo({ nome: 'Breve', salvoEm: new Date().toISOString(), capitulo: 3, local: '', campanha: { cena: 'inicio', flags: ['fim_capitulo_02', 'nyme_caiu'] } }), CONFIG] as const);
  await irAteMenu(page, './?test=1');
  await expect(page.locator('.menu-continuar-info')).toContainText('Ato I');
  await page.getByRole('button', { name: /Continuar/ }).click();
  // Fase 6: o antigo "Em breve" virou o começo do Ato I (o alçapão).
  await expect.poll(async () => { const s = await st(page); return `${s.tela}|${s.ato}|${s.parte}`; }, { timeout: 30_000 }).toBe('capitulo|1|1');
});

/* ======================================================================
   4. A tragédia
   ====================================================================== */

interface Passo { texto: string; fundo: string; visual: string; efeitos: { nome: string; taxa: number }[] }

/** Do alçapão até o fim do capítulo, registrando cada fala: fundo, efeito visual e os sons novos. */
async function tragedia(page: Page, info: TestInfo, o: { fotos?: boolean } = {}) {
  // Na biblioteca (com a música do templo), a conversa do alçapão já no Artho.
  await expect.poll(async () => { const s = await st(page); return s.tela === 'mapa' && s.mapa === 'templo-biblioteca' && s.pronto; }, { timeout: 120_000 }).toBe(true);
  await expect.poll(async () => (await st(page)).musica.faixa ?? '', { timeout: 20_000 }).toContain('templo');
  await f(page, 'goto', 't-alcapao-artho');
  await naCena(page, 't-alcapao-artho');
  await expect.poll(async () => {
    if (((await st(page)).escolhas ?? []).length) return true;
    await f(page, 'avancar');
    return false;
  }, { timeout: 60_000, intervals: [300] }).toBe(true);
  const antes = await st(page);
  expect(antes.musica.faixa ?? '').toContain('templo');
  // Daqui em diante, nada de imagem nem som pode ser baixado.
  const baixados: string[] = [];
  page.on('request', (r) => { if (/\/assets\/(img|sfx|music)\//.test(r.url()) && !/tragedia\.mp3/.test(r.url())) baixados.push(r.url()); });
  const visto = (await st(page)).efeitos.length;
  await page.locator('.cena-escolha').first().click();
  await naCena(page, 'c02-gritos');
  const t0 = Date.now();
  // A música do templo corta seco e os gritos começam (~6 s, com o fade embutido).
  await expect.poll(async () => { const m = (await st(page)).musica; return !(m.tocando && (m.faixa ?? '').includes('templo')); }, { timeout: 1000, intervals: [50] }).toBe(true);
  let s = await st(page);
  expect(s.efeitos.slice(visto).map((e: Estado) => e.nome)).toContain('gritos-fullmun');
  if (s.duracaoGritos !== null) { expect(s.duracaoGritos).toBeGreaterThan(5.5); expect(s.duracaoGritos).toBeLessThan(6.6); }
  await expect(page.locator('.palco-cena')).toHaveClass(/visual-alcapao-escuro/);
  const primeira = await textoFala(page);
  // Tocar antes de 3 s completa o texto, mas a cena espera.
  while (Date.now() - t0 < 2500) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  s = await st(page);
  expect(s.cena).toBe('c02-gritos');
  // A fala nova pode ainda estar entrando (máquina carregada): espera o texto trocar.
  await expect.poll(() => textoFala(page), { timeout: 10_000 }).toContain('Gritos rasgam o ar lá fora');
  expect(primeira.length).toBeGreaterThan(0);
  if (o.fotos) await foto(page, info, 'tragedia-00-gritos');
  await page.waitForTimeout(Math.max(0, 3300 - (Date.now() - t0)));
  await f(page, 'avancar');
  await expect.poll(() => textoFala(page), { timeout: 10_000 }).toContain('Você e Artho se olham');
  // Daqui, cada fala até o preto.
  const passos: Passo[] = [];
  let ultimo = (await st(page)).efeitos.length;
  let n = 0;
  for (let i = 0; i < 30; i++) {
    await falaCompleta(page);
    s = await st(page);
    if (s.cena === 'c02-tragedia') {
      const novos = s.efeitos.slice(ultimo).map((e: Estado) => ({ nome: e.nome, taxa: e.taxa }));
      ultimo = s.efeitos.length;
      const visual = (await page.locator('.palco-cena').getAttribute('class'))!.split(' ').find((c) => c.startsWith('visual-')) ?? '';
      const texto = await textoFala(page);
      if (!passos.length || passos[passos.length - 1].texto !== texto) {
        passos.push({ texto, fundo: s.fundo, visual, efeitos: novos });
        if (o.fotos) { await page.waitForTimeout(900); await foto(page, info, `tragedia-${String(++n).padStart(2, '0')}`); }
      }
    }
    if (await page.locator('.cena-seguir').isVisible()) {
      if (s.cena === 'c02-tragedia') break;
      await page.locator('.cena-seguir').click();
      continue;
    }
    await f(page, 'avancar');
    await page.waitForTimeout(150);
  }
  return { passos, baixados };
}

function conferirSequencia(passos: Passo[]) {
  const passo = (trecho: string) => {
    const p = passos.find((x) => x.texto.includes(trecho));
    expect(p, `fala "${trecho}"`).toBeTruthy();
    return p!;
  };
  expect(passo('empurram a porta').fundo).toBe('cena-nyme-porta');
  expect(passo('empurram a porta').visual).toBe('visual-camera-lenta');
  const f1 = passo('O mundo volta de repente');
  expect(f1.fundo).toBe('cena-nyme-flecha1');
  expect(f1.efeitos.map((e) => e.nome)).toContain('flecha-nyme');
  const f2 = passo('Depois outra');
  expect(f2.fundo).toBe('cena-nyme-flecha2');
  expect(f2.efeitos.find((e) => e.nome === 'flecha-nyme')?.taxa).toBeCloseTo(0.95);
  expect(passo('escorrega dos dedos').fundo).toBe('cena-nyme-espada');
  const clang = passo('bate no chão de pedra');
  expect(clang.fundo).toBe('cena-nyme-espada');
  expect(clang.efeitos.map((e) => e.nome)).toContain('espada-clang');
  expect(passo('uma última vez').fundo).toBe('cena-nyme-flecha2');
  expect(passo('E então ela tomba').visual).toBe('visual-para-preto');
  expect(passo('querida e segura').visual).toBe('visual-preto');
  expect(passo('O silêncio que vem depois').visual).toBe('visual-preto');
  // A ordem das imagens: porta → flecha1 → flecha2 → espada → flecha2.
  const ordem = passos.map((p) => p.fundo).filter((x, i, a) => i === 0 || x !== a[i - 1]);
  expect(ordem).toEqual(['cena-nyme-porta', 'cena-nyme-flecha1', 'cena-nyme-flecha2', 'cena-nyme-espada', 'cena-nyme-flecha2']);
}

const ALCAPAO = {
  parte: 'templo', cena: 'c02-artho', modo: 'escolhas', atraso: 2, local: { tela: 'mapa', mapa: 'templo-biblioteca', x: 800, y: 540 },
  flags: ['nyme_seguindo', 'alcapao_liberado', 'perguntou_alcapao', 'carinho_nyme', 'chegou_templo'],
};

test('tragédia: música do templo corta, gritos reais (≥3 s antes de avançar), porta → flecha1 → flecha2 → espada → flecha2 → preto, flechas e clang; nada carrega durante a sequência', async ({ page }, info) => {
  test.setTimeout(300_000);
  await semear(page, ALCAPAO);
  await continuar(page);
  const { passos, baixados } = await tragedia(page, info, { fotos: umAparelho(info) });
  conferirSequencia(passos);
  expect(baixados).toEqual([]);
  // Cortes secos: as imagens das flechas e da espada trocam sem transição.
  await expect(page.locator('.cena-fundo.corte')).toHaveCount(2);
  // A música da tragédia entrou por baixo dos gritos (o arquivo existe no projeto).
  const hist = (await st(page)).musica.historico as string[];
  expect(hist.some((x) => x.includes('tragedia'))).toBe(true);
});

test('tragédia sem tragedia.mp3 e com animações reduzidas: só os gritos e o silêncio; sem flash e sem tremor, cortes secos', async ({ page }, info) => {
  test.setTimeout(300_000);
  test.skip(!umAparelho(info) && info.project.name !== 'paisagem-844x390', 'dois aparelhos bastam');
  await page.route('**/music/tragedia.mp3', (r) => r.fulfill({ status: 404, body: '' }));
  await semear(page, ALCAPAO, { animacoesReduzidas: true });
  await continuar(page);
  // Observa flash e tremor durante toda a sequência.
  await page.evaluate(() => {
    const w = window as unknown as { __efeitosVisuais: { flash: number; tremor: number } };
    w.__efeitosVisuais = { flash: 0, tremor: 0 };
    new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target as HTMLElement;
        if (el.classList?.contains('cena-flash') && el.classList.contains('ativo')) w.__efeitosVisuais.flash++;
        if (el.classList?.contains('tremendo') || el.classList?.contains('tremendo-leve')) w.__efeitosVisuais.tremor++;
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  });
  const { passos } = await tragedia(page, info);
  conferirSequencia(passos);
  const v = await page.evaluate(() => (window as unknown as { __efeitosVisuais: { flash: number; tremor: number } }).__efeitosVisuais);
  expect(v).toEqual({ flash: 0, tremor: 0 });
  const s = await st(page);
  expect((s.musica.historico as string[]).some((x) => x.includes('tragedia'))).toBe(false);
});

/* ======================================================================
   5. Créditos
   ====================================================================== */

test('créditos: abrem pelo menu inicial e pelas Opções, com música, efeitos e arte (os dois efeitos novos com autor, fonte e licença)', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.addInitScript((cf) => { if (!localStorage.getItem('fdg.opcoes')) localStorage.setItem('fdg.opcoes', JSON.stringify(cf)); }, CONFIG);
  await irAteMenu(page, './?test=1');
  await page.getByRole('button', { name: 'Créditos' }).click();
  const modal = page.locator('.modal');
  await expect(modal.locator('.modal-titulo')).toHaveText('Créditos');
  await expect(modal.locator('.creditos-secao-titulo')).toHaveText(['Música', 'Efeitos sonoros', 'Arte']);
  const gritos = modal.locator('[data-credito="gritos-fullmun"]');
  await expect(gritos).toContainText('Screaming_Crowd.wav');
  await expect(gritos).toContainText('magician5');
  await expect(gritos).toContainText('Freesound');
  await expect(gritos).toContainText('CC0');
  await expect(gritos.locator('a')).toHaveAttribute('href', 'https://freesound.org/people/magician5/sounds/124022/');
  const flecha = modal.locator('[data-credito="flecha-nyme"]');
  await expect(flecha).toContainText('Air Woosh Move');
  await expect(flecha).toContainText('Almitory');
  await expect(flecha).toContainText('OpenGameArt.org');
  // Cabe na tela (rola por dentro) e o Fechar tem 44 px.
  const fechar = modal.getByRole('button', { name: 'Fechar' });
  await fechar.scrollIntoViewIfNeeded();
  expect((await fechar.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await modal.locator('.creditos-secao').first().scrollIntoViewIfNeeded();
  await foto(page, info, 'creditos');
  await fechar.click();
  await expect(page.locator('.modal-fundo')).toHaveCount(0);
  // Pelas Opções: fecha as Opções, abre os créditos, e volta às Opções ao fechar.
  await page.getByRole('button', { name: 'Opções' }).click();
  const btn = page.locator('.opcao-creditos');
  await btn.scrollIntoViewIfNeeded();
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await btn.click();
  const titulo = page.locator('.modal-fundo:not(.saindo) .modal-titulo');
  await expect(titulo).toHaveText('Créditos');
  await page.locator('.modal-fundo:not(.saindo)').getByRole('button', { name: 'Fechar' }).click();
  await expect(titulo).toHaveText('Opções');
});
