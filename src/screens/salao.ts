import MAPA_JSON from '../data/mapas/salao-forja.json';
import PODERES from '../data/poderes-concedidos.json';
import { ASSETS, SFX_ATO1, src, urlAsset } from '../core/assets';
import { audio } from '../core/audio';
import { verificarCaderno } from '../core/caderno';
import { importar } from '../core/carregar';
import { classePorId, nomeDaClasse, pmPrimeiroNivel, pvPrimeiroNivel } from '../core/classes';
import { animacoesReduzidas, atualizarCampanha, getEstado, marcarFlag } from '../core/estado';
import { garantirEtapa } from '../core/etapas';
import { estadoProgresso, registrarGanchos } from '../core/ganchos';
import { pvAntesDaForjaDe } from '../core/pericias';
import { irPara, type Tela } from '../core/telas';
import { ehToque, textos } from '../core/textos';
import { abrirModal, botao, esperar, h } from '../core/ui';
import { dadosDeus, interpolar } from '../narrativa/capitulo';
import { cartaoParte } from '../narrativa/cartoes';
import { criarPalco, type Palco } from '../narrativa/palco';
import type { Controles } from '../exploracao/controles';
import type { Motor } from '../exploracao/motor';
import { blocosDoChao, type DadosMapa } from '../exploracao/tipos';
import { abrirMenuPausa } from './pausa';

/**
 * Ato I, Parte 6 · O Salão e a Forja: o mapa do Salão (motor de mapas, visto de cima) com a coluna de luz
 * do pedestal, as sete vozes ao mesmo tempo, a escolha do coração (pela estátua ou pela lista do menu),
 * a divindade que se apresenta e as telas da Forja: juramento, poderes concedidos, relíquia, cura e
 * classe, e o "Erga-se". Termina no "Fim do Ato I".
 */

interface Estatua { id: string; cor: string; base: { x: number; y: number }; foco: { x: number; y: number } }
const MAPA = MAPA_JSON as unknown as DadosMapa & { estatuas: Estatua[]; musica: string };
const DEUSES = MAPA.estatuas.map((e) => e.id);
const PODERES_DE = (PODERES as unknown as { deuses: Record<string, PoderConcedido[]> }).deuses;
interface PoderConcedido { id: string; nome: string; custoPM: number | null; acao: string; frequencia: string; descricao: string }
const ACOES: Record<string, string> = { movimento: 'Ação de movimento', padrao: 'Ação padrão', completa: 'Ação completa', livre: 'Ação livre', reacao: 'Reação', passivo: 'Passivo' };

/** As frases do sonho (Fase 2), pelo deus. */
const VOZES_SONHO = textos.sonho.vozes as Record<string, { titulo: string; mensagem: string }>;
const T = textos.forja;

