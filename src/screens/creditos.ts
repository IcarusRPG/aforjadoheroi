import { ASSETS, src } from '../core/assets';
import CREDITOS from '../data/creditos.json';
import { textos } from '../core/textos';
import { abrirModal, h } from '../core/ui';

interface ItemCredito {
  id: string;
  obra: string;
  autor?: string;
  fonte?: string;
  link?: string;
  licenca?: string;
  /** A licença não exige atribuição; fica como cortesia. */
  cortesia?: boolean;
}
interface SecaoCredito { id: string; titulo: string; itens: ItemCredito[] }

const SECOES = (CREDITOS as { secoes: SecaoCredito[] }).secoes;

/** Uma linha dos créditos: obra, "de autor, via fonte", licença. Campos vazios não aparecem. */
function itemCredito(i: ItemCredito): HTMLElement {
  const t = textos.creditos;
  const fonte = i.fonte
    ? i.link ? h('a', { href: i.link, target: '_blank', rel: 'noopener noreferrer' }, i.fonte) : i.fonte
    : null;
  const quem: (Node | string)[] = [];
  if (i.autor) quem.push(`${t.de} ${i.autor}`);
  if (fonte) quem.push(quem.length ? `, ${t.via} ` : `${t.via} `, fonte);
  const licenca = i.licenca ? `${i.licenca}${i.cortesia ? ` · ${t.cortesia}` : ''}` : '';
  return h('li', { class: 'creditos-item', 'data-credito': i.id },
    h('span', { class: 'creditos-obra' }, i.obra),
    quem.length ? h('span', { class: 'creditos-autor' }, ...quem) : null,
    licenca ? h('span', { class: 'creditos-licenca' }, licenca) : null);
}

/**
 * Créditos (menu inicial e Opções): quem fez o jogo, e a música, os efeitos e a arte, com autor, fonte e
 * licença (src/data/creditos.json). `aoFechar` volta para quem abriu (as Opções).
 */
export function abrirCreditos(aoFechar?: () => void): void {
  const t = textos.creditos;
  const extras = t.extras as string[];
  const corpo = h('div', { class: 'creditos' },
    h('img', { class: 'creditos-logo', src: src(ASSETS.logoForja), alt: 'A Forja do Herói' }),
    ...t.linhas.map((l) => h('p', {}, l)),
    ...extras.map((l) => h('p', { class: 'creditos-extra' }, l)),
    ...SECOES.map((s) => h('section', { class: 'creditos-secao', 'data-secao': s.id },
      h('h3', { class: 'creditos-secao-titulo' }, s.titulo),
      h('ul', { class: 'creditos-lista' }, ...s.itens.map(itemCredito)))),
  );
  abrirModal(t.titulo, corpo, t.fechar, aoFechar);
}
