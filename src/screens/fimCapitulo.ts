import { ASSETS, src } from '../core/assets';
import { audio } from '../core/audio';
import { atualizarCampanha, getEstado, marcarFlag, type ParteCapitulo } from '../core/estado';
import { existeTela, irPara, type NomeTela, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { botao, h } from '../core/ui';
import { ATOS, interpolar, nomeAto, parteAtual, resumoDoFim } from '../narrativa/capitulo';
import { classePorId, nomeDaClasse } from '../core/classes';

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
/**
 * A tela onde o jogo está agora: no Prólogo, a cena ou o mapa salvo; no Ato I, a Parte 1 é a tela de
 * cenas, as Partes 2 a 5 são a fase lateral e a 6 é o Salão da Forja; depois do último ato pronto, o
 * "Em breve".
 */
export function telaDaCampanha(): NomeTela {
  const c = getEstado().campanha;
  if (!ATOS[c.ato]) return 'emBreve';
  if (c.ato >= 1) {
    const parte = typeof c.parte === 'number' ? c.parte : 1;
    const tela: NomeTela = parte <= 1 ? 'capitulo' : parte <= 5 ? 'lateral' : 'salao';
    return existeTela(tela) ? tela : 'emBreve';
  }
  return c.local.tela === 'mapa' ? 'mapa' : 'capitulo';
}

/** Começa a parte seguinte do ato (save no início dela) e vai para a tela dela, com o cartão da parte. */
export function proximaParteDoAto(): void {
  const c = getEstado().campanha;
  const cap = parteAtual(c);
  const parte = (typeof c.parte === 'number' ? c.parte : 1) + 1;
  if (parte > (cap.totalPartes ?? 1)) { void irPara('fimCapitulo', undefined, { duracao: 900 }); return; }
  atualizarCampanha({ parte, cena: 'inicio', modo: 'falas', local: { tela: parte <= 5 ? 'lateral' : 'mapa' } });
  void irPara(telaDaCampanha(), undefined, { duracao: 900 });
}

export function terminarParte(): void {
  const c0 = getEstado().campanha;
  if (c0.ato >= 1) return proximaParteDoAto();
  const cap = parteAtual(c0);
  if (cap.proximaParte) {
    marcarFlag(`chegou_${cap.proximaParte}`);
    atualizarCampanha({ parte: cap.proximaParte as ParteCapitulo, cena: null, modo: 'falas', local: { tela: 'capitulo' } });
    void irPara('capitulo', undefined, { duracao: 900 });
    return;
  }
  void irPara('fimCapitulo', undefined, { duracao: 900 });
}

/**
 * Resumo do "Fim do Ato I" (até 6 linhas): o caminho dos símbolos, quantas flechas, se levantou, a coragem
 * no escuro, a voz escolhida e a classe.
 */
export function resumoDoAto1(): string[] {
  const c = getEstado().campanha;
  const p = getEstado().personagem;
  const tem = (f: string) => c.flags.includes(f);
  const flechas = c.contadores.flechas ?? 0;
  const classe = p ? classePorId(p.classe) : null;
  const linhas = [
    tem('caminho_tolerancia') ? 'Você achou o caminho entre os símbolos dos outros deuses.' : 'Você aprendeu o caminho dos símbolos, mesmo ferid{o|a}.',
    flechas === 1 ? 'Uma flecha te acertou no caminho.' : `${flechas} flechas te acertaram no caminho.`,
    tem('levantou') ? 'Você caiu. E se levantou.' : 'Você não caiu nenhuma vez.',
    tem('coragem_escuro') ? 'No escuro total, você não parou.' : 'No escuro, suas pernas tremeram, mas você seguiu em frente.',
    'Você seguiu a voz de {Divindade}.',
    classe && p ? `Você se ergueu como ${nomeDaClasse(classe, p.genero)}.` : null,
  ];
  return linhas.filter((l): l is string => !!l).slice(0, 6).map((l) => interpolar(l));
}

export function telaFimCapitulo(): Tela {
  const T = textos.cenas.fim;
  const c = { ...getEstado().campanha };
  const cap = ATOS[c.ato] ?? ATOS[0];
  // A última parte (o templo) dá o fundo e a música da tela.
  const ultima = parteAtual(c);
  const resumo = c.ato === 1 ? resumoDoAto1() : resumoDoFim(cap.numero);
  const prox = cap.proximoCapitulo.numero;
  // Continuar: salva o começo do ato seguinte e segue para ele (ou para o "Em breve", se ainda não existe).
  const seguir = botao(T.seguir, () => {
    atualizarCampanha({ ato: prox, parte: 1, cena: 'inicio', modo: 'falas', local: { tela: 'capitulo' } });
    void irPara(telaDaCampanha(), undefined, { duracao: 800 });
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
