import { verificarCaderno } from '../core/caderno';
import { etapaDoCapitulo, garantirEtapa } from '../core/etapas';
import { SFX_CAPITULO, SFX_FASE4 } from '../core/assets';
import { audio } from '../core/audio';
import { atualizarCampanha, getEstado, marcarFlag } from '../core/estado';
import { estadoProgresso, registrarGanchos } from '../core/ganchos';
import { pvAntesDaForjaDe } from '../core/pericias';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { botaoMenu, esperar, h } from '../core/ui';
import { CAPITULOS, cenaPorId, type Capitulo } from '../narrativa/capitulo';
import { aplicarEfeitos, criarPalco, tocarMusicaDaCena } from '../narrativa/palco';
import { abrirMenuPausa } from './pausa';

/**
 * Tela de capítulo: cartão de título e o palco de cena (fundo ilustrado, falas, escolhas, testes) em
 * tela cheia. As conversas da exploração usam o mesmo palco por cima do mapa (tela de mapa).
 */

export { aplicarEfeitos, tocarMusicaDaCena };

const T = textos.cenas;

export interface ParamsCapitulo {
  /** Vai direto para esta cena (volta de batalha, saída de um mapa…). */
  cena?: string;
}

export function telaCapitulo(params?: unknown): Tela {
  const prm = (params ?? {}) as ParamsCapitulo;
  const estado = getEstado();
  const p = estado.personagem;
  const cap: Capitulo = CAPITULOS[estado.campanha.capitulo] ?? CAPITULOS[1];

  let saiu = false;
  let fecharPausa: (() => void) | null = null;

  const palco = criarPalco({
    aoBatalha: (d) => {
      marcarFlag('lutou');
      atualizarCampanha({ cenaAntesDaBatalha: d.cenaOrigem });
      void irPara('batalha', { batalha: d.batalha, vitoria: d.vitoria, derrota: d.derrota, retorno: 'capitulo' });
    },
    aoFim: () => void irPara('fimCapitulo', undefined, { duracao: 900 }),
    aoMapa: (m) => void irPara('mapa', { mapa: m.mapa, x: m.x, y: m.y }),
    aoEntrarCena: (c, modo) => atualizarCampanha({ cena: c.id, modo, local: { tela: 'capitulo' } }),
  });
  const cartao = h('div', { class: 'cena-cartao-titulo', hidden: true },
    h('p', { class: 'cartao-capitulo' }, `${T.capitulo} ${String(cap.numero).padStart(2, '0')}`),
    h('h1', { class: 'cartao-titulo' }, cap.titulo));
  const btnPausa = botaoMenu('cena-btn-pausa');
  const el = h('div', { class: 'tela-capitulo' }, palco.el, btnPausa, cartao);

  const abrirPausa = () => {
    if (fecharPausa) return;
    fecharPausa = abrirMenuPausa({ aoFechar: () => { fecharPausa = null; } });
  };
  btnPausa.addEventListener('click', (e) => { e.stopPropagation(); abrirPausa(); });
  const teclado = (e: KeyboardEvent) => {
    if (fecharPausa || document.querySelector('.modal-fundo, .rolagem-fundo, .compendio-fundo')) return;
    if (e.key === 'Escape') { e.preventDefault(); return abrirPausa(); }
    // Espaço e Enter: o próprio palco (avança, completa e escolhe; ver narrativa/palco.ts).
  };
  window.addEventListener('keydown', teclado);

  async function cartaoDeTitulo() {
    cartao.hidden = false;
    requestAnimationFrame(() => cartao.classList.add('visivel'));
    await esperar(3000);
    cartao.classList.remove('visivel');
    await esperar(700);
    cartao.hidden = true;
  }

  registrarGanchos({
    goto: (id: string) => void palco.entrar(id, 'falas'),
    avancar: () => palco.tocar(),
    state: () => ({
      ...estadoProgresso(),
      tela: 'capitulo',
      cena: palco.cenaAtual()?.id ?? null,
      modo: getEstado().campanha.modo,
      pvMax: p ? pvAntesDaForjaDe(p) : null,
      bonusProximoTeste: getEstado().campanha.bonusProximoTeste,
      caminho: getEstado().campanha.caminho,
      digitando: palco.digitando(),
      escolhas: palco.escolhasVisiveis(),
      fundo: palco.fundo(),
    }),
  });

  return {
    el,
    aoEntrar() {
      void audio.carregarEfeitos([...SFX_CAPITULO, ...SFX_FASE4]);
      void (async () => {
        // Cenas, bustos, mapas e batalhas do capítulo em memória antes da primeira cena.
        await garantirEtapa(etapaDoCapitulo(), el);
        if (saiu) return;
        // Caderno de estudos: saves antigos e jogo novo começam coerentes (sem aviso do que já existe).
        verificarCaderno();
        const c = getEstado().campanha;
        if (prm.cena) return palco.entrar(prm.cena, 'falas');
        if (!c.cena || c.cena === 'inicio') {
          if (p && c.pvAtual === null) atualizarCampanha({ pvAtual: pvAntesDaForjaDe(p) });
          tocarMusicaDaCena(cenaPorId(cap, cap.inicio).musica, 2500);
          await cartaoDeTitulo();
          if (saiu) return;
          return palco.entrar(cap.inicio, 'falas');
        }
        return palco.entrar(c.cena, c.modo);
      })();
    },
    aoSair() {
      saiu = true;
      palco.destruir();
      window.removeEventListener('keydown', teclado);
      document.querySelectorAll('.modal-fundo, .compendio-fundo').forEach((m) => m.remove());
    },
  };
}
