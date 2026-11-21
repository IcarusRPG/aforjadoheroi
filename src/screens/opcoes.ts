import { audio } from '../core/audio';
import { animacoesReduzidas, atualizarConfig, getEstado, tremoresLigados, type Config } from '../core/estado';
import { botaoTelaCheia, dicaIphone, suportaTelaCheia } from '../core/telaCheia';
import { escolhaDoDado } from './escolhaDado';
import { textos } from '../core/textos';
import { abrirModal, botao, h } from '../core/ui';
import { VERSAO_JOGO } from '../core/erros';
import { definirTutorial, tutorialLigado, zerarDicas } from '../core/tutorial';

function controleVolume(rotulo: string, chave: 'musica' | 'efeitos', aoMudar?: () => void): HTMLElement {
  const id = `vol-${chave}`;
  const valor = h('output', { class: 'opcao-valor', for: id }, `${Math.round(getEstado().config[chave] * 100)}%`);
  const range = h('input', { id, type: 'range', min: 0, max: 100, step: 5, value: Math.round(getEstado().config[chave] * 100) });
  range.addEventListener('input', () => {
    const v = Number(range.value) / 100;
    atualizarConfig({ [chave]: v } as Partial<Config>);
    valor.textContent = `${range.value}%`;
    audio.aplicarVolumes();
    aoMudar?.();
  });
  return h('div', { class: 'opcao' }, h('label', { for: id }, rotulo), h('div', { class: 'opcao-controle' }, range, valor));
}

export function abrirOpcoes(): void {
  const t = textos.opcoes;
  let ultimoTeste = 0;
  // Toca um efeito de amostra ao mexer no volume dos efeitos (no máximo a cada 150 ms).
  const testarEfeito = () => {
    const agora = performance.now();
    if (agora - ultimoTeste > 150) {
      ultimoTeste = agora;
      audio.sfx('point-up');
    }
  };
  const mudo = h('input', { id: 'opcao-mudo', type: 'checkbox', class: 'interruptor', checked: getEstado().config.mudo });
  mudo.addEventListener('change', () => {
    atualizarConfig({ mudo: mudo.checked });
    audio.aplicarVolumes();
    audio.sfx('ui-click');
  });
  const tremores = h('input', { id: 'opcao-tremores', type: 'checkbox', class: 'interruptor', checked: tremoresLigados() });
  tremores.addEventListener('change', () => {
    atualizarConfig({ tremores: tremores.checked });
    audio.sfx('ui-click');
  });
  const dicas = h('input', { id: 'opcao-dicas', type: 'checkbox', class: 'interruptor', checked: tutorialLigado() });
  dicas.addEventListener('change', () => {
    definirTutorial(dicas.checked);
    audio.sfx('ui-click');
  });
  // Fase 5: animações reduzidas (dado sem giro, mapa sem animações, sem tremores).
  const reduzidas = h('input', { id: 'opcao-animacoes', type: 'checkbox', class: 'interruptor', checked: animacoesReduzidas() });
  reduzidas.addEventListener('change', () => {
    atualizarConfig({ animacoesReduzidas: reduzidas.checked });
    (tremores as HTMLInputElement).checked = tremoresLigados();
    window.dispatchEvent(new CustomEvent('fdg:animacoes'));
    audio.sfx('ui-click');
  });
  const travar = h('input', { id: 'opcao-travar', type: 'checkbox', class: 'interruptor', checked: !!getEstado().config.travarHorizontal });
  travar.addEventListener('change', () => { atualizarConfig({ travarHorizontal: travar.checked }); audio.sfx('ui-click'); });
  const telaCheia = suportaTelaCheia()
    ? h('div', { class: 'opcao opcao-tela-cheia' }, h('p', { class: 'opcao-rotulo' }, t.telaCheia), botaoTelaCheia('btn btn-discreto', true),
      h('div', { class: 'opcao-linha' }, h('label', { for: 'opcao-travar' }, t.travarHorizontal), travar))
    : null;
  const aviso = h('p', { class: 'opcao-aviso', role: 'status' });
  const rever = botao(t.reverDicas, () => {
    zerarDicas();
    aviso.textContent = t.dicasZeradas;
  }, { classe: 'btn-discreto opcao-rever-dicas' });
  const corpo = h('div', { class: 'opcoes' },
    controleVolume(t.musica, 'musica'),
    controleVolume(t.efeitos, 'efeitos', testarEfeito),
    h('div', { class: 'opcao opcao-linha' }, h('label', { for: 'opcao-mudo' }, t.mudo), mudo),
    h('div', { class: 'opcao opcao-linha' }, h('label', { for: 'opcao-tremores' }, t.tremores), tremores),
    h('div', { class: 'opcao opcao-linha' }, h('label', { for: 'opcao-animacoes' }, t.animacoesReduzidas), reduzidas),
    h('p', { class: 'opcao-nota' }, t.animacoesDica),
    h('div', { class: 'opcao opcao-dado' }, h('p', { class: 'opcao-rotulo' }, t.dado), escolhaDoDado()),
    telaCheia,
    dicaIphone('opcao-dica-iphone'),
    h('div', { class: 'opcao opcao-linha' }, h('label', { for: 'opcao-dicas' }, t.dicas), dicas),
    h('div', { class: 'opcao' }, rever, aviso),
    h('p', { class: 'opcoes-versao' }, t.versao.replace('{v}', VERSAO_JOGO)),
  );
  abrirModal(t.titulo, corpo, t.fechar);
}
