import { textos } from '../core/textos';
import { esperar, h } from '../core/ui';
import { nomeAto, tituloAto, ATOS } from './capitulo';

/**
 * Cartões de ato e de parte (Fase 6), reutilizáveis em qualquer tela (cenas, fase lateral, mapa):
 * "Ato I — Provação Sob a Luz" no estilo do cartão de abertura do jogo (cerca de 3 s) e, logo depois,
 * "Parte 1 · O alçapão se abre", menor e discreto (cerca de 2 s). Ficam por cima de tudo, num fundo
 * preto, e somem com fade.
 */

export interface OpcoesCartao {
  tipo: 'ato' | 'parte';
  /** Linha pequena acima do título ("Ato I"). */
  rotulo?: string;
  titulo: string;
  /** Tempo visível (sem os fades). */
  ms?: number;
  /** Fundo transparente (o cartão de parte por cima de uma cena já escura). */
  semFundo?: boolean;
}

const FADE = 600;

export async function mostrarCartao(o: OpcoesCartao): Promise<void> {
  const el = h('div', { class: `cartao-tela cartao-${o.tipo}${o.semFundo ? ' sem-fundo' : ''}`, role: 'status', 'aria-live': 'polite' },
    o.rotulo ? h('p', { class: 'cartao-tela-rotulo' }, o.rotulo) : null,
    h('h1', { class: 'cartao-tela-titulo' }, o.titulo));
  (document.getElementById('app') ?? document.body).append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visivel')));
  await esperar(FADE + (o.ms ?? (o.tipo === 'ato' ? 3000 : 2000)));
  el.classList.remove('visivel');
  el.classList.add('saindo');
  await esperar(FADE);
  el.remove();
}

/** Nome da parte de um ato ("O túnel"), dos dados do ato. */
export const nomeDaParte = (ato: number, parte: number): string => ATOS[ato]?.nomesPartes?.[String(parte)] ?? '';

/** "Parte 2 · O túnel". */
export const tituloDaParte = (ato: number, parte: number): string =>
  [textos.atos.parte.replace('{n}', String(parte)), nomeDaParte(ato, parte)].filter(Boolean).join(' · ');

export const cartaoAto = (ato: number): Promise<void> =>
  mostrarCartao({ tipo: 'ato', rotulo: nomeAto(ato), titulo: tituloAto(ato) });

export const cartaoParte = (ato: number, parte: number, semFundo = false): Promise<void> =>
  mostrarCartao({ tipo: 'parte', titulo: tituloDaParte(ato, parte), semFundo });
