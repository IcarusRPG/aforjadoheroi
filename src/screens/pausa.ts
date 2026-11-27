import { botaoTelaCheia } from '../core/telaCheia';
import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { getEstado } from '../core/estado';
import { ITENS_DEF, comerPao, pvAtual, pvMaxAtual, qtdItem, usarItemCura } from '../core/progresso';
import { irPara } from '../core/telas';
import { textos } from '../core/textos';
import { abrirModal, botao, h } from '../core/ui';
import { ATOS, nomeAto, resumoDoDiario } from '../narrativa/capitulo';
import { classePorId, nomeDaClasse } from '../core/classes';
import { racaPorId } from '../core/regras';
import { fmt } from '../core/textos';
import { abrirCompendio } from './compendio';
import { abrirCaderno } from './caderno';
import { cadernoTemNovidade } from '../core/caderno';
import { abrirOpcoes } from './opcoes';
import { abrirSalvar } from './saves';

/**
 * Menu de pausa compartilhado (cenas e mapas): Continuar · Itens · Compêndio · Diário · Opções ·
 * Voltar ao menu. O botão do Compêndio ganha um ponto dourado quando há novidade.
 */
/** Topo do menu de pausa: busto pequeno do herói, nome, raça, classe e PV. */
function cabecalhoHeroi(): HTMLElement | null {
  const p = getEstado().personagem;
  if (!p) return null;
  const classe = classePorId(p.classe);
  const linha = fmt(textos.cenas.pausaHeroi, p.genero, {
    raca: racaPorId(p.raca)?.nome ?? p.raca, classe: classe ? nomeDaClasse(classe, p.genero) : '', pv: pvAtual(), pvMax: pvMaxAtual(),
  });
  return h('div', { class: 'pausa-heroi' },
    h('img', { class: 'pausa-busto', src: src(ASSETS.bustoHeroi(p.raca, p.genero)), 'data-retrato': ASSETS.bustoHeroi(p.raca, p.genero), alt: '', draggable: 'false' }),
    h('div', {}, h('p', { class: 'pausa-nome' }, p.nome), h('p', { class: 'pausa-linha' }, linha)));
}

/**
 * `emBatalha`: o Salvar aparece desabilitado (com a dica) e os Itens ficam no comando Item da batalha.
 */
export function abrirMenuPausa(o: {
  aoFechar?: () => void; aoMudarPv?: (recuperou: number) => void; emBatalha?: boolean;
  /** Só nos mapas: "Destravar personagem" (leva o herói ao ponto seguro mais próximo). */
  destravar?: () => void;
  /** Só no mapa de Füllmun: "Ajuda: tarefas de Füllmun". */
  ajuda?: { rotulo: string; abrir: () => void };
} = {}): () => void {
  audio.sfx('ui-click');
  let fecharModal = () => {};
  const fechar = () => fecharModal();
  const novidade = getEstado().campanha.compendio.novidade;
  const btnCompendio = botao(textos.compendio.titulo, () => abrirCompendio());
  if (novidade) btnCompendio.append(h('span', { class: 'ponto-novidade', 'aria-label': 'novidade' }));
  btnCompendio.classList.add('btn-compendio');
  // Caderno de estudos: atalho próprio, logo abaixo de Itens, com o ponto dourado quando há novidade.
  const btnCaderno = getEstado().personagem ? botao(textos.caderno.atalho, () => { void abrirCaderno(); btnCaderno?.querySelector('.ponto-novidade')?.remove(); }, { classe: 'btn-caderno' }) : null;
  if (btnCaderno && cadernoTemNovidade()) btnCaderno.append(h('span', { class: 'ponto-novidade', 'aria-label': 'novidade' }));
  const btnSalvar = botao(textos.saves.salvar, () => abrirSalvar(), { desabilitado: o.emBatalha, classe: 'btn-salvar' });
  const dicaSalvar = o.emBatalha ? h('p', { class: 'pausa-dica', id: 'dica-salvar' }, textos.saves.semBatalha) : null;
  if (dicaSalvar) btnSalvar.setAttribute('aria-describedby', 'dica-salvar');
  const corpo = h('div', { class: 'pausa-botoes' },
    cabecalhoHeroi(),
    botao(textos.cenas.continuar, () => fechar(), { classe: 'btn-principal' }),
    btnSalvar, dicaSalvar,
    o.emBatalha ? null : botao(textos.progresso.itens, () => abrirItens({ aoMudarPv: o.aoMudarPv })),
    btnCaderno,
    btnCompendio,
    botao(textos.cenas.diario.titulo, () => abrirDiario()),
    o.ajuda ? botao(o.ajuda.rotulo, () => { fechar(); o.ajuda!.abrir(); }, { classe: 'btn-ajuda-fullmun' }) : null,
    botao(textos.sonho.opcoes, () => abrirOpcoes()),
    botaoTelaCheia('btn btn-tela-cheia-pausa', true),
    o.destravar ? botao(textos.mapa.destravar, () => o.destravar!(), { classe: 'btn-destravar', som: 'ui-back' }) : null,
    botao(textos.sonho.voltarMenu, () => { fechar(); void irPara('menu'); }, { som: 'ui-back' }),
  );
  fecharModal = abrirModal(textos.cenas.pausa, corpo, textos.cenas.fechar, () => o.aoFechar?.());
  return fechar;
}

