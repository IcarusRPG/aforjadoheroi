import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { atualizarCampanha, getEstado, marcarFlag, type ParteCapitulo } from '../core/estado';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { botao, h } from '../core/ui';
import { ATOS, nomeAto, parteAtual, resumoDoFim } from '../narrativa/capitulo';

/**
 * "Fim do Prólogo — Amanhecer Tardio" (ou "Fim do Ato I — …"), com um resumo único das partes (até 8
 * linhas, pelas flags; a Nyme por último). O Continuar salva o avanço para o ato seguinte (ato: 1,
 * parte: 1, cena: "inicio") com o estado do herói (PV atual e flags).
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
    atualizarCampanha({ parte: cap.proximaParte as ParteCapitulo, cena: null, modo: 'falas', local: { tela: 'capitulo' } });
    void irPara('capitulo', undefined, { duracao: 900 });
    return;
  }
  void irPara('fimCapitulo', undefined, { duracao: 900 });
}

export function telaFimCapitulo(): Tela {
  const T = textos.cenas.fim;
  const c = { ...getEstado().campanha };
  const cap = ATOS[c.ato] ?? ATOS[0];
  // A última parte (o templo) dá o fundo e a música da tela.
  const ultima = parteAtual(c);
  const resumo = resumoDoFim(cap.numero);
  const prox = cap.proximoCapitulo.numero;
  // Continuar: salva o começo do ato seguinte e segue para ele (ou para o "Em breve", se ainda não existe).
  const seguir = botao(T.seguir, () => {
    atualizarCampanha({ ato: prox, parte: 1, cena: 'inicio', modo: 'falas', local: { tela: 'capitulo' } });
    void irPara(ATOS[prox] ? 'capitulo' : 'emBreve', undefined, { duracao: 800 });
  }, { classe: 'btn-principal' });
  const el = h('div', { class: 'tela-fim-capitulo' },
    h('img', { class: 'fim-fundo', src: src(ASSETS.cena(ultima.fundoFim ?? 'cena-templo-porta')), alt: '', draggable: 'false' }),
    h('div', { class: 'fim-conteudo' },
      h('p', { class: 'fim-rotulo' }, `${T.fimDo} ${nomeAto(cap.numero)}`),
      h('h1', { class: 'fim-titulo' }, cap.titulo),
      h('ul', { class: 'fim-resumo' }, ...resumo.map((l) => h('li', {}, l))),
      seguir,
    ));
  return {
    el,
    aoEntrar() {
      // O save automático do fim (o mesmo do Continuar): quem sair por aqui retoma no ato seguinte.
      atualizarCampanha({ ato: prox, parte: 1, cena: 'inicio', modo: 'falas', local: { tela: 'capitulo' } });
      if (ultima.musicaFim === null) audio.pararMusica(1500);
      else audio.tocarMusica(ASSETS.musica(ultima.musicaFim ?? 'fullmun-02'), 2000);
      requestAnimationFrame(() => el.classList.add('entrou'));
      setTimeout(() => seguir.focus({ preventScroll: true }), 900);
    },
  };
}
