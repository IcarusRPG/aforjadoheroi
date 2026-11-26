import { dadosDeus } from '../narrativa/capitulo';
import { abrirCaderno } from './caderno';
import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { getEstado } from '../core/estado';
import {
  COMPENDIO_DADOS, marcarCompendioVisto, nivelRelacao, nomeNivel, paragrafosLiberados, relacao, type FichaBestiario, type FichaPersonagem, type IdNivel,
} from '../core/progresso';
import { textos } from '../core/textos';
import { h } from '../core/ui';

/**
 * Compêndio: três abas (Personagens, Bestiário, Vozes). Fichas não liberadas aparecem como silhueta
 * com "???". No celular, abas no topo, lista rolável e a ficha em tela cheia com Voltar de 44 px.
 */

const T = () => textos.compendio;

/** Corações do nível de relação, desenhados em SVG. */
export function coracoes(nivel: IdNivel): HTMLElement {
  const cheio = (cor: string) => `<path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.3 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.7 0 5.8 3.8 4.2 7.3C19.5 16.4 12 21 12 21z" fill="${cor}" stroke="#2a1a10" stroke-width="1.2"/>`;
  const vazio = '<path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.3 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.7 0 5.8 3.8 4.2 7.3C19.5 16.4 12 21 12 21z" fill="none" stroke="#b9ae9c" stroke-width="1.6"/>';
  const partido = `${cheio('#c23a2e')}<path d="M12 7.7 10 11l3 2-2 3.5" fill="none" stroke="#1a0f0a" stroke-width="1.6"/>`;
  const svg = (inner: string) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${inner}</svg>`;
  const desenhos: Record<IdNivel, string[]> = {
    ressentido: [partido], frio: [cheio('#8d8a86')], neutro: [vazio],
    simpatico: [cheio('#e0566a')], amigo: [cheio('#e0566a'), cheio('#e0566a')], leal: [cheio('#f2c14e'), cheio('#f2c14e'), cheio('#f2c14e')],
  };
  const el = h('span', { class: `coracoes nivel-${nivel}`, title: nomeNivel(nivel) });
  el.innerHTML = desenhos[nivel].map(svg).join('');
  return el;
}

function seloRelacao(id: string): HTMLElement {
  const nivel = nivelRelacao(relacao(id));
  return h('span', { class: 'selo-relacao' }, coracoes(nivel), h('span', { class: 'nivel-nome' }, nomeNivel(nivel)));
}

export function abrirCompendio(aba: 'personagens' | 'bestiario' | 'vozes' = 'personagens'): void {
  audio.sfx('compendio');
  marcarCompendioVisto();
  const lista = h('div', { class: 'compendio-lista', role: 'list' });
  const ficha = h('section', { class: 'compendio-ficha', hidden: true, 'aria-live': 'polite' });
  const abas = h('div', { class: 'compendio-abas', role: 'tablist' });
  const fechar = h('button', { type: 'button', class: 'btn btn-discreto compendio-fechar' }, textos.cenas.fechar);
  const caixa = h('div', { class: 'compendio', role: 'dialog', 'aria-modal': 'true', 'aria-label': T().titulo },
    h('header', { class: 'compendio-topo' }, h('h2', {}, T().titulo), fechar), abas, lista, ficha);
  const fundo = h('div', { class: 'compendio-fundo' }, caixa);

  const sair = () => {
    fundo.classList.add('saindo');
    window.removeEventListener('keydown', tecla);
    setTimeout(() => fundo.remove(), 200);
  };
  const tecla = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (!ficha.hidden) voltarDaFicha(); else sair();
  };
  fechar.addEventListener('click', () => { audio.sfx('ui-back'); sair(); });
  window.addEventListener('keydown', tecla);

  const voltarDaFicha = () => { ficha.hidden = true; lista.hidden = false; caixa.classList.remove('com-ficha'); };
  const abrirFicha = (conteudo: Node[]) => {
    audio.sfx('compendio');
    const voltar = h('button', { type: 'button', class: 'btn btn-discreto compendio-voltar' }, `‹ ${T().voltar}`);
    voltar.addEventListener('click', () => voltarDaFicha());
    ficha.replaceChildren(voltar, ...conteudo);
    ficha.hidden = false;
    lista.hidden = true;
    caixa.classList.add('com-ficha');
    voltar.focus({ preventScroll: true });
  };

  const item = (titulo: string, sub: string, img: Node, bloqueado: boolean, aoAbrir?: () => void) => {
    const b = h('button', { type: 'button', class: `compendio-item${bloqueado ? ' bloqueado' : ''}`, role: 'listitem', disabled: bloqueado },
      img, h('span', { class: 'ci-texto' }, h('span', { class: 'ci-nome' }, titulo), h('span', { class: 'ci-sub' }, sub)));
    if (aoAbrir) b.addEventListener('click', aoAbrir);
    return b;
  };
  const silhueta = () => h('span', { class: 'ci-img silhueta', 'aria-hidden': 'true' }, '?');

  function personagens() {
    lista.replaceChildren(...COMPENDIO_DADOS.personagens.map((f: FichaPersonagem) => {
      const lib = paragrafosLiberados(f);
      if (!lib) return item(T().desconhecido, '', silhueta(), true);
      const img = h('img', { class: 'ci-img', src: src(ASSETS.retratoNpc(f.id)), alt: '', draggable: 'false' });
      const b = item(f.nome, f.papel, img, false, () => abrirFicha([
        h('img', { class: 'ficha-busto', src: src(ASSETS.retratoNpc(f.id)), 'data-retrato': ASSETS.retratoNpc(f.id), alt: f.nome, draggable: 'false' }),
        h('h3', { class: 'ficha-nome' }, f.nome),
        h('p', { class: 'ficha-meta' }, `${f.raca} · ${f.papel}`),
        seloRelacao(f.id),
        ...lib.map((t) => (t ? h('p', { class: 'ficha-paragrafo' }, t) : h('p', { class: 'ficha-paragrafo bloqueado' }, T().desconhecido))),
      ]));
      b.dataset.ficha = f.id;
      b.append(seloRelacao(f.id));
      return b;
    }));
  }

  function bestiario() {
    const vistos = getEstado().campanha.compendio.bestiario;
    lista.replaceChildren(...COMPENDIO_DADOS.bestiario.map((b: FichaBestiario) => {
      const v = vistos[b.id];
      if (!v) return item(T().desconhecido, '', silhueta(), true);
      const imagem = () => b.imagem.tipo === 'ilustracao'
        ? h('img', { class: 'ci-img', src: src(ASSETS.ameaca(b.imagem.id)), alt: '', draggable: 'false' })
        : spriteParado(b.imagem.id);
      const el = item(b.nome, b.tipo, imagem(), false, () => abrirFicha([
        b.imagem.tipo === 'ilustracao'
          ? h('img', { class: 'ficha-busto', src: src(ASSETS.ameaca(b.imagem.id)), alt: b.nome, draggable: 'false' })
          : spriteParado(b.imagem.id, 'ficha-sprite'),
        h('h3', { class: 'ficha-nome' }, b.nome),
        h('p', { class: 'ficha-meta' }, b.tipo),
        h('p', { class: 'ficha-paragrafo' }, b.texto),
        h('h4', { class: 'ficha-subtitulo' }, T().oQueSabe),
        h('p', { class: `ficha-paragrafo${v.sabe ? '' : ' bloqueado'}` }, v.sabe ? b.sabe : T().desconhecido),
      ]));
      el.dataset.ficha = b.id;
      return el;
    }));
  }

  function vozes() {
    const ouvidas = getEstado().sonho.ouvidas;
    // Depois da Forja (Ato I, Parte 6), cada frase ganha o nome do seu deus.
    const forjou = getEstado().campanha.flags.includes('escolheu_voz');
    const V = textos.sonho.vozes as Record<string, { titulo: string; mensagem: string }>;
    const itens = COMPENDIO_DADOS.vozes.map((v) => ouvidas.includes(v.id)
      ? h('div', { class: 'compendio-voz', role: 'listitem', 'data-voz': v.id },
          h('p', { class: 'voz-titulo' }, V[v.id]?.titulo ?? ''),
          h('p', { class: 'voz-frase' }, `“${V[v.id]?.mensagem ?? ''}”`),
          h('p', { class: 'voz-nome' }, v.nomeDivindade ?? (forjou ? dadosDeus(v.id)?.nome ?? T().nomeNaForja : T().nomeNaForja)))
      : h('div', { class: 'compendio-voz bloqueado', role: 'listitem' }, h('p', { class: 'voz-titulo' }, T().desconhecido)));
    // O Compêndio é o registro objetivo; o que o herói estudou sobre os deuses fica no caderno.
    const link = getEstado().personagem
      ? h('button', { type: 'button', class: 'compendio-link-caderno' }, textos.caderno.verDeuses)
      : null;
    link?.addEventListener('click', () => void abrirCaderno({ aba: 'deuses' }));
    lista.replaceChildren(...itens, ...(link ? [h('div', { class: 'compendio-rodape', role: 'listitem' }, link)] : []));
  }

  const ABAS = { personagens: [T().personagens, personagens], bestiario: [T().bestiario, bestiario], vozes: [T().vozes, vozes] } as const;
  const mostrar = (id: keyof typeof ABAS) => {
    voltarDaFicha();
    for (const b of abas.children) b.setAttribute('aria-selected', String((b as HTMLElement).dataset.aba === id));
    ABAS[id][1]();
    lista.scrollTop = 0;
  };
  for (const [id, [rotulo]] of Object.entries(ABAS)) {
    const b = h('button', { type: 'button', class: 'compendio-aba', role: 'tab', 'data-aba': id }, rotulo);
    b.addEventListener('click', () => { audio.sfx('ui-click'); mostrar(id as keyof typeof ABAS); });
    abas.append(b);
  }
  document.body.append(fundo);
  mostrar(aba);
  (abas.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus({ preventScroll: true });
}

/** Quadro "parado" de uma folha de batalha, ampliado sem suavização (Bestiário). */
function spriteParado(id: string, classe = 'ci-img'): HTMLElement {
  const el = h('span', { class: `${classe} sprite-bestiario`, role: 'img', 'aria-label': id });
  void fetch(src(`${ASSETS.spriteBatalhaInimigo(id)}.json`)).then((r) => r.json()).then((meta: { quadro: { largura: number; altura: number } }) => {
    const k = classe === 'ci-img' ? 1 : 3;
    Object.assign(el.style, {
      width: `${meta.quadro.largura * k}px`,
      height: `${meta.quadro.altura * k}px`,
      backgroundImage: `url("${src(`${ASSETS.spriteBatalhaInimigo(id)}.png`)}")`,
      backgroundSize: `${meta.quadro.largura * 6 * k}px ${meta.quadro.altura * k}px`,
      backgroundPosition: '0 0',
    });
  }).catch(() => {});
  return el;
}