export function telaSalao(): Tela {
  const p = getEstado().personagem!;
  const classe = classePorId(p.classe);
  const c0 = getEstado().campanha;
  const comecoDaParte = !c0.cena || c0.cena === 'inicio';

  const jogoEl = h('div', { class: 'salao-jogo' });
  const baloes = h('div', { class: 'salao-baloes', 'aria-live': 'polite' });
  const palcoEl = h('div', { class: 'lateral-palco salao-palco' });
  const forjaEl = h('div', { class: 'forja', hidden: true });
  const el = h('div', { class: 'tela-salao' }, jogoEl, baloes, palcoEl, forjaEl);

  let motor: Motor | null = null;
  let controles: Controles | null = null;
  let palco: Palco | null = null;
  let cenaAberta: string | null = null;
  let ocupado = false;
  let saiu = false;
  let fecharPausa: (() => void) | null = null;
  let pronto = false;
  let etapaForja: string | null = null;
  let efeitos: EfeitosSalao | null = null;

  const feito = (id: string) => getEstado().campanha.coletados.includes(`salao:${id}`);
  const marcar = (id: string) => { if (!feito(id)) atualizarCampanha({ coletados: [...getEstado().campanha.coletados, `salao:${id}`] }); };
  const deus = () => dadosDeus(getEstado().campanha.divindade);

  function travar(sim: boolean) {
    ocupado = sim;
    motor?.bloquear(sim);
    controles?.habilitar(!sim);
    if (sim) controles?.mostrarInteracao(false);
  }

  function falar(id: string): Promise<void> {
    return new Promise((ok) => {
      cenaAberta = id;
      travar(true);
      el.classList.add('com-palco');
      palco?.destruir();
      palcoEl.replaceChildren();
      const fechar = () => {
        palco?.destruir();
        palco = null;
        palcoEl.replaceChildren();
        el.classList.remove('com-palco');
        cenaAberta = null;
        travar(false);
        ok();
      };
      palco = criarPalco({ sobreMapa: true, aoBatalha: () => {}, aoFim: fechar, aoMapa: fechar, aoVoltar: fechar });
      palcoEl.append(palco.el);
      void palco.entrar(id, 'falas');
    });
  }

  /* ------------------------------------------------------------ as sete vozes */

  /** Posição na tela (CSS px) de um ponto do mapa. */
  function naTela(x: number, y: number) {
    const cam = motor!.cena.cameras.main;
    const v = cam.worldView;
    const canvas = motor!.cena.game.canvas;
    const k = canvas.getBoundingClientRect().width / canvas.width;
    const r = jogoEl.getBoundingClientRect();
    return { x: r.left + (x - v.x) * cam.zoom * k, y: r.top + (y - v.y) * cam.zoom * k };
  }

  async function seteVozes() {
    if (!motor || feito('vozes')) return;
    marcar('vozes');
    travar(true);
    await motor.caminharAte(MAPA.pontos!.frentePedestal.x, MAPA.pontos!.frentePedestal.y);
    motor.virar('cima');
    efeitos?.acenderTodas(true);
    audio.sfx('divine-chord', { ganho: 0.7 });
    // As sete frases do sonho, cada uma ao lado da sua estátua, quase juntas, sobrepondo-se um pouco.
    baloes.replaceChildren();
    for (const [i, e] of MAPA.estatuas.entries()) {
      const pos = naTela(e.foco.x, e.foco.y);
      const b = h('p', { class: `salao-balao balao-${e.id}`, 'data-deus': e.id }, VOZES_SONHO[e.id]?.mensagem ?? '');
      b.style.left = `${pos.x}px`;
      b.style.top = `${pos.y}px`;
      b.style.setProperty('--cor', e.cor);
      b.style.animationDelay = `${i * 110}ms`;
      baloes.append(b);
    }
    baloes.classList.add('visiveis');
    await esperar(3800);
    baloes.classList.remove('visiveis');
    await falar('f-vozes');
    baloes.replaceChildren();
    efeitos?.acenderTodas(false);
    travar(false);
  }

  /* ------------------------------------------------------------ a escolha do coração */

  async function ouvirEstatua(id: string) {
    if (ocupado || getEstado().campanha.divindade || !feito('vozes')) return;
    efeitos?.destacar(id);
    audio.sfx('statue-glow', { ganho: 0.7 });
    await falar(`f-voz-${id}`);
    if (getEstado().campanha.divindade) return seguirVoz();
    efeitos?.destacar(null);
  }

  function escolherEmLista() {
    if (getEstado().campanha.divindade || ocupado) return;
    let fechar = () => {};
    const lista = h('div', { class: 'forja-lista' }, ...DEUSES.map((id) => {
      const frase = interpolar(PALAVRAS[id]);
      const b = h('button', { type: 'button', class: 'forja-lista-item', 'data-deus': id, style: `--cor: ${MAPA.estatuas.find((e) => e.id === id)!.cor}` },
        h('span', { class: 'forja-lista-titulo' }, VOZES_SONHO[id].titulo),
        h('span', { class: 'forja-lista-frase' }, `“${frase}”`));
      b.addEventListener('click', () => {
        fechar();
        atualizarCampanha({ divindade: id });
        marcarFlag('escolheu_voz');
        void seguirVoz();
      });
      return b;
    }));
    fechar = abrirModal(T.listaTitulo, h('div', {}, h('p', { class: 'forja-lista-intro' }, T.listaIntro), lista), textos.cenas.fechar);
  }

  async function seguirVoz() {
    const d = deus();
    if (!d || !motor) return;
    travar(true);
    efeitos?.seguir(d.id);
    audio.sfx('statue-awaken');
    await esperar(1600);
    // A divindade se apresenta: grande e luminosa sobre o Salão escurecido.
    const apres = h('div', { class: 'forja-divindade', 'data-deus': d.id, style: `--cor: ${corDe(d.id)}` },
      h('img', { class: 'forja-divindade-img', src: src(`img/panteao/${d.imagem}.webp`), alt: d.nome, draggable: 'false' }),
      h('div', { class: 'forja-divindade-texto' },
        h('h2', { class: 'forja-divindade-nome' }, d.nome),
        h('p', { class: 'forja-divindade-grupo' }, d.grupo === 'alfar' ? 'Alfar' : 'Baldur'),
        h('p', { class: 'forja-divindade-dominio' }, d.dominio)));
    el.append(apres);
    requestAnimationFrame(() => apres.classList.add('visivel'));
    audio.sfx('divine-chord');
    await esperar(1800);
    await falar('f-apresentacao');
    travar(true);
    apres.classList.add('saindo');
    await esperar(600);
    apres.remove();
    await forja();
  }

  /* ------------------------------------------------------------ a Forja */

  function tela(classe: string, ...filhos: (Node | null)[]) {
    forjaEl.hidden = false;
    const t = h('section', { class: `forja-tela ${classe}` }, ...filhos);
    forjaEl.replaceChildren(t);
    requestAnimationFrame(() => t.classList.add('visivel'));
    return t;
  }
  const clique = (b: HTMLButtonElement) => new Promise<void>((ok) => b.addEventListener('click', () => ok(), { once: true }));

  async function forja() {
    const d = deus()!;
    const c = getEstado().campanha;
    // 1. Juramento: os três votos, cada um com o eco do túnel antes do "Eu juro".
    etapaForja = 'juramento';
    const ecos: Record<string, string> = {
      tolerancia: c.flags.includes('caminho_tolerancia') ? T.ecos.toleranciaCom : T.ecos.toleranciaSem,
      coragem: T.ecos.coragem,
      protecao: T.ecos.protecao,
    };
    for (const [i, voto] of (['tolerancia', 'coragem', 'protecao'] as const).entries()) {
      const btn = botao(T.euJuro, () => {}, { classe: 'btn-principal forja-juro' });
      tela('forja-juramento',
        h('p', { class: 'forja-rotulo' }, `${T.juramento} · ${i + 1}/3`),
        h('h2', { class: 'forja-voto', 'data-voto': voto }, interpolar(T.votos[voto])),
        h('p', { class: 'forja-eco' }, interpolar(ecos[voto])),
        btn);
      btn.focus({ preventScroll: true });
      await clique(btn);
      audio.sfx('hero-confirm');
      marcarFlag(`jurou_${voto}`);
    }
    const seguir1 = botao(textos.cenas.continuar, () => {}, { classe: 'btn-principal' });
    tela('forja-juramento forja-depois',
      h('p', { class: 'forja-fala' }, h('strong', {}, `${T.voce}: `), interpolar(T.depoisVoce)),
      h('p', { class: 'forja-fala' }, h('strong', {}, `${d.nome}: `), interpolar(T.depoisDeus)),
      seguir1);
    await clique(seguir1);

    // 2. Poderes concedidos: 1 para o devoto, 2 para o Paladino (Núcleo).
    etapaForja = 'poderes';
    const quantos = p.classe === 'paladino' ? 2 : 1;
    const escolhidos = new Set<string>();
    const confirmar = botao(T.confirmarPoderes, () => {}, { classe: 'btn-principal', desabilitado: true });
    const cartoes = (PODERES_DE[d.id] ?? []).map((pd) => {
      const b = h('button', { type: 'button', class: 'forja-poder', 'data-poder': pd.id, 'aria-pressed': 'false' },
        h('span', { class: 'forja-poder-nome' }, pd.nome),
        h('span', { class: 'forja-poder-meta' }, [ACOES[pd.acao] ?? pd.acao, pd.custoPM ? `${pd.custoPM} PM` : null, pd.frequencia || null].filter(Boolean).join(' · ')),
        h('span', { class: 'forja-poder-desc' }, pd.descricao));
      b.addEventListener('click', () => {
        if (escolhidos.has(pd.id)) escolhidos.delete(pd.id);
        else { if (escolhidos.size >= quantos) escolhidos.delete([...escolhidos][0]); escolhidos.add(pd.id); }
        for (const x of cartoes) x.setAttribute('aria-pressed', String(escolhidos.has(x.dataset.poder!)));
        confirmar.disabled = escolhidos.size !== quantos;
        audio.sfx('ui-click');
      });
      return b;
    });
    tela('forja-poderes',
      h('p', { class: 'forja-rotulo' }, T.poderes),
      h('h2', { class: 'forja-titulo' }, interpolar(quantos === 2 ? T.escolhaDois : T.escolhaUm)),
      h('div', { class: 'forja-poderes-lista' }, ...cartoes),
      confirmar);
    await clique(confirmar);
    atualizarCampanha({ poderes: [...escolhidos] });
    audio.sfx('hero-confirm');

    // 3. A relíquia da classe, com um zoom lento; as quatro pedras dormem (a da Tolerância brilha fraco).
    etapaForja = 'reliquia';
    const tolerancia = getEstado().campanha.flags.includes('caminho_tolerancia');
    const seguir3 = botao(textos.cenas.continuar, () => {}, { classe: 'btn-principal' });
    const pedras = h('div', { class: 'forja-pedras', 'aria-label': T.pedras },
      ...(['tolerancia', 'egide', 'verdade', 'preco'] as const).map((id) =>
        h('span', { class: `forja-pedra pedra-${id === 'preco' ? 'vermelha' : 'azul'}${id === 'tolerancia' && tolerancia ? ' brilha' : ''}`, 'data-pedra': id, title: T.nomesPedras[id] })));
    tela('forja-reliquia',
      h('div', { class: 'forja-reliquia-quadro' },
        h('img', { class: 'forja-reliquia-img', src: src(ASSETS.cena(`cena-reliquia-${p.classe}`)), alt: classe?.reliquia ?? '', 'data-classe': p.classe ?? '' })),
      h('p', { class: 'forja-texto' }, T.reliquiaTexto),
      pedras,
      tolerancia ? h('p', { class: 'forja-eco' }, T.toleranciaBrilha) : null,
      seguir3);
    audio.sfx('statue-glow');
    await clique(seguir3);

    // 4. Cura e classe: as flechas se desfazem em faíscas; os PV voltam ao máximo e viram os da classe.
    etapaForja = 'cura';
    const pvAntes = getEstado().campanha.pvAtual ?? pvAntesDaForjaDe(p);
    const pvMaxAntes = pvAntesDaForjaDe(p);
    const pvNovo = classe ? pvPrimeiroNivel(classe, p.atributosFinais) : pvMaxAntes;
    const pmNovo = classe ? pmPrimeiroNivel(classe, p.atributosFinais, p.raca) : 0;
    const numPv = h('span', { class: 'forja-num', 'data-num': 'pv' }, `${pvAntes}/${pvMaxAntes}`);
    const numPm = h('span', { class: 'forja-num', 'data-num': 'pm' }, '0');
    const seguir4 = botao(textos.cenas.continuar, () => {}, { classe: 'btn-principal', desabilitado: true });
    tela('forja-cura',
      h('div', { class: 'forja-cura-luz' },
        h('img', { class: 'forja-cura-heroi', src: src(ASSETS.retrato(p.raca, p.genero, p.classe ?? 'comum')), alt: p.nome }),
        h('div', { class: 'forja-faiscas', 'aria-hidden': 'true' }, ...Array.from({ length: 14 }, (_, i) => h('span', { style: `--i: ${i}` })))),
      h('p', { class: 'forja-texto' }, T.curaTexto),
      h('p', { class: 'forja-numeros' }, h('span', {}, 'PV '), numPv, h('span', { class: 'forja-sep' }, ' · '), h('span', {}, 'PM '), numPm),
      seguir4);
    audio.sfx('coracao-mais');
    const passos = animacoesReduzidas() ? 1 : 24;
    for (let i = 1; i <= passos; i++) {
      await esperar(passos === 1 ? 0 : 55);
      const k = i / passos;
      numPv.textContent = `${Math.round(pvAntes + (pvNovo - pvAntes) * k)}/${Math.round(pvMaxAntes + (pvNovo - pvMaxAntes) * k)}`;
      numPm.textContent = `${Math.round(pmNovo * k)}`;
    }
    marcarFlag('forjado');
    atualizarCampanha({ pvAtual: pvNovo });
    seguir4.disabled = false;
    seguir4.focus({ preventScroll: true });
    await clique(seguir4);

    // 5. Revelação: "Erga-se, {Classe} de {Divindade}", com o busto do herói determinado.
    etapaForja = 'revelacao';
    const nomeClasse = classe ? nomeDaClasse(classe, p.genero) : '';
    const fim = botao(textos.cenas.continuar, () => {}, { classe: 'btn-principal' });
    const busto = h('img', { class: 'forja-busto', alt: p.nome, src: src(ASSETS.bustoHeroi(p.raca, p.genero, 'determinado')) }) as HTMLImageElement;
    busto.dataset.expressao = 'determinado';
    busto.onerror = () => { busto.onerror = null; busto.src = src(ASSETS.bustoHeroi(p.raca, p.genero)); busto.dataset.expressao = 'normal'; };
    tela('forja-revelacao',
      busto,
      h('h1', { class: 'forja-erga' }, T.ergaSe.replace('{classe}', nomeClasse).replace('{divindade}', d.nome)),
      fim);
    audio.sfx('start');
    // O que é liberado: o Caderno (anotação e perguntas respondidas) e o Compêndio (o nome de cada voz).
    verificarCaderno();
    await clique(fim);
    etapaForja = null;
    void irPara('fimCapitulo', undefined, { duracao: 1200 });
  }

  const corDe = (id: string) => MAPA.estatuas.find((e) => e.id === id)?.cor ?? '#ffd25a';

  /* ------------------------------------------------------------ entrada */

  function interagir() {
    if (!motor || ocupado) return;
    const id = motor.proximo();
    if (id && DEUSES.includes(id)) void ouvirEstatua(id);
  }

  function abrirPausa() {
    if (fecharPausa || ocupado) return;
    motor?.pausar(true);
    controles?.habilitar(false);
    fecharPausa = abrirMenuPausa({
      aoFechar: () => { fecharPausa = null; motor?.pausar(false); if (!ocupado) controles?.habilitar(true); },
      // Opção acessível: a mesma escolha, numa lista.
      ajuda: !getEstado().campanha.divindade && feito('vozes') ? { rotulo: T.escolherLista, abrir: escolherEmLista } : undefined,
    });
  }

  registrarGanchos({
    avancar: () => palco?.tocar(),
    // Teleporta para perto e caminha até o ponto (os gatilhos só disparam andando).
    andarAte: (x: number, y: number) => { if (!motor) return; motor.teleportar(x, Math.min(y + 110, 1180)); void motor.caminharAte(x, y); },
    interagir: () => interagir(),
    escolherLista: () => escolherEmLista(),
    state: () => ({
      ...estadoProgresso(),
      tela: 'salao',
      cena: cenaAberta,
      digitando: palco?.digitando() ?? false,
      escolhas: palco?.escolhasVisiveis() ?? [],
      ocupado,
      pronto,
      heroi: motor?.posicao() ?? null,
      proximo: motor?.proximo() ?? null,
      baloes: [...baloes.querySelectorAll<HTMLElement>('.salao-balao')].map((b) => {
        const r = b.getBoundingClientRect();
        return { deus: b.dataset.deus, texto: b.textContent, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }),
      estatuasTela: motor ? Object.fromEntries(MAPA.estatuas.map((e) => { const q = naTela(e.foco.x, e.foco.y); return [e.id, { x: Math.round(q.x), y: Math.round(q.y) }]; })) : null,
      coluna: efeitos?.estado() ?? null,
      forja: etapaForja,
      pvMaxForja: classe ? pvPrimeiroNivel(classe, p.atributosFinais) : null,
      pmMaxForja: classe ? pmPrimeiroNivel(classe, p.atributosFinais, p.raca) : null,
    }),
  });

  return {
    el,
    aoEntrar() {
      void (async () => {
        const sons = audio.carregarEfeitos([...SFX_ATO1]);
        await garantirEtapa('a1salao', el);
        await sons;
        if (saiu) return;
        const pac = await importar(() => import('../exploracao/pacote'));
        const { Controles } = await importar(() => import('../exploracao/controles'));
        controles = new Controles({ raiz: el, toque: ehToque(), rotuloInteragir: textos.cenas.continuar, rotuloPausa: textos.cenas.pausa, aoInteragir: interagir, aoPausar: abrirPausa });
        controles.habilitar(false);
        const l = getEstado().campanha.local;
        const ini = !comecoDaParte && l.tela === 'mapa' && l.mapa === MAPA.id && l.x !== undefined ? { x: l.x, y: l.y ?? MAPA.inicio.y } : MAPA.inicio;
        motor = await pac.criarMotor({
          container: jogoEl,
          mapa: MAPA,
          blocos: blocosDoChao(MAPA).map((b) => ({ ...b, url: src(b.imagem) })),
          heroi: { raca: p.raca, genero: p.genero, spriteUrl: urlAsset(ASSETS.spriteChibi(p.raca, p.genero)) },
          entrada: () => controles?.vetor() ?? { x: 0, y: 0 },
          debugPermitido: import.meta.env.DEV,
          debugInicial: false,
          inicio: { ...ini, direcao: 'cima' },
          aoProximidade: (id) => controles?.mostrarInteracao(!!id && !ocupado && feito('vozes') && !getEstado().campanha.divindade),
          aoEntrarGatilho: (id) => { if (id === 'pedestal') void seteVozes(); },
          aoPasso: () => audio.sfx('step-marble', { taxa: 0.85 + Math.random() * 0.3, ganho: 0.45 }),
          aoCriar: (m) => { efeitos = new EfeitosSalao(m, pac.Phaser, MAPA.estatuas, MAPA.pontos!.pedestal, animacoesReduzidas()); },
        });
        if (saiu) { motor.destruir(); return; }
        motor.bloquear(true);
        if (comecoDaParte) {
          audio.pararMusica(600);
          await cartaoParte(1, 6);
          if (saiu) return;
          atualizarCampanha({ cena: null, local: { tela: 'mapa', mapa: MAPA.id } });
        }
        // Ao entrar, um silêncio de 1 s antes da música.
        window.setTimeout(() => { if (!saiu) audio.tocarMusica(ASSETS.musica(MAPA.musica), 2500); }, 1000);
        if (!feito('entrada')) {
          marcar('entrada');
          await falar('f-entrada');
        }
        if (getEstado().campanha.divindade) {
          efeitos?.seguir(getEstado().campanha.divindade!);
          pronto = true;
          return void forja();
        }
        motor.bloquear(false);
        controles.habilitar(true);
        pronto = true;
      })();
    },
    aoSair() {
      saiu = true;
      palco?.destruir();
      fecharPausa?.();
      controles?.destruir();
      efeitos?.destruir();
      motor?.destruir();
      motor = null;
      efeitos = null;
      document.querySelectorAll('.modal-fundo').forEach((m) => m.remove());
    },
  };
}

/** As frases próprias de cada deus, ditas ao escolher a estátua (as mesmas das cenas f-voz-*). */
const PALAVRAS: Record<string, string> = {
  solem: 'Onde houver escuridão, leve a luz. Mesmo quando ela queimar suas mãos.',
  justar: 'Toda escolha tem peso. Eu ensino a carregá-lo sem cair.',
  ardor: 'Nenhuma corrente é forte o bastante para quem decide ser livre.',
  expiria: 'Eu guardo o último suspiro de todos. Proteja os que ainda não devem partir.',
  eternus: 'Todo fim é um recomeço. Eu vejo o caminho que você ainda não vê.',
  mentis: 'O tempo ensina a quem tem paciência. Pense antes, e vença depois.',
  irae: 'Sua fúria não é fraqueza. Deixe-a ser a tempestade que protege.',
};

/* ------------------------------------------------------------ efeitos do Salão (Phaser) */

type PhaserNS = typeof import('phaser');

/**
 * A luz mágica do pedestal (por código; não há abertura no teto): uma coluna de luz dourada que sobe do
 * pedestal e se perde no escuro, com faíscas e runas subindo devagar; os veios dourados do chão brilham
 * de leve. As estátuas acendem na cor do deus; ao seguir uma voz, a coluna toma a cor dela e as outras
 * estátuas apagam devagar.
 */
class EfeitosSalao {
  private coluna: Phaser.GameObjects.Image;
  private base: Phaser.GameObjects.Image;
  private veu: Phaser.GameObjects.Rectangle;
  private brilhos = new Map<string, Phaser.GameObjects.Image>();
  private timer: Phaser.Time.TimerEvent | null = null;
  private cor = 0xffd25a;
  private escolhido: string | null = null;

  constructor(private m: Motor, Ph: PhaserNS, private estatuas: Estatua[], pedestal: { x: number; y: number }, private reduzidas: boolean) {
    const cena = m.cena;
    const PROF_ALTO = 300_000;
    if (!cena.textures.exists('salao-coluna')) {
      const c = cena.textures.createCanvas('salao-coluna', 64, 512)!;
      const ctx = c.getContext();
      const g = ctx.createLinearGradient(0, 512, 0, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 512);
      // Bordas suaves.
      const lados = ctx.createLinearGradient(0, 0, 64, 0);
      lados.addColorStop(0, 'rgba(0,0,0,1)');
      lados.addColorStop(0.3, 'rgba(0,0,0,0)');
      lados.addColorStop(0.7, 'rgba(0,0,0,0)');
      lados.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = lados;
      ctx.fillRect(0, 0, 64, 512);
      c.refresh();
    }
    if (!cena.textures.exists('salao-halo')) {
      const c = cena.textures.createCanvas('salao-halo', 128, 128)!;
      const ctx = c.getContext();
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.3)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      c.refresh();
    }
    this.veu = cena.add.rectangle(0, 0, 1254, 1254, 0x000000, 0).setOrigin(0, 0).setDepth(PROF_ALTO - 2);
    this.base = cena.add.image(pedestal.x, pedestal.y + 20, 'salao-halo').setBlendMode(Ph.BlendModes.ADD).setDisplaySize(420, 220).setTint(this.cor).setAlpha(0.55).setDepth(PROF_ALTO);
    this.coluna = cena.add.image(pedestal.x, pedestal.y + 10, 'salao-coluna').setOrigin(0.5, 1).setBlendMode(Ph.BlendModes.ADD)
      .setDisplaySize(150, 720).setTint(this.cor).setAlpha(0.8).setDepth(PROF_ALTO + 1);
    for (const e of estatuas) {
      this.brilhos.set(e.id, cena.add.image(e.foco.x, e.foco.y, 'salao-halo').setBlendMode(Ph.BlendModes.ADD)
        .setDisplaySize(300, 360).setTint(Number.parseInt(e.cor.slice(1), 16)).setAlpha(0).setDepth(PROF_ALTO - 1));
    }
    if (!reduzidas) {
      cena.tweens.add({ targets: this.coluna, alpha: { from: 0.65, to: 0.9 }, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      cena.tweens.add({ targets: this.base, alpha: { from: 0.4, to: 0.7 }, duration: 3100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      // Faíscas e pequenas runas subindo devagar.
      const runas = ['ᚱ', 'ᛟ', 'ᚨ', 'ᛉ', 'ᛞ', 'ᛊ', 'ᚦ'];
      this.timer = cena.time.addEvent({
        delay: 260, loop: true, callback: () => {
          const runa = Math.random() < 0.25;
          const x = pedestal.x + (Math.random() * 2 - 1) * 48;
          const o = runa
            ? cena.add.text(x, pedestal.y - 10, runas[Math.floor(Math.random() * runas.length)], { fontFamily: 'serif', fontSize: '22px', color: '#fff3c4' }).setOrigin(0.5)
            : cena.add.image(x, pedestal.y - 10, 'salao-halo').setDisplaySize(10, 10);
          o.setDepth(PROF_ALTO + 2).setAlpha(0.9);
          if ('setBlendMode' in o) (o as Phaser.GameObjects.Image).setBlendMode(Ph.BlendModes.ADD);
          if ('setTint' in o) (o as Phaser.GameObjects.Image).setTint(this.cor);
          cena.tweens.add({ targets: o, y: pedestal.y - 420 - Math.random() * 160, x: x + (Math.random() * 2 - 1) * 30, alpha: 0, duration: 3200 + Math.random() * 1600, onComplete: () => o.destroy() });
        },
      });
    }
  }

  acenderTodas(sim: boolean) {
    for (const [, b] of this.brilhos) this.m.cena.tweens.add({ targets: b, alpha: sim ? 0.55 : 0, duration: 400 });
  }

  /** Uma estátua acende na cor do deus e as outras escurecem um pouco (null: tudo volta). */
  destacar(id: string | null) {
    this.m.cena.tweens.add({ targets: this.veu, fillAlpha: id ? 0.25 : 0, duration: 400 });
    for (const [k, b] of this.brilhos) this.m.cena.tweens.add({ targets: b, alpha: k === id ? 0.8 : 0, duration: 400 });
  }

  /** Seguiu a voz: a estátua acende de vez, as outras apagam devagar e a coluna toma a cor do deus. */
  seguir(id: string) {
    this.escolhido = id;
    const e = this.estatuas.find((x) => x.id === id);
    this.cor = e ? Number.parseInt(e.cor.slice(1), 16) : this.cor;
    this.coluna.setTint(this.cor);
    this.base.setTint(this.cor);
    this.m.cena.tweens.add({ targets: this.veu, fillAlpha: 0.5, duration: this.reduzidas ? 10 : 1800 });
    for (const [k, b] of this.brilhos) this.m.cena.tweens.add({ targets: b, alpha: k === id ? 1 : 0, duration: this.reduzidas ? 10 : 1800 });
  }

  estado() {
    return { cor: `#${this.cor.toString(16).padStart(6, '0')}`, escolhido: this.escolhido, visivel: this.coluna.visible && this.coluna.alpha > 0.3 };
  }

  destruir() { this.timer?.remove(); }
}
