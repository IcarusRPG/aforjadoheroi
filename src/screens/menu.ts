import { botaoTelaCheia, dicaIphone } from '../core/telaCheia';
import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { atualizarConfig, carregarSlot, getEstado, temSave } from '../core/estado';
import { lerSlot, maisRecente, temAlgumSave, type IdSlot } from '../core/saves';
import { irPara, type Tela } from '../core/telas';
import { telaDaCampanha } from './fimCapitulo';
import { ehToque, fmt, textos } from '../core/textos';
import { botao, confirmar, h } from '../core/ui';
import { abrirCreditos } from './creditos';
import { abrirOpcoes } from './opcoes';
import { abrirCompendio } from './compendio';
import { ATOS } from '../narrativa/capitulo';
import { abrirCarregar, abrirCopia, nomeCapitulo, resumoContinuar } from './saves';
import { tutorialRespondido } from '../core/tutorial';
import { perguntarTutorial } from './tutorial';

/** Retoma o jogo que está em memória (recém-carregado de um slot) no ponto em que foi salvo. */
/** A dica do iPhone aparece no menu inicial uma única vez (depois, só em Opções). */
function dicaIphoneUmaVez(): HTMLElement | null {
  if (getEstado().config.dicaIphoneVista) return null;
  const d = dicaIphone('menu-dica-iphone');
  if (!d) return null;
  atualizarConfig({ dicaIphoneVista: true });
  const fechar = h('button', { type: 'button', class: 'menu-dica-fechar', 'aria-label': 'Fechar a dica' }, '×');
  fechar.addEventListener('click', () => d.remove());
  d.append(fechar);
  return d;
}

export function retomarJogo(): void {
  const p = getEstado().personagem;
  // Heróis salvos antes da escolha de classe retomam a criação no passo Classe.
  if (p && !p.classe) void irPara('criacao', { retomar: p });
  // Herói pronto que ainda não terminou o sonho dos deuses: retoma no sonho.
  else if (p && !getEstado().sonho.concluido) void irPara('sonho');
  // Prólogo ou ato em andamento: retoma na última cena, no mapa ou na fase lateral, na posição salva.
  else if (ATOS[getEstado().campanha.ato]) void irPara(telaDaCampanha());
  else void irPara('emBreve');
}

function carregarERetomar(slot: IdSlot): void {
  if (carregarSlot(slot)) retomarJogo();
}

/**
 * Novo jogo: com um save automático, avisa antes que ele será substituído (os manuais ficam). O
 * automático só muda no primeiro autosave da aventura nova, no fim da criação do herói.
 */
async function novoJogo(): Promise<void> {
  const auto = lerSlot('auto');
  if (auto.estado === 'ok') {
    const A = textos.menu.avisoNovoJogo;
    const m = auto.meta;
    const sim = await confirmar({
      texto: h('div', {},
        h('h2', { class: 'modal-titulo' }, A.titulo),
        h('p', {}, A.manuais),
        h('p', {}, fmt(A.auto, m.genero, { nome: m.nomeHeroi, capitulo: nomeCapitulo(m) }))),
      ok: A.comecar, cancelar: A.voltar, classe: 'aviso-novo-jogo',
    });
    if (!sim) return;
  }
  // Primeira vez em Icarus? Perguntado só uma vez (vale para todas as aventuras).
  if (!tutorialRespondido()) await perguntarTutorial();
  void irPara('criacao');
}

export function telaMenu(): Tela {
  const t = textos.menu;
  const recente = maisRecente();
  const continuar = recente
    ? botao(t.continuar, () => carregarERetomar(recente.slot), { classe: 'btn-principal btn-continuar', som: 'ui-confirm' })
    : null;
  if (continuar && recente) continuar.append(h('span', { class: 'menu-continuar-info' }, resumoContinuar(recente.meta)));
  const botoes = h('nav', { class: 'menu-botoes', 'aria-label': 'Menu principal' },
    continuar,
    temAlgumSave() ? botao(t.carregar, () => abrirCarregar(carregarERetomar), { classe: 'btn-carregar' }) : null,
    botao(t.novoJogo, () => void novoJogo(), { classe: recente ? 'btn-novo-jogo' : 'btn-principal btn-novo-jogo', som: 'ui-confirm' }),
    // O Compêndio usa o save mais recente (que é o que está em memória ao abrir o jogo).
    temSave() ? botao(t.compendio, () => abrirCompendio()) : null,
    botao(t.opcoes, abrirOpcoes),
    botao(t.creditos, () => abrirCreditos()),
  );
  // Navegador limpo (aparelho novo): sem saves, o Carregar não aparece; a cópia de segurança fica
  // num link discreto para importar os saves de outro aparelho.
  if (!temAlgumSave()) {
    const importar = h('button', { type: 'button', class: 'saves-link menu-importar' }, textos.saves.importar);
    importar.addEventListener('click', () => abrirCopia(() => void irPara('menu', undefined, { duracao: 200 })));
    botoes.append(importar);
  }

  const el = h('div', { class: 'tela-menu' },
    h('img', { class: 'menu-wallpaper', src: src(ASSETS.wallpaperMenu), alt: '', draggable: 'false' }),
    h('div', { class: 'menu-sombra' }),
    h('div', { class: 'menu-conteudo' },
      h('div', { class: 'menu-logos' },
        h('img', { class: 'menu-logo-icarus', src: src(ASSETS.logoIcarus), alt: 'Icarus', draggable: 'false' }),
        h('img', { class: 'menu-logo-forja', src: src(ASSETS.logoForja), alt: 'A Forja do Herói', draggable: 'false' }),
      ),
      botoes,
    ),
    h('div', { class: 'menu-versao' }, t.versao),
    // Fase 5: tela cheia (Android e desktop); no iPhone, a dica de "Adicionar à Tela de Início" (uma vez só),
    // no topo, sobre o logo: nunca por cima de um botão.
    botaoTelaCheia('menu-tela-cheia'),
    dicaIphoneUmaVez(),
  );

  return {
    el,
    aoEntrar() {
      audio.tocarMusica(ASSETS.musicaMenu, 2000);
      requestAnimationFrame(() => el.classList.add('entrou'));
      // Foco no primeiro botão para quem usa teclado, sem mostrar o anel de foco no mouse.
      if (!ehToque()) setTimeout(() => (botoes.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true }), 1500);
    },
  };
}
