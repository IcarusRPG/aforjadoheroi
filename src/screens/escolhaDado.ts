import { atualizarConfig } from '../core/estado';
import { audio } from '../core/audio';
import { h } from '../core/ui';
import { LISTA_DADOS, criarDado, dadoEscolhido } from '../narrativa/dado';

/**
 * Escolha do dado (Fase 5): os dados lado a lado (src/data/dados.json); tocar escolhe e gira a prévia.
 * Fica em fdg.opcoes.dado (vale para todas as aventuras). Usado na revisão da criação e em Opções.
 */
export function escolhaDoDado(aoMudar?: (id: string) => void): HTMLElement {
  const grupo = h('div', { class: 'escolha-dado', role: 'radiogroup', 'aria-label': 'Seu dado' });
  const opcoes = LISTA_DADOS.map((d) => {
    const dado = criarDado({ dado: d, tamanho: 84 });
    void dado.rolar(20, { silencioso: true }).then(() => dado.el.classList.remove('dado-critico'));
    const b = h('button', { type: 'button', class: 'escolha-dado-opcao', role: 'radio', 'data-dado': d.id, 'aria-label': d.nome },
      dado.el, h('span', { class: 'escolha-dado-nome' }, d.nome)) as HTMLButtonElement;
    b.addEventListener('click', () => {
      atualizarConfig({ dado: d.id });
      audio.sfx('ui-click');
      marcar();
      void dado.rolar(1 + Math.floor(Math.random() * 20));
      aoMudar?.(d.id);
    });
    return b;
  });
  const marcar = () => {
    const atual = dadoEscolhido().id;
    for (const b of opcoes) b.setAttribute('aria-checked', String(b.dataset.dado === atual));
  };
  grupo.append(...opcoes);
  marcar();
  return grupo;
}
