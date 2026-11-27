import { verificarCaderno } from '../core/caderno';
import { abrirCaderno } from '../screens/caderno';
import AMEACAS from '../data/ameacas.json';
import { imagemPronta } from '../core/imagens';
import NPCS from '../data/npcs.json';
import { ASSETS, existeAsset, existeAssetCache, src, type NomeSfx } from '../core/assets';
import { dica } from '../core/tutorial';
import { audio, type LoopAmbiente } from '../core/audio';
import { rolarD20 } from '../core/dados';
import { animacoesReduzidas, atualizarCampanha, getEstado, limparInicioCena, marcarFlag, marcarInicioCena, tremoresLigados } from '../core/estado';
import { PERICIAS, bonusPericia } from '../core/pericias';
import {
  conhecer, darItem, definirMissao, encontrarCriatura, mudarRelacao, pvMaxAtual, somarAtraso, somarContador, somarReais, verificarCompendio,
} from '../core/progresso';
import { textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';
import RETRATOS from '../data/retratos.json';
import { efeitoMemoria, type ModoMemoria } from './memoria';
import { atende, cenaGlobal, interpolar, type Cena, type Efeitos, type Escolha, type Fala, type Seguir } from './capitulo';
import { mostrarRolagem } from './rolagem';

/**
 * Palco de cena: fundo ilustrado (ou o mapa escurecido por trás), falas com digitação (um toque completa,
 * outro avança), busto do NPC, escolhas em botões grandes, testes de perícia com o d20 e efeitos de tela.
 * Usado pela tela de capítulo e, por cima do mapa, pelas conversas da exploração.
 */

const T = textos.cenas;
const NOMES_NPC = NPCS as Record<string, { nome: string }>;
const DADOS_AMEACAS = AMEACAS as Record<string, { nome: string; tipo: string; selo: string; imagem: string }>;
const PLAYLIST_FULLMUN = ['fullmun-01', 'fullmun-02'];

/** Música de uma cena: "fullmun" é a playlist da vila; null é silêncio; "nome?" só se o arquivo existir. */
export function tocarMusicaDaCena(musica: string | null | undefined, fadeMs = 1500): void {
  if (musica === undefined) return;
  if (musica === null) return audio.pararMusica(fadeMs);
  if (musica === 'fullmun') return audio.tocarPlaylist(PLAYLIST_FULLMUN.map(ASSETS.musica), fadeMs);
  // "faixa@segundo*ganho" (Fase 6B): começa no segundo e toca com volume próprio, ex. "tragedia@34*0.35".
  const m = musica.match(/^([\w-]+)@(\d+(?:\.\d+)?)(?:\*(\d+(?:\.\d+)?))?$/);
  if (m) return audio.tocarMusica(ASSETS.musica(m[1]), fadeMs, { inicio: Number(m[2]), ganho: m[3] ? Number(m[3]) : 1 });
  if (musica.endsWith('?')) {
    const id = musica.slice(0, -1);
    void existeAsset(ASSETS.musica(id), 'audio').then((ok) => { if (ok) audio.tocarMusica(ASSETS.musica(id), fadeMs); else audio.pararMusica(0); });
    return;
  }
  audio.tocarMusica(ASSETS.musica(musica), fadeMs);
}

/** Aplica efeitos de escolha/fala/cena no save (e avisa as novidades do Compêndio). */
export function aplicarEfeitos(e: Efeitos | undefined): void {
  if (!e) return;
  const c = getEstado().campanha;
  if (e.uma_vez) {
    const chave = `ef:${e.uma_vez}`;
    if (c.usadas.includes(chave)) return;
    atualizarCampanha({ usadas: [...c.usadas, chave] });
  }
  if (e.divindade) atualizarCampanha({ divindade: e.divindade });
  for (const f of e.flag === undefined ? [] : Array.isArray(e.flag) ? e.flag : [e.flag]) marcarFlag(f);
  if (e.bonusProximoTeste) atualizarCampanha({ bonusProximoTeste: getEstado().campanha.bonusProximoTeste + e.bonusProximoTeste });
  const max = pvMaxAtual();
  if (e.pvDefinir !== undefined) atualizarCampanha({ pvAtual: e.pvDefinir });
  if (e.pv) atualizarCampanha({ pvAtual: Math.max(e.pv < 0 ? 1 : 0, Math.min(max, (getEstado().campanha.pvAtual ?? max) + e.pv)) });
  for (const [id, n] of Object.entries(e.relacao ?? {})) mudarRelacao(id, n);
  if (e.atraso) somarAtraso(e.atraso);
  for (const [id, n] of Object.entries(e.itens ?? {})) darItem(id, n);
  if (e.reais) somarReais(e.reais);
  for (const [id, est] of Object.entries(e.missao ?? {})) definirMissao(id, est);
  for (const [id, n] of Object.entries(e.contador ?? {})) somarContador(id, n);
  for (const id of e.conhecer === undefined ? [] : Array.isArray(e.conhecer) ? e.conhecer : [e.conhecer]) conhecer(id);
  if (e.bestiario) encontrarCriatura(e.bestiario.id, e.bestiario.sabe);
  for (const c2 of e.condicional ?? []) if (atende(c2.requer)) aplicarEfeitos(c2.efeitos);
  verificarCompendio();
  verificarCaderno();
}

export interface DestinoBatalha { batalha: string; vitoria: string; derrota: string; cenaOrigem: string | null }

export interface OpcoesPalco {
  /** Por cima do mapa: sem ilustração, a não ser que a cena tenha `fundo`. */
  sobreMapa?: boolean;
  aoBatalha(d: DestinoBatalha): void;
  aoFim(): void;
  aoMapa(m: { mapa: string; x?: number; y?: number }): void;
  /** Conversa no mapa terminou (seguir.voltar). */
  aoVoltar?(): void;
  /** Avisado a cada cena (o capítulo salva a cena atual). */
  aoEntrarCena?(c: Cena, modo: 'falas' | 'escolhas'): void;
}

export interface Palco {
  el: HTMLElement;
  entrar(id: string, modo?: 'falas' | 'escolhas'): Promise<void>;
  /** Um toque: completa a fala ou avança. */
  tocar(): void;
  cenaAtual(): Cena | null;
  digitando(): boolean;
  escolhasVisiveis(): string[];
  fundo(): string;
  bustoHeroi(): { visivel: boolean; expressao: string; aura: boolean };
  destruir(): void;
}

/** Orientação dos bustos (src/data/retratos.json): o busto está virado para o lado errado da conversa? */
const BUSTOS = (RETRATOS as unknown as { lados: Record<'npc' | 'heroi', string>; bustos: Record<string, { arquivo: string; olhaPara: string }> });
/** A versão própria (<id>-esq / <id>-dir) está declarada em retratos.json? */
function temVersaoPropria(caminho: string): boolean {
  return !!BUSTOS.bustos[caminho.split('/').pop()!.replace(/\.webp$/, '')];
}

export function precisaEspelhar(caminho: string, lado: 'npc' | 'heroi'): boolean {
  const id = caminho.split('/').pop()!.replace(/\.webp$/, '');
  const o = BUSTOS.bustos[id]?.olhaPara;
  return !!o && o !== 'frente' && o !== BUSTOS.lados[lado];
}

export function criarPalco(o: OpcoesPalco): Palco {
  const p = getEstado().personagem;
  const fundoA = h('img', { class: 'cena-fundo visivel', alt: '', draggable: 'false' });
  const fundoB = h('img', { class: 'cena-fundo', alt: '', draggable: 'false' });
  // Bustos: o NPC à esquerda (com uma camada para o crossfade de expressão) e o herói à direita.
  // Quem fala fica aceso; o outro lado da conversa fica escurecido.
  const busto = h('img', { class: 'cena-busto', alt: '', draggable: 'false', hidden: true });
  const bustoTroca = h('img', { class: 'cena-busto-troca', alt: '', draggable: 'false', 'aria-hidden': 'true', hidden: true });
  const ladoNpc = h('div', { class: 'cena-busto-npc' }, busto, bustoTroca);
  const bustoHeroi = h('img', { class: 'cena-busto-heroi', alt: p?.nome ?? '', draggable: 'false', hidden: true });
  if (p) { bustoHeroi.src = src(ASSETS.bustoHeroi(p.raca, p.genero)); bustoHeroi.dataset.retrato = ASSETS.bustoHeroi(p.raca, p.genero); }
  const bustos = h('div', { class: 'cena-bustos', hidden: true }, ladoNpc, bustoHeroi);
  const nome = h('p', { class: 'cena-nome', hidden: true });
  const texto = h('p', { class: 'cena-texto' });
  const seta = h('span', { class: 'cena-seta', 'aria-hidden': 'true' }, '▾');
  // No PC, a dica discreta da tecla (some no toque: ver fase5b.css).
  const dicaTecla = h('span', { class: 'dica-tecla', 'aria-hidden': 'true' }, 'Espaço ▸');
  const caixa = h('div', { class: 'cena-caixa', role: 'button', tabindex: '0', 'aria-label': T.avancar }, nome, texto, seta, dicaTecla);
  const escolhas = h('div', { class: 'cena-escolhas', role: 'group', 'aria-label': T.escolhas });
  const painel = h('div', { class: 'cena-painel' }, bustos, caixa, escolhas);
  const ameaca = h('aside', { class: 'cena-ameaca', hidden: true, 'aria-live': 'polite' });
  const brilho = h('div', { class: 'cena-brilho-alcapao', 'aria-hidden': 'true' });
  const flash = h('div', { class: 'cena-flash', 'aria-hidden': 'true' });
  const el = h('div', { class: `palco-cena${o.sobreMapa ? ' sobre-mapa' : ''}` },
    fundoA, fundoB, brilho, h('div', { class: 'cena-veu' }), ameaca, painel, flash);

  let destruido = false;
  let cena: Cena | null = null;
  let fundoAtual = '';
  let digitando = false;
  let completar: (() => void) | null = null;
  let avancar: (() => void) | null = null;
  let timerFala = 0;
  let ocupado = false;
  let pararLoop: (() => void) | null = null;
  /** Fase 6: loop de ambiente (fogo distante) e o efeito ocasional (madeira estalando). */
  let ambiente: LoopAmbiente | null = null;
  let timerOcasional = 0;
  function ocasional(o: NonNullable<Fala['ocasional']>) {
    window.clearTimeout(timerOcasional);
    const proximo = () => {
      timerOcasional = window.setTimeout(() => {
        if (destruido) return;
        audio.sfx(o.som as NomeSfx, { ganho: o.ganho ?? 1 });
        proximo();
      }, o.min + Math.random() * (o.max - o.min));
    };
    proximo();
  }

  function pararFala() {
    window.clearInterval(timerFala);
    digitando = false;
    completar = null;
    avancar = null;
  }

  /**
   * Troca o fundo da cena só depois de a imagem nova estar decodificada (até lá fica a anterior). Se a
   * cena mudar de novo antes de a imagem chegar, ela é descartada.
   */
  let pedidoFundo = 0;
  function trocarFundo(id: string | undefined, lento = false, corte = false) {
    el.classList.toggle('sem-fundo', !id);
    if (!id || id === fundoAtual) return;
    const primeira = !fundoAtual;
    fundoAtual = id;
    const pedido = ++pedidoFundo;
    const url = src(ASSETS.cena(id));
    void imagemPronta(url).then((ok) => {
      if (!ok || pedido !== pedidoFundo || destruido) return;
      const [visivel, outro] = fundoA.classList.contains('visivel') ? [fundoA, fundoB] : [fundoB, fundoA];
      outro.src = url;
      outro.dataset.cena = id;
      outro.classList.toggle('lento', lento && !corte);
      // Corte seco: as duas imagens trocam sem transição (a anterior some na hora).
      fundoA.classList.toggle('corte', corte);
      fundoB.classList.toggle('corte', corte);
      if (primeira && !visivel.getAttribute('src')) {
        visivel.src = url;
        visivel.dataset.cena = id;
        visivel.classList.add('visivel');
        return;
      }
      outro.classList.add('visivel');
      visivel.classList.remove('visivel');
    });
  }

  function quemFala(f: Fala): { nome: string | null; classe: string } {
    if (f.rotulo && f.quem && f.quem !== 'pensamento') return { nome: interpolar(f.rotulo), classe: f.quem === 'heroi' ? 'heroi' : 'npc' };
    if (!f.quem) return { nome: null, classe: 'narracao' };
    if (f.quem === 'pensamento') return { nome: null, classe: 'pensamento' };
    if (f.quem === 'heroi') return { nome: p?.nome ?? '', classe: 'heroi' };
    return { nome: NOMES_NPC[f.quem]?.nome ?? f.quem, classe: 'npc' };
  }

  /** NPC em cena na conversa e se o herói já falou nela (os dois bustos aparecem conversando). */
  let npcNaConversa: string | null = null;
  let heroiNaConversa = false;

  /** Busto do NPC, com a expressão quando o arquivo existe (senão o normal, sem erro). */
  async function retratoDe(f: Fala): Promise<string> {
    const normal = ASSETS.retratoNpc(f.quem!);
    if (!f.expressao) return normal;
    const comExpressao = ASSETS.retratoNpc(f.quem!, f.expressao);
    return (await existeAssetCache(comExpressao, 'image')) ? comExpressao : normal;
  }

  /** Versão própria virada para o lado certo (<id>-dir / <id>-esq), no lugar do espelho, só quando está
   *  declarada em retratos.json: sem consulta à rede (nada pode ser baixado no meio de uma sequência). */
  async function versaoDoLado(caminho: string, lado: 'npc' | 'heroi'): Promise<string> {
    if (!precisaEspelhar(caminho, lado)) return caminho;
    const propria = caminho.replace(/\.webp$/, lado === 'npc' ? '-dir.webp' : '-esq.webp');
    return temVersaoPropria(propria) ? propria : caminho;
  }

  /** Troca o busto do NPC; na troca de expressão do mesmo NPC, crossfade de 150 ms (sem piscar). */
  /** Cada fala tem o seu busto: se a fala mudou enquanto a imagem carregava, ela é descartada. */
  let pedidoBusto = 0;
  async function mostrarNpc(id: string, retrato: string): Promise<'ok' | 'descartado' | 'falhou'> {
    const mesmo = npcNaConversa === id && !busto.hidden;
    if (mesmo && busto.dataset.retrato === retrato) return 'ok';
    const pedido = ++pedidoBusto;
    const novo = src(retrato);
    const pronta = await imagemPronta(novo);
    if (pedido !== pedidoBusto || destruido) return 'descartado';
    if (!pronta) return 'falhou';
    if (mesmo) {
      bustoTroca.src = busto.src;
      bustoTroca.classList.remove('sumindo');
      bustoTroca.hidden = false;
      busto.src = novo;
      requestAnimationFrame(() => requestAnimationFrame(() => bustoTroca.classList.add('sumindo')));
      window.setTimeout(() => { bustoTroca.hidden = true; bustoTroca.classList.remove('sumindo'); }, 200);
    } else {
      busto.src = novo;
      busto.classList.remove('entra');
      void busto.offsetWidth;
      busto.classList.add('entra');
    }
    busto.dataset.retrato = retrato;
    busto.dataset.npc = id;
    // Fase 6: de frente um para o outro. O NPC (à esquerda) olha para a direita; se o busto olha para o
    // outro lado, a imagem é espelhada (scaleX(-1)).
    busto.classList.toggle('espelhado', precisaEspelhar(retrato, 'npc'));
    busto.alt = NOMES_NPC[id]?.nome ?? id;
    busto.hidden = false;
    return 'ok';
  }

  function esconderBustos() {
    pedidoBusto++;
    npcNaConversa = null;
    heroiNaConversa = false;
    busto.hidden = true;
    bustoTroca.hidden = true;
    busto.removeAttribute('data-retrato');
    busto.removeAttribute('data-npc');
    bustoHeroi.hidden = true;
    bustos.hidden = true;
    bustos.className = 'cena-bustos';
    painel.classList.remove('com-busto');
  }

  /** Expressão do busto do herói (choque, dor, raiva, determinado); sem o arquivo, o busto normal. */
  async function expressaoHeroi(expr: string | undefined) {
    if (!p) return;
    const normal = ASSETS.bustoHeroi(p.raca, p.genero);
    const com = expr ? ASSETS.bustoHeroi(p.raca, p.genero, expr) : normal;
    const alvo = await versaoDoLado(com !== normal && (await existeAssetCache(com, 'image')) ? com : normal, 'heroi');
    if (bustoHeroi.dataset.retrato !== alvo) { bustoHeroi.src = src(alvo); bustoHeroi.dataset.retrato = alvo; }
    bustoHeroi.classList.toggle('espelhado', precisaEspelhar(alvo, 'heroi'));
    bustoHeroi.dataset.expressao = alvo === normal ? 'normal' : expr!;
  }

  async function arrumarBustos(f: Fala) {
    // Fala nova: qualquer busto que ainda estava carregando para a fala anterior é descartado.
    pedidoBusto++;
    const meu = pedidoBusto;
    bustoHeroi.classList.toggle('aura', !!f.aura);
    busto.classList.toggle('memoria', !!f.memoria);
    // O herói aparece (com expressão) numa narração ou fala de NPC: "bustoHeroi" na fala.
    if (f.bustoHeroi !== undefined || f.quem === 'heroi') await expressaoHeroi(f.bustoHeroi ?? (f.quem === 'heroi' ? f.expressao : undefined));
    if (meu !== pedidoBusto) return;
    // Narração e pensamento: sem bustos (a conversa recomeça na próxima fala), a não ser o do herói pedido.
    if ((!f.quem || f.quem === 'pensamento') && f.bustoHeroi !== undefined && p) {
      esconderBustos();
      heroiNaConversa = true;
      bustoHeroi.hidden = false;
      bustos.hidden = false;
      bustos.className = 'cena-bustos so-heroi fala-heroi';
      bustoHeroi.classList.remove('apagado');
      painel.classList.add('com-busto');
      return;
    }
    if (!f.quem || f.quem === 'pensamento') return esconderBustos();
    // Vozes, a divindade e personagens sem busto (Liessa, na memória): só o nome, sem retrato.
    if (f.quem !== 'heroi' && !NOMES_NPC[f.quem]) return esconderBustos();
    if (f.bustoHeroi !== undefined) heroiNaConversa = true;
    const falaHeroi = f.quem === 'heroi';
    if (falaHeroi) {
      if (!p) return esconderBustos();
      heroiNaConversa = true;
    } else {
      if (npcNaConversa && npcNaConversa !== f.quem) heroiNaConversa = false;
      const r = await mostrarNpc(f.quem, await versaoDoLado(await retratoDe(f), 'npc'));
      // A fala já mudou (o jogador avançou): este busto não vale mais, e a fala nova arruma os bustos.
      if (r === 'descartado') return;
      if (r === 'ok') npcNaConversa = f.quem;
    }
    busto.hidden = !npcNaConversa;
    if (busto.hidden) bustoTroca.hidden = true;
    bustoHeroi.hidden = !heroiNaConversa;
    const dois = !busto.hidden && !bustoHeroi.hidden;
    bustos.hidden = false;
    bustos.className = `cena-bustos${dois ? ' dois' : ''} fala-${falaHeroi ? 'heroi' : 'npc'}`;
    busto.classList.toggle('apagado', falaHeroi);
    bustoTroca.classList.toggle('apagado', falaHeroi);
    bustoHeroi.classList.toggle('apagado', !falaHeroi);
    painel.classList.add('com-busto');
  }

  async function mostrarFala(f: Fala): Promise<void> {
    if (f.pausaAntes) {
      // Silêncio: a caixa some e a cena espera, sem aceitar toque.
      caixa.classList.add('pausa');
      texto.textContent = '';
      await esperar(f.pausaAntes);
      caixa.classList.remove('pausa');
      if (destruido) return;
    }
    const inicioFala = performance.now();
    const q = quemFala(f);
    await arrumarBustos(f);
    if (destruido) return;
    caixa.className = `cena-caixa ${q.classe}${f.estilo ? ` estilo-${f.estilo}` : ''}`;
    nome.hidden = !q.nome;
    nome.textContent = q.nome ?? '';
    const cheio = interpolar(f.texto);
    texto.textContent = '';
    caixa.dataset.quem = f.quem ?? 'narracao';
    if (f.expressao) caixa.dataset.expressao = f.expressao; else delete caixa.dataset.expressao;
    return new Promise((ok) => {
      digitando = true;
      caixa.classList.remove('completa');
      let i = 0;
      window.clearInterval(timerFala);
      const timer = window.setInterval(() => {
        i++;
        texto.textContent = cheio.slice(0, i);
        if (i % 3 === 0 && cheio[i - 1] !== ' ') audio.sfx('text-blip', { ganho: 0.5 });
        if (i >= cheio.length) terminar();
      }, f.velocidade ?? 22);
      timerFala = timer;
      const terminar = () => {
        window.clearInterval(timer);
        texto.textContent = cheio;
        digitando = false;
        caixa.classList.add('completa');
        completar = null;
        const liberar = () => {
          if (destruido) return;
          avancar = () => { avancar = null; ok(); };
          if (f.auto) window.setTimeout(() => { if (avancar && cena) avancar(); }, f.auto);
        };
        // Tempo mínimo (os gritos): o texto já está completo, mas a cena só segue depois dele.
        const falta = (f.minimo ?? 0) - (performance.now() - inicioFala);
        if (falta > 0) {
          caixa.classList.add('esperando');
          window.setTimeout(() => { caixa.classList.remove('esperando'); liberar(); }, falta);
        } else liberar();
      };
      completar = terminar;
    });
  }

  function tocar() {
    if (ocupado && !digitando && !avancar) return;
    if (digitando && completar) completar();
    else if (avancar) { audio.sfx('ui-click', { ganho: 0.4 }); avancar(); }
  }
  caixa.addEventListener('click', tocar);

  /**
   * Teclado (PC), na fase de captura, antes de qualquer outro ouvinte:
   * - Espaço e Enter: completam o texto que está aparecendo; depois, avançam;
   * - com escolhas: setas (ou W/S) movem o destaque, Enter confirma, 1–4 escolhem direto; Espaço não
   *   escolhe nada (só o botão "Continuar", que não é uma escolha);
   * - a tecla tratada aqui tem preventDefault: a página não rola e o mapa não interage com a mesma tecla.
   */
  const ABERTOS = '.modal-fundo, .rolagem-fundo, .compendio-fundo, .caderno-fundo, .livro, .dica-tutorial, .tutorial-fundo, .saves-fundo';
  function teclado(e: KeyboardEvent) {
    if (destruido || !el.isConnected || document.querySelector(ABERTOS)) return;
    const k = e.key;
    const teclaAvanco = k === ' ' || k === 'Enter';
    const bots = [...escolhas.querySelectorAll<HTMLButtonElement>('.cena-escolha')].filter((b) => !b.disabled);
    if (teclaAvanco && e.repeat) { e.preventDefault(); return; }
    if (bots.length && !digitando) {
      const atual = bots.findIndex((b) => b.classList.contains('destacada'));
      const destacar = (i: number) => {
        bots.forEach((b, j) => b.classList.toggle('destacada', j === i));
        bots[i]?.scrollIntoView({ block: 'nearest' });
      };
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 's' || k === 'S' || k === 'w' || k === 'W') {
        e.preventDefault();
        const passo = k === 'ArrowDown' || k === 's' || k === 'S' ? 1 : -1;
        destacar(atual < 0 ? (passo > 0 ? 0 : bots.length - 1) : (atual + passo + bots.length) % bots.length);
        audio.sfx('ui-click', { ganho: 0.25 });
        return;
      }
      if (/^[1-4]$/.test(k)) {
        const b = bots[Number(k) - 1];
        if (b) { e.preventDefault(); destacar(Number(k) - 1); b.click(); }
        return;
      }
      if (k === 'Enter') {
        e.preventDefault();
        if (atual >= 0) bots[atual].click();
        else destacar(0);
        return;
      }
      if (k === ' ') {
        e.preventDefault();
        if (bots.length === 1 && bots[0].classList.contains('cena-seguir')) bots[0].click();
        return;
      }
    }
    if (teclaAvanco) {
      e.preventDefault();
      tocar();
    }
  }
  window.addEventListener('keydown', teclado, true);

  function mostrarAmeaca(id: string) {
    const a = DADOS_AMEACAS[id];
    if (!a) return;
    ameaca.replaceChildren(
      h('img', { src: src(ASSETS.ameaca(a.imagem)), 'data-ameaca': a.imagem, alt: a.nome, draggable: 'false' }),
      h('div', { class: 'ameaca-legenda' },
        h('span', { class: 'ameaca-selo' }, a.selo),
        h('p', { class: 'ameaca-nome' }, `${a.nome.toUpperCase()} · ${a.tipo}`)));
    ameaca.hidden = false;
    requestAnimationFrame(() => ameaca.classList.add('entrou'));
  }

  const chaveEscolha = (c: Cena, i: number) => `${c.id}#${i}`;

  function escolhasDe(c: Cena): { e: Escolha; i: number }[] {
    const usadas = getEstado().campanha.usadas;
    return (c.escolhas ?? []).map((e, i) => ({ e, i })).filter(({ e, i }) => atende(e.requer) && !(e.uma_vez && usadas.includes(chaveEscolha(c, i))));
  }

  function seloTeste(e: Escolha): string | null {
    if (!e.teste || !p) return null;
    const b = bonusPericia(p, e.teste.pericia, getEstado().campanha.bonusProximoTeste);
    const sinal = b.total < 0 ? `−${Math.abs(b.total)}` : `+${b.total}`;
    return `${e.rotulo ? `${e.rotulo} · ` : ''}${PERICIAS[e.teste.pericia].nome} CD ${e.teste.cd} · ${T.seuBonus} ${sinal}`;
  }

  function mostrarEscolhas(c: Cena) {
    const lista = escolhasDe(c);
    escolhas.replaceChildren(...lista.map(({ e, i }) => {
      const selo = seloTeste(e);
      const b = botao('', () => void escolher(c, e, i), { classe: 'cena-escolha', som: 'ui-confirm' });
      const partes: Node[] = [];
      if (e.rotulo && !selo) partes.push(h('span', { class: 'escolha-rotulo' }, e.rotulo));
      if (selo) partes.push(h('span', { class: 'escolha-selo' }, selo));
      partes.push(h('span', { class: 'escolha-texto' }, interpolar(e.texto)));
      b.replaceChildren(...partes);
      b.dataset.escolha = String(i);
      if (e.batalha) b.dataset.batalha = e.batalha;
      return b;
    }));
    painel.classList.add('com-escolhas');
    el.classList.add('com-escolhas');
    escolhas.classList.add('visivel');
    // Sem foco automático: Espaço ou Enter de quem acabou de ler não escolhem nada sem querer (teclado acima).
    if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
    requestAnimationFrame(() => escolhas.scrollIntoView({ block: 'end', behavior: 'smooth' }));
    void dica('escolha');
  }

  function mostrarSeguir(s: Seguir) {
    const b = botao(s.texto ?? T.continuar, () => void seguir(s), { classe: 'cena-escolha cena-seguir', som: 'ui-confirm' });
    escolhas.replaceChildren(b);
    painel.classList.add('com-escolhas');
    escolhas.classList.add('visivel');
    b.focus({ preventScroll: true });
  }

  function limparEscolhas() {
    escolhas.replaceChildren();
    escolhas.classList.remove('visivel');
    painel.classList.remove('com-escolhas');
    el.classList.remove('com-escolhas');
  }

  function registrarCaminho(passo: { cena: string; escolha?: string; resultado?: string }) {
    atualizarCampanha({ caminho: [...getEstado().campanha.caminho, passo] });
  }

  async function escolher(c: Cena, e: Escolha, i: number) {
    if (ocupado) return;
    ocupado = true;
    limparEscolhas();
    if (e.uma_vez) atualizarCampanha({ usadas: [...getEstado().campanha.usadas, chaveEscolha(c, i)] });
    if (e.teste && p) {
      aplicarEfeitos(e.efeitos);
      const bonus = bonusPericia(p, e.teste.pericia, getEstado().campanha.bonusProximoTeste);
      atualizarCampanha({ bonusProximoTeste: 0 });
      const r = await mostrarRolagem(el, { titulo: PERICIAS[e.teste.pericia].nome, d20: rolarD20(), partes: bonus.partes, alvo: e.teste.cd });
      registrarCaminho({ cena: c.id, escolha: e.texto, resultado: r.sucesso ? 'sucesso' : 'falha' });
      ocupado = false;
      return void entrar(r.sucesso ? e.sucesso! : e.falha!, 'falas');
    }
    aplicarEfeitos(e.efeitos);
    registrarCaminho({ cena: c.id, escolha: e.texto });
    if (e.fala) await mostrarFala({ quem: 'heroi', texto: e.fala });
    if (e.caderno) {
      await abrirCaderno({ aba: 'deuses', pagina: e.caderno });
      if (destruido) return;
    }
    ocupado = false;
    return seguir(e);
  }

  async function seguir(s: Seguir | Escolha) {
    limparEscolhas();
    if (s.batalha) return o.aoBatalha({ batalha: s.batalha, vitoria: s.vitoria!, derrota: s.derrota!, cenaOrigem: cena?.id ?? null });
    if ('fim' in s && s.fim) return o.aoFim();
    if (s.mapa) return o.aoMapa({ mapa: s.mapa, x: s.x, y: s.y });
    if (s.voltar) { pararFala(); cena = null; return o.aoVoltar?.(); }
    if (s.vai_para) return void entrar(s.vai_para, 'falas');
  }

  function tremer(leve = false) {
    if (!tremoresLigados()) return;
    const alvo = el.closest('.tela') as HTMLElement ?? el;
    alvo.classList.remove('tremendo', 'tremendo-leve');
    void alvo.offsetWidth;
    alvo.classList.add(leve ? 'tremendo-leve' : 'tremendo');
  }

  /** Música que entra depois de um tempo (cancelada se a cena mudar antes). */
  let timerMusica = 0;

  async function efeitosDaFala(f: Fala) {
    if (f.musica !== undefined) {
      window.clearTimeout(timerMusica);
      if (f.musica === null && f.musicaCorte) audio.pararMusica(0);
      else if (f.musica === null && f.musicaFade !== undefined) audio.pararMusica(f.musicaFade);
      else tocarMusicaDaCena(f.musica, f.musicaCorte ? 0 : 1500);
    }
    if (f.musicaDepois) {
      const { musica, atraso } = f.musicaDepois;
      const daCena = cena;
      window.clearTimeout(timerMusica);
      timerMusica = window.setTimeout(() => { if (!destruido && cena === daCena) tocarMusicaDaCena(musica, 0); }, atraso);
    }
    if (f.abafar !== undefined) audio.abafar(f.abafar);
    if (f.loop !== undefined) {
      pararLoop?.();
      pararLoop = f.loop ? audio.sfxLoop(f.loop as NomeSfx) : null;
    }
    if (f.ambiente !== undefined) {
      ambiente?.parar(f.ambienteFade ?? 1500);
      ambiente = f.ambiente ? audio.loopAmbiente(f.ambiente.som as NomeSfx, f.ambiente.ganho ?? 1, 600) : null;
    }
    if (f.ambienteGanho !== undefined) ambiente?.ganho(f.ambienteGanho, f.ambienteFade ?? 1200);
    if (f.ocasional !== undefined) {
      window.clearTimeout(timerOcasional);
      if (f.ocasional) ocasional(f.ocasional);
    }
    if (f.visual?.startsWith('memoria')) efeitoMemoria(el, f.visual as ModoMemoria, animacoesReduzidas());
    if (f.visual) { for (const c of [...el.classList]) if (c.startsWith('visual-')) el.classList.remove(c); el.classList.add(`visual-${f.visual}`); }
    if (f.som) audio.sfx(f.som as NomeSfx, f.somTaxa ? { taxa: f.somTaxa } : {});
    // Animações reduzidas: sem flash (os cortes continuam secos).
    if (f.flash && !animacoesReduzidas()) {
      flash.classList.remove('ativo', 'curto');
      void flash.offsetWidth;
      flash.classList.add('ativo');
      if (f.flash === 'curto') flash.classList.add('curto');
    }
    if (f.tremor) tremer(f.tremor === 'leve');
  }

  async function entrar(id: string, modo: 'falas' | 'escolhas' = 'falas'): Promise<void> {
    if (destruido) return;
    const achada = cenaGlobal(id);
    if (!achada) throw new Error(`Cena desconhecida: ${id}`);
    const c = achada.cena;
    if (c.rotas) {
      const rota = c.rotas.find((r) => atende(r.requer));
      if (rota) return entrar(rota.vai_para, 'falas');
    }
    pararFala();
    cena = c;
    o.aoEntrarCena?.(c, modo);
    // Um save manual no meio desta cena volta para cá, antes dos efeitos de entrada.
    marcarInicioCena(c.id, modo);
    ameaca.hidden = true;
    ameaca.classList.remove('entrou');
    limparEscolhas();
    trocarFundo(c.fundo);
    for (const k of [...el.classList]) if (k.startsWith('visual-')) el.classList.remove(k);
    if (c.visual) el.classList.add(`visual-${c.visual}`);
    el.dataset.cena = c.id;
    for (const f of c.falas ?? []) if (f.expressao && f.quem) void existeAssetCache(ASSETS.retratoNpc(f.quem, f.expressao), 'image');
    if (modo === 'falas') {
      aplicarEfeitos(c.aoEntrar);
      if (c.aoEntrar?.som) audio.sfx(c.aoEntrar.som as NomeSfx);
      if (c.aoEntrar?.tremor) tremer();
      if (c.vinheta) {
        audio.tocarVinheta(ASSETS.musica(c.vinheta), () => !destruido && cena === c && tocarMusicaDaCena(c.musica, 1500));
      } else if (c.silencioAntes) {
        audio.pararMusica(400);
        window.setTimeout(() => !destruido && tocarMusicaDaCena(c.musica, 1500), c.silencioAntes);
      } else {
        tocarMusicaDaCena(c.musica, c.fadeMusica ?? 1500);
      }
      // Tutorial: a primeira cena narrativa explica como o texto avança (antes da primeira fala).
      if (c.falas.some((f) => atende(f.requer))) {
        await dica('cena-texto');
        if (destruido || cena !== c) return;
      }
      const grupos: Record<string, number> = {};
      for (const f of c.falas) {
        if (!atende(f.requer)) continue;
        if (f.grupo) {
          grupos[f.grupo] = (grupos[f.grupo] ?? 0) + 1;
          if (f.limite && grupos[f.grupo] > f.limite) continue;
        }
        aplicarEfeitos(f.efeitos);
        if (f.fundo) trocarFundo(f.fundo, !f.corte, f.corte);
        if (f.ameaca) mostrarAmeaca(f.ameaca);
        await efeitosDaFala(f);
        await mostrarFala(f);
        if (destruido || cena !== c) return;
      }
    } else {
      tocarMusicaDaCena(c.musica, 1500);
      const ultima = [...c.falas].reverse().find((f) => atende(f.requer));
      if (ultima) { texto.textContent = interpolar(ultima.texto); caixa.classList.add('completa'); }
    }
    if (c.retorna) return entrar(c.retorna, 'escolhas');
    if (escolhasDe(c).length) return mostrarEscolhas(c);
    if (c.seguir) {
      // Cena sem falas (só efeitos ou só um destino): segue direto, sem botão.
      if (!c.falas.length) return void seguir(c.seguir);
      return mostrarSeguir(c.seguir);
    }
  }

  return {
    el,
    entrar,
    tocar,
    cenaAtual: () => cena,
    digitando: () => digitando,
    escolhasVisiveis: () => [...escolhas.querySelectorAll('.cena-escolha')].map((b) => b.querySelector('.escolha-texto')?.textContent ?? b.textContent ?? ''),
    fundo: () => fundoAtual,
    /** Busto do herói na tela: visível e a expressão ("normal", "choque"…), e a aura. */
    bustoHeroi: () => ({ visivel: !bustoHeroi.hidden && !bustos.hidden, expressao: bustoHeroi.dataset.expressao ?? 'normal', aura: bustoHeroi.classList.contains('aura') }),
    destruir() {
      destruido = true;
      window.removeEventListener('keydown', teclado, true);
      limparInicioCena();
      pararFala();
      window.clearTimeout(timerMusica);
      pararLoop?.();
      ambiente?.parar(800);
      window.clearTimeout(timerOcasional);
      audio.abafar(false);
    },
  };
}

export { esperar };
