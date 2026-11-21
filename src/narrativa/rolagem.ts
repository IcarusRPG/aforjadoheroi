import { dica } from '../core/tutorial';
import { comSinal } from '../core/dados';
import type { ParteBonus } from '../core/pericias';
import { textos } from '../core/textos';
import { botao, esperar, h } from '../core/ui';
import { criarDado } from './dado';

/**
 * O d20 na tela (o dado escolhido, animado: ver dado.ts), para no resultado, mostra a conta
 * ("14 + CAR 2 + origem 2 = 18 · CD 12 · SUCESSO") em dourado no sucesso e vermelho escuro na falha;
 * o 20 natural mostra "CRÍTICO!". O jogador toca para seguir.
 */
export interface OpcoesRolagem {
  /** Ex.: "Intimidação". */
  titulo: string;
  d20: number;
  partes: ParteBonus[];
  /** Dificuldade (CD) ou Defesa. */
  alvo: number;
  rotuloAlvo?: string;
  /** Espera o toque do jogador (padrão: sim). Na batalha, segue sozinho depois de um tempo. */
  esperarToque?: boolean;
  /** Duração do giro (ms). */
  giroMs?: number;
}

export interface ResultadoRolagem {
  total: number;
  sucesso: boolean;
  critico: boolean;
  conta: string;
}

const T = () => textos.cenas.rolagem;

/** A conta por extenso: "14 + CAR 2 + origem 2 = 18". */
export function contaDaRolagem(d20: number, partes: ParteBonus[]): { total: number; conta: string } {
  const total = d20 + partes.reduce((s, p) => s + p.valor, 0);
  const termos = partes.map((p) => `${p.valor < 0 ? '−' : '+'} ${p.rotulo} ${Math.abs(p.valor)}`);
  return { total, conta: [String(d20), ...termos].join(' ') + ` = ${total}` };
}

/** Avalia sem mostrar (o 20 natural sempre passa e é crítico). */
export function avaliar(d20: number, partes: ParteBonus[], alvo: number): ResultadoRolagem {
  const { total, conta } = contaDaRolagem(d20, partes);
  const critico = d20 === 20;
  return { total, conta, critico, sucesso: critico || total >= alvo };
}

export async function mostrarRolagem(raiz: HTMLElement, o: OpcoesRolagem): Promise<ResultadoRolagem> {
  // Tutorial: o primeiro teste explica o d20 + bônus contra a CD (antes de rolar).
  await dica('teste');
  const r = avaliar(o.d20, o.partes, o.alvo);
  const dado = criarDado({ tamanho: 140, classe: 'rolagem-dado' });
  const d20 = dado.el;
  const conta = h('p', { class: 'rolagem-conta' });
  const veredito = h('p', { class: 'rolagem-veredito' });
  const critico = h('p', { class: 'rolagem-critico', hidden: true }, T().critico);
  const caixa = h('div', { class: 'rolagem', role: 'dialog', 'aria-label': o.titulo, 'aria-live': 'polite' },
    h('p', { class: 'rolagem-titulo' }, o.titulo), d20, critico, conta, veredito);
  const fundo = h('div', { class: 'rolagem-fundo' }, caixa);
  raiz.append(fundo);
  requestAnimationFrame(() => fundo.classList.add('visivel'));

  // Lança, gira e quica; um toque durante a animação pula para o resultado.
  const pular = () => dado.pular();
  fundo.addEventListener('pointerdown', pular);
  await dado.rolar(o.d20, { curto: (o.giroMs ?? 1000) < 1000 });
  fundo.removeEventListener('pointerdown', pular);
  d20.classList.add(r.sucesso ? 'sucesso' : 'falha');
  if (r.critico) {
    critico.hidden = false;
    d20.classList.add('critico');
  }
  conta.textContent = `${r.conta} · ${o.rotuloAlvo ?? 'CD'} ${o.alvo}`;
  veredito.textContent = r.sucesso ? T().sucesso : T().falha;
  caixa.classList.add(r.sucesso ? 'sucesso' : 'falha', 'resolvida');
  (caixa as HTMLElement).dataset.resultado = r.sucesso ? 'sucesso' : 'falha';

  if (o.esperarToque !== false) {
    await new Promise<void>((ok) => {
      const seguir = botao(T().seguir, () => ok(), { classe: 'btn-principal rolagem-seguir' });
      caixa.append(seguir);
      seguir.focus({ preventScroll: true });
      fundo.addEventListener('click', (e) => { if (e.target === fundo) ok(); });
    });
  } else {
    await esperar(1300);
  }
  fundo.classList.remove('visivel');
  await esperar(200);
  fundo.remove();
  return r;
}

export { comSinal };
