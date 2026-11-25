import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { atualizarCampanha, getEstado, marcarFlag } from '../core/estado';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { botao, h } from '../core/ui';
import { CAPITULOS, parteAtual, resumoDoFim } from '../narrativa/capitulo';

/**
 * "Fim do Capítulo 01 — Amanhecer Tardio", com um resumo único das duas partes (até 8 linhas, pelas
 * flags; a Nyme por último). Salva o avanço para o capítulo seguinte (capitulo: 2, cena: "inicio") com
 * o estado do herói (PV atual e flags).
 */
/**
 * Fim da última cena de uma parte (na tela de capítulo ou sobre um mapa). Se o capítulo tem outra parte
 * (Füllmun → Templo), segue para ela com o cartão de local, salvando (o save automático do antigo fim de
 * capítulo); senão, a tela de fim de capítulo.
 */
export function terminarParte(): void {
  const cap = parteAtual(getEstado().campanha);
  if (cap.proximaParte) {
    marcarFlag(`chegou_${cap.proximaParte}`);
    atualizarCampanha({ parte: cap.proximaParte, cena: null, modo: 'falas', local: { tela: 'capitulo' } });
    void irPara('capitulo', undefined, { duracao: 900 });
    return;
  }
  void irPara('fimCapitulo', undefined, { duracao: 900 });
}

export function telaFimCapitulo(): Tela {
  const T = textos.cenas.fim;
  const c = { ...getEstado().campanha };
  const cap = CAPITULOS[c.capitulo] ?? CAPITULOS[1];
  // A última parte (o templo) dá o fundo e a música da tela.
  const ultima = parteAtual(c);
  const resumo = resumoDoFim(cap.numero);
  const proximo = CAPITULOS[cap.proximoCapitulo.numero];
  const num = (n: number) => String(n).padStart(2, '0');
  // Depois do resumo, segue direto para o próximo capítulo (ou para o "Em breve", se ele ainda não existe).
  const seguir = botao(T.seguir, () => void irPara(proximo ? 'capitulo' : 'emBreve', undefined, { duracao: 800 }), { classe: 'btn-principal' });
  const el = h('div', { class: 'tela-fim-capitulo' },
    h('img', { class: 'fim-fundo', src: src(ASSETS.cena(ultima.fundoFim ?? 'cena-templo-porta')), alt: '', draggable: 'false' }),
    h('div', { class: 'fim-conteudo' },
      h('p', { class: 'fim-rotulo' }, `${T.fimDo} ${textos.cenas.capitulo} ${num(cap.numero)}`),
      h('h1', { class: 'fim-titulo' }, cap.titulo),
      h('ul', { class: 'fim-resumo' }, ...resumo.map((l) => h('li', {}, l))),
      seguir,
    ));
  return {
    el,
    aoEntrar() {
      atualizarCampanha({ capitulo: cap.proximoCapitulo.numero, parte: undefined, cena: 'inicio', modo: 'falas', local: { tela: 'capitulo' } });
      if (ultima.musicaFim === null) audio.pararMusica(1500);
      else audio.tocarMusica(ASSETS.musica(ultima.musicaFim ?? 'fullmun-02'), 2000);
      requestAnimationFrame(() => el.classList.add('entrou'));
      setTimeout(() => seguir.focus({ preventScroll: true }), 900);
    },
  };
}
