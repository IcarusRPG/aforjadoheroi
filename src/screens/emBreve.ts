import { ASSETS, src } from '../core/assets';
import { classePorId, nomeDaClasse } from '../core/classes';
import { getEstado } from '../core/estado';
import type { Genero } from '../core/assets';

const classeDe = (id: string | null, g: Genero) => {
  const c = classePorId(id);
  return c ? nomeDaClasse(c, g) : null;
};
import { racaPorId } from '../core/regras';
import { ATOS, nomeAto } from '../narrativa/capitulo';
import { irPara, type Tela } from '../core/telas';
import { textos } from '../core/textos';
import { botao, h } from '../core/ui';

/** Tela provisória depois do último ato pronto: "Ato II · Em breve". */
export function telaEmBreve(): Tela {
  const t = textos.emBreve;
  // O ato que vem a seguir (ex.: "Ato II"), com o título, se já tiver um.
  const atual = getEstado().campanha.ato;
  const anterior = Object.values(ATOS).find((c) => c.proximoCapitulo.numero === atual);
  const capitulo = atual > 0 ? nomeAto(atual) : t.capitulo;
  const tituloProx = anterior ? anterior.proximoCapitulo.titulo : t.titulo;
  const p = getEstado().personagem;
  const heroi = p
    ? h('figure', { class: 'embreve-heroi' },
        h('img', { src: src(ASSETS.retrato(p.raca, p.genero, p.classe ?? 'comum')), alt: p.nome, draggable: 'false' }),
        h('figcaption', {}, h('span', { class: 'embreve-nome' }, p.nome),
          h('span', { class: 'embreve-raca' }, [racaPorId(p.raca)?.nome, classeDe(p.classe, p.genero)].filter(Boolean).join(' · '))))
    : null;
  const voltar = botao(t.voltar, () => void irPara('menu'), { classe: 'btn-principal' });
  const el = h('div', { class: 'tela-embreve' },
    h('div', { class: 'embreve-conteudo' },
      heroi,
      h('div', { class: 'embreve-texto' },
        h('p', { class: 'embreve-capitulo' }, capitulo),
        tituloProx ? h('h1', { class: 'embreve-titulo' }, tituloProx) : null,
        h('p', { class: 'embreve-breve' }, t.emBreve),
        voltar,
      ),
    ),
  );
  return {
    el,
    aoEntrar() {
      requestAnimationFrame(() => el.classList.add('entrou'));
      setTimeout(() => voltar.focus({ preventScroll: true }), 600);
    },
  };
}