export function abrirDiario(): void {
  const T = textos.cenas;
  const c = getEstado().campanha;
  const corpo = h('div', { class: 'diario' });
  // Um resumo por ato, crescendo ao longo das partes (Füllmun e o templo são o mesmo Prólogo).
  for (const cap of Object.values(ATOS).filter((x) => x.numero <= c.ato)) {
    const resumo = resumoDoDiario(cap.numero);
    corpo.append(
      h('h3', {}, `${nomeAto(cap.numero)} · ${cap.titulo}`),
      resumo.length ? h('ul', { class: 'diario-resumo' }, ...resumo.map((l) => h('li', {}, l))) : h('p', { class: 'diario-vazio' }, T.diario.semResumo),
    );
    // Fase 6B: os testes de perícia do ato, cada um com a frase do resultado.
    const testes = (c.registro ?? []).filter((r) => r.ato === cap.numero);
    if (testes.length) corpo.append(h('h4', { class: 'diario-subtitulo' }, T.diario.testes), h('ul', { class: 'diario-testes' }, ...testes.map((r) => h('li', {}, r.texto))));
  }
  abrirModal(T.diario.titulo, corpo, T.fechar);
}

/** Itens: Reais no topo; itens de cura com "Usar"; cesto com "Comer um pão" (com confirmação); peças de missão com contador. */
export function abrirItens(o: { aoMudarPv?: (recuperou: number) => void } = {}): void {
  const T = textos.progresso;
  const corpo = h('div', { class: 'itens' });
  const desenhar = () => {
    const c = getEstado().campanha;
    const linhas: Node[] = [h('p', { class: 'itens-reais' }, h('strong', {}, `${c.reais}`), ` ${T.reais}`),
      h('p', { class: 'itens-pv' }, `PV ${pvAtual()} / ${pvMaxAtual()}`)];
    const grupos = new Map<string, { atual: number; total: number; icone: string }>();
    for (const [id, def] of Object.entries(ITENS_DEF)) {
      const n = qtdItem(id);
      if (def.grupo) {
        const g = grupos.get(def.grupo) ?? { atual: 0, total: def.total ?? 0, icone: def.icone };
        g.atual += n;
        grupos.set(def.grupo, g);
        continue;
      }
      if (def.permanente) {
        // Item-chave permanente (Caderno de estudos): sempre na lista, com "Abrir"; não se descarta.
        if (!getEstado().personagem) continue;
        linhas.push(h('div', { class: 'item-linha item-permanente', 'data-item': id },
          h('img', { class: 'item-icone', src: src(ASSETS.item(def.icone)), alt: '', draggable: 'false' }),
          h('div', { class: 'item-info' }, h('p', { class: 'item-nome' }, def.nome), h('p', { class: 'item-texto' }, def.texto ?? '')),
          botao(textos.caderno.abrir, () => void abrirCaderno(), { classe: 'btn-discreto item-usar item-abrir-caderno' })));
        continue;
      }
      if (n <= 0) continue;
      const icone = h('img', { class: 'item-icone', src: src(ASSETS.item(def.icone)), alt: '', draggable: 'false' });
      const info = h('div', { class: 'item-info' }, h('p', { class: 'item-nome' }, def.contador ? def.nome : `${def.nome} ×${n}`),
        h('p', { class: 'item-texto' }, def.contador
          ? `${def.contador.rotulo} ${n}/${def.contador.total} · ${c.flags.includes('comeu_pao') ? T.faltaPao : T.intacto}`
          : def.texto ?? ''));
      let acao: HTMLButtonElement | null = null;
      if (def.tipo === 'cura') {
        acao = botao(T.usar, () => {
          if (pvAtual() >= pvMaxAtual()) return aviso(T.pvCheio);
          const r = usarItemCura(id);
          o.aoMudarPv?.(r);
          aviso(T.pvMais.replace('{n}', String(r)));
          desenhar();
        }, { classe: 'btn-discreto item-usar' });
      } else if (id === 'cesto-paes') {
        acao = botao(T.comerPao, () => confirmarPao(), { classe: 'btn-discreto item-usar' });
      }
      const linha = h('div', { class: 'item-linha', 'data-item': id }, icone, info);
      if (acao) linha.append(acao);
      linhas.push(linha);
    }
    for (const [grupo, g] of grupos) {
      if (!g.atual) continue;
      linhas.push(h('div', { class: 'item-linha', 'data-grupo': grupo },
        h('img', { class: 'item-icone', src: src(ASSETS.item(g.icone)), alt: '', draggable: 'false' }),
        h('div', { class: 'item-info' }, h('p', { class: 'item-nome' }, `${grupo} ${g.atual}/${g.total}`))));
    }
    if (linhas.length === 2) linhas.push(h('p', { class: 'itens-vazio' }, T.semItens));
    corpo.replaceChildren(...linhas);
  };
  const aviso = (t: string) => {
    const a = h('p', { class: 'itens-aviso', role: 'status' }, t);
    corpo.querySelector('.itens-aviso')?.remove();
    corpo.prepend(a);
    setTimeout(() => a.remove(), 1800);
  };
  const confirmarPao = () => {
    if (getEstado().campanha.flags.includes('comeu_pao')) return comer();
    const caixa = h('div', { class: 'itens-confirmar' }, h('p', {}, T.confirmarPao),
      botao(T.comerMesmo, () => { caixa.remove(); comer(); }, { classe: 'btn-principal' }),
      botao(T.naoComer, () => caixa.remove(), { som: 'ui-back' }));
    corpo.append(caixa);
  };
  const comer = () => {
    const r = comerPao();
    o.aoMudarPv?.(r);
    desenhar();
    aviso(T.pvMais.replace('{n}', String(r)));
  };
  desenhar();
  abrirModal(T.itens, corpo, textos.cenas.fechar);
}
