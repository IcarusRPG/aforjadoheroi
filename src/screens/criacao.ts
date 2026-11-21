import { modoTeste, registrarGanchos } from '../core/ganchos';
import { escolhaDoDado } from './escolhaDado';
import { ASSETS, src, type Genero } from '../core/assets';
import { audio } from '../core/audio';
import { dica } from '../core/tutorial';
import { ATRIBUTOS, salvarPersonagem, type Atributo, type MapaAtributos, type Personagem } from '../core/estado';
import {
  CUSTO, MAX, RACAS, atributosFinais, bonusAEscolher, modificadoresRaciais, podeAumentar, podeDiminuir,
  pmExtraDaRaca, racaPorId, saldo, sinal, zerados,
} from '../core/regras';
import {
  CLASSES, PM_ANTES_DA_FORJA, classePorId, formulaPm, formulaPv, formulaPvAntesDaForja, nomeDaClasse, pedrasIniciais,
  pmPrimeiroNivel, pvAntesDaForja, pvPrimeiroNivel, type ClasseDados,
} from '../core/classes';
import { irPara, type Tela } from '../core/telas';
import { ehToque, fmt, textos } from '../core/textos';
import { botao, h, somHover } from '../core/ui';
import ORIGENS_JSON from '../data/origens.json';
import NOMES from '../data/nomes.json';

const T = textos.criacao;
const ORIGENS = ORIGENS_JSON.origens;
const NOME_MIN = 2;
const NOME_MAX = 24;

interface Rascunho {
  genero: Genero | null;
  raca: string | null;
  variante: string | null;
  origem: string | null;
  classe: string | null;
  nome: string;
  comprados: MapaAtributos;
  bonusArake: Atributo[];
}

/** Ordem dos passos (os rótulos ficam em textos.criacao.passos, na mesma ordem). */
const IDS = ['genero', 'raca', 'origem', 'classe', 'nome', 'atributos', 'revisao'] as const;
type IdPasso = (typeof IDS)[number];

/** Parâmetros da tela: `retomar` reabre um herói salvo sem classe direto no passo Classe. */
export interface ParamsCriacao {
  retomar?: Personagem;
}

const ICONE_CADEADO =
  '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg>';

export function telaCriacao(params?: unknown): Tela {
  const salvo = (params as ParamsCriacao | undefined)?.retomar;
  const r: Rascunho = salvo
    ? {
        genero: salvo.genero, raca: salvo.raca, variante: salvo.variante, origem: salvo.origem, classe: salvo.classe,
        nome: salvo.nome, comprados: { ...salvo.atributosComprados }, bonusArake: [...(salvo.bonusArake ?? [])],
      }
    : { genero: null, raca: null, variante: null, origem: null, classe: null, nome: '', comprados: zerados(), bonusArake: [] };
  let passo = salvo ? IDS.indexOf('classe') : 0;
  let confirmando = false;
  const ULTIMO = T.passos.length - 1; // Revisão

  /* ---------------------------- validação ---------------------------- */

  const nomeValido = () => {
    const n = r.nome.trim();
    return n.length >= NOME_MIN && n.length <= NOME_MAX;
  };
  const bonusCompleto = () => r.bonusArake.length === bonusAEscolher(r.raca);

  /** Mensagem do que falta no passo (ou null se pode avançar). */
  function pendencia(p: number): string | null {
    const id: IdPasso = IDS[p];
    switch (id) {
      case 'genero': return r.genero ? null : '';
      case 'raca':
        if (!r.raca) return '';
        if (racaPorId(r.raca)?.variantes && !r.variante) return T.raca.varianteObrigatoria;
        return null;
      case 'origem': return r.origem ? null : '';
      case 'classe': return classePorId(r.classe)?.jogavelDemo ? null : '';
      case 'nome': return nomeValido() ? null : '';
      case 'atributos':
        if (saldo(r.comprados) !== 0) return T.atributos.gasteTudo;
        if (!bonusCompleto()) return T.atributos.escolhaBonus;
        return null;
      default: return null;
    }
  }
  const podeIrPara = (alvo: number) => {
    for (let p = 0; p < alvo; p++) if (pendencia(p) !== null) return false;
    return true;
  };

  /* ---------------------------- estrutura ---------------------------- */

  const titulo = h('h1', { class: 'criacao-titulo' });
  const listaPassos = h('ol', { class: 'passos' });
  const conteudo = h('main', { class: 'criacao-conteudo', tabindex: '-1' });
  /** Quem rola: o cartão (desktop) ou a área inteira do corpo (celular). */
  const rolador = () => (conteudo.scrollHeight > conteudo.clientHeight + 1 ? conteudo : corpo);
  const retrato = h('img', { class: 'painel-retrato', alt: '', draggable: 'false' });
  const legendaRetrato = h('figcaption', { class: 'painel-legenda' });
  const resumo = h('div', { class: 'painel-resumo' });
  const painel = h('aside', { class: 'criacao-painel', 'aria-label': 'Seu personagem' },
    h('figure', { class: 'painel-figura' }, retrato, legendaRetrato), resumo);
  const aviso = h('p', { class: 'rodape-aviso', 'aria-live': 'polite' });
  const btnVoltar = botao(T.voltar, () => voltar(), { som: 'ui-back' });
  const btnAvancar = botao(T.avancar, () => avancar(), { classe: 'btn-principal', som: null });

  const corpo = h('div', { class: 'criacao-corpo' }, conteudo, painel);
  const rodape = h('footer', { class: 'criacao-rodape' }, btnVoltar, aviso, btnAvancar);
  const el = h('div', { class: 'tela-criacao' },
    h('img', { class: 'criacao-fundo', src: src(ASSETS.wallpaperMenu), alt: '', draggable: 'false' }),
    h('div', { class: 'criacao-veu' }),
    h('header', { class: 'criacao-topo' },
      botao(T.menu, () => void irPara('menu'), { classe: 'btn-discreto', som: 'ui-back' }),
      titulo,
      h('nav', { class: 'passos-nav', 'aria-label': 'Passos da criação' }, listaPassos),
    ),
    corpo,
    rodape,
    h('div', { class: 'criacao-cortina' }),
  );
  // A barra de Voltar/Avançar fica fixa por cima do fim da tela no celular: o container rolável ganha no
  // fim um espaço do tamanho dela (a altura medida já inclui a área segura de baixo, que é o padding dela).
  const medirRodape = new ResizeObserver(() => {
    el.style.setProperty('--altura-rodape', `${Math.ceil(rodape.getBoundingClientRect().height)}px`);
  });
  medirRodape.observe(rodape);

  /* ---------------------------- navegação ---------------------------- */

  function irParaPasso(novo: number, som: 'ui-confirm' | 'ui-back' | null) {
    if (novo === passo || novo < 0 || novo > ULTIMO) return;
    if (som) audio.sfx(som);
    passo = novo;
    renderizar(true);
    if (IDS[passo] === 'atributos') void dica('atributos');
    conteudo.scrollTop = 0;
    corpo.scrollTop = 0;
    conteudo.focus({ preventScroll: true });
  }
  function avancar() {
    if (confirmando) return;
    if (passo === ULTIMO) return confirmar();
    if (pendencia(passo) !== null) {
      audio.sfx('ui-locked');
      return;
    }
    irParaPasso(passo + 1, 'ui-confirm');
  }
  function voltar() {
    if (passo > 0) irParaPasso(passo - 1, null);
  }

  function confirmar() {
    const classe = classePorId(r.classe);
    if (confirmando || !r.genero || !r.raca || !r.origem || !classe) return;
    confirmando = true;
    const finais = atributosFinais(r.comprados, r.raca, r.bonusArake);
    const personagem: Personagem = {
      nome: r.nome.trim(),
      genero: r.genero,
      raca: r.raca,
      variante: r.variante,
      origem: r.origem,
      atributosComprados: { ...r.comprados },
      bonusArake: [...r.bonusArake],
      atributosFinais: finais,
      classe: classe.id,
      pvMax: pvPrimeiroNivel(classe, finais),
      pmMax: pmPrimeiroNivel(classe, finais, r.raca),
      pedras: pedrasIniciais(),
      criadoEm: new Date().toISOString(),
    };
    salvarPersonagem(personagem);
    audio.sfx('hero-confirm');
    audio.pararMusica(3000);
    el.classList.add('confirmando');
    btnAvancar.disabled = true;
    btnVoltar.disabled = true;
    setTimeout(() => void irPara('prologo', undefined, { som: false, duracao: 300 }), 3000);
  }

  /* ---------------------------- render ---------------------------- */

  function renderizar(trocarConteudo: boolean) {
    titulo.textContent = fmt(T.titulo, r.genero);
    renderPassos();
    if (trocarConteudo) {
      const secao = PASSOS[IDS[passo]]() as HTMLElement;
      // Só anima a entrada quando o passo muda (não a cada card escolhido).
      if (conteudo.dataset.passo !== String(passo)) secao.classList.add('entrando');
      const quem = rolador();
      const rolagem = quem.scrollTop;
      conteudo.replaceChildren(secao);
      if (conteudo.dataset.passo === String(passo)) quem.scrollTop = rolagem;
      conteudo.dataset.passo = String(passo);
    }
    renderPainel();
    renderRodape();
  }

  function renderPassos() {
    listaPassos.replaceChildren(
      ...T.passos.map((nome, i) => {
        const liberado = i <= passo || podeIrPara(i);
        const item = h('button', {
          type: 'button',
          class: `passo ${i === passo ? 'atual' : ''} ${i < passo ? 'feito' : ''}`,
          disabled: !liberado,
          'aria-current': i === passo ? 'step' : undefined,
        }, h('span', { class: 'passo-num' }, i === ULTIMO ? '✦' : String(i + 1)), h('span', { class: 'passo-rotulo' }, nome));
        item.addEventListener('click', () => irParaPasso(i, i < passo ? 'ui-back' : 'ui-confirm'));
        return h('li', {}, item);
      }),
    );
  }

  function renderRodape() {
    btnVoltar.style.visibility = passo === 0 ? 'hidden' : 'visible';
    const p = pendencia(passo);
    aviso.textContent = p ?? '';
    btnAvancar.textContent = passo === ULTIMO ? fmt(T.revisao.confirmar, r.genero) : T.avancar;
    btnAvancar.classList.toggle('btn-confirmar', passo === ULTIMO);
    btnAvancar.disabled = confirmando || p !== null;
  }

  function renderPainel() {
    const genero = r.genero ?? 'm';
    const raca = r.raca ?? 'arake';
    // Antes da classe, a roupa comum; depois, o retrato com o equipamento da classe.
    const novoSrc = src(ASSETS.retrato(raca, genero, r.classe ?? 'comum'));
    if (retrato.getAttribute('src') !== novoSrc) {
      retrato.classList.remove('trocou');
      void retrato.offsetWidth;
      retrato.src = novoSrc;
      retrato.dataset.retrato = ASSETS.retrato(raca, genero, r.classe ?? 'comum');
      retrato.classList.add('trocou');
    }
    retrato.classList.toggle('previa', !r.raca);
    retrato.alt = r.raca ? `Retrato: ${racaPorId(r.raca)?.nome}` : '';
    legendaRetrato.textContent = r.nome.trim() || (r.raca ? '' : T.resumo.vazio);

    const racaD = racaPorId(r.raca);
    const variante = racaD?.variantes?.find((v) => v.id === r.variante);
    const origem = ORIGENS.find((o) => o.id === r.origem);
    const finais = atributosFinais(r.comprados, r.raca, r.bonusArake);
    const classeSel = classePorId(r.classe);
    const linha = (rotulo: string, valor: string | null) =>
      h('div', { class: 'resumo-linha' }, h('dt', {}, rotulo), h('dd', {}, valor || T.resumo.vazio));
    resumo.replaceChildren(
      h('dl', { class: 'resumo-lista' },
        linha(T.resumo.genero, r.genero ? T.genero[r.genero] : null),
        linha(T.resumo.raca, racaD ? `${racaD.nome}${variante ? ` · ${variante.nome}` : ''}` : null),
        linha(T.resumo.origem, origem?.nome ?? null),
        linha(T.resumo.classe, classeSel ? nomeDaClasse(classeSel, r.genero) : null),
      ),
      h('div', { class: 'resumo-atributos' },
        ...ATRIBUTOS.map((a) => h('div', { class: `mini-atributo ${finais[a] > 0 ? 'pos' : finais[a] < 0 ? 'neg' : ''}` },
          h('span', { class: 'mini-sigla' }, a), h('span', { class: 'mini-valor' }, sinal(finais[a])))),
      ),
    );
  }

  /* ---------------------------- passos ---------------------------- */

  function cabecalho(tituloPasso: string, texto?: string) {
    return h('div', { class: 'passo-cabecalho' }, h('h2', {}, tituloPasso), texto ? h('p', { class: 'passo-texto' }, texto) : null);
  }

  /** Card selecionável (botão com aria-pressed). */
  function card(classe: string, selecionado: boolean, aoEscolher: () => void, ...filhos: (Node | string | null)[]) {
    const c = h('button', { type: 'button', class: `card ${classe} ${selecionado ? 'selecionado' : ''}`, 'aria-pressed': String(selecionado) }, ...filhos);
    c.addEventListener('click', () => {
      audio.sfx('ui-confirm');
      aoEscolher();
    });
    return somHover(c);
  }

  /** Card indisponível na demo: esmaecido; o aviso aparece no hover (desktop) ou no toque, e some em 2 s. */
  function cardBloqueado(classe: string, nome: string, ...filhos: (Node | string | null)[]) {
    const aviso = h('span', { class: 'card-aviso', role: 'tooltip' }, T.raca.indisponivel);
    const cadeado = h('span', { class: 'card-cadeado' });
    cadeado.innerHTML = ICONE_CADEADO;
    const c = h('button', { type: 'button', class: `card ${classe} bloqueado`, 'aria-disabled': 'true', 'aria-label': `${nome}: ${T.raca.indisponivel}` },
      cadeado, ...filhos, aviso);
    let timer = 0;
    c.addEventListener('click', () => {
      audio.sfx('ui-locked');
      c.classList.add('mostrar-aviso');
      clearTimeout(timer);
      timer = window.setTimeout(() => c.classList.remove('mostrar-aviso'), 2000);
    });
    return c;
  }

  function passoGenero(): Node {
    const raca = r.raca ?? 'arake';
    const opcao = (g: Genero) =>
      card('card-genero', r.genero === g, () => {
        r.genero = g;
        renderizar(true);
      },
      h('img', { class: 'card-genero-img', src: src(ASSETS.retrato(raca, g)), alt: '', draggable: 'false' }),
      h('span', { class: 'card-titulo' }, T.genero[g]));
    return h('section', { class: 'passo-genero' },
      cabecalho(T.genero.titulo, T.genero.texto),
      h('div', { class: 'grade-genero' }, opcao('m'), opcao('f')),
    );
  }

  function passoRaca(): Node {
    const grade = h('div', { class: 'grade-racas' });
    for (const raca of RACAS) {
      const conteudoCard = [
        h('span', { class: 'card-titulo' }, raca.nome),
        h('span', { class: 'card-sub' }, raca.classico),
        h('span', { class: 'card-meta' }, raca.significado),
      ];
      if (raca.jogavelDemo) {
        grade.append(card('card-raca', r.raca === raca.id, () => {
          if (r.raca !== raca.id) {
            r.raca = raca.id;
            r.variante = null;
            r.bonusArake = [];
          }
          renderizar(true);
          conteudo.querySelector('.detalhe-raca')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, ...conteudoCard));
      } else {
        grade.append(cardBloqueado('card-raca', raca.nome, ...conteudoCard));
      }
    }

    const sel = racaPorId(r.raca);
    let detalhe: Node | null = null;
    if (sel) {
      detalhe = h('div', { class: 'detalhe-raca' },
        h('h3', {}, sel.nome, h('span', { class: 'detalhe-sub' }, ` · ${sel.significado}`)),
        h('p', {}, sel.texto),
        sel.naPratica ? h('p', { class: 'na-pratica' }, h('strong', {}, `${T.raca.naPratica}: `), sel.naPratica) : null,
        sel.variantes
          ? h('div', { class: 'variantes' },
              h('h4', {}, T.raca.variante),
              h('div', { class: 'grade-variantes' },
                ...sel.variantes.map((v) =>
                  card(`card-variante variante-${v.id}`, r.variante === v.id, () => {
                    r.variante = v.id;
                    renderizar(true);
                  }, h('span', { class: 'card-titulo' }, v.nome), h('span', { class: 'card-meta' }, v.texto)))))
          : null,
      );
    }
    return h('section', { class: 'passo-raca' }, cabecalho(T.raca.titulo), grade, detalhe);
  }

  function passoOrigem(): Node {
    return h('section', { class: 'passo-origem' },
      cabecalho(T.origem.titulo),
      h('div', { class: 'grade-origens' },
        ...ORIGENS.map((o) =>
          card('card-origem', r.origem === o.id, () => {
            r.origem = o.id;
            renderizar(true);
          },
          h('span', { class: 'card-titulo' }, o.nome),
          h('span', { class: 'card-meta card-ambientacao' }, o.texto),
          h('span', { class: 'card-linha' }, h('strong', {}, `${T.origem.pericia}: `), `${o.pericia} +${o.bonusPericia}`),
          h('span', { class: 'card-linha' }, h('strong', {}, `${T.origem.poder}: `), h('em', {}, o.poder.nome), ` — ${o.poder.descricao}`),
          h('span', { class: 'card-linha' }, h('strong', {}, `${T.origem.itens}: `), o.itens.join('; '))))),
    );
  }

  function passoClasse(): Node {
    const genero = r.genero ?? 'm';
    const raca = r.raca ?? 'arake';
    const TC = T.classe;
    const grade = h('div', { class: 'grade-classes' });
    for (const c of CLASSES) {
      const nome = nomeDaClasse(c, genero);
      if (c.jogavelDemo) {
        grade.append(card('card-classe', r.classe === c.id, () => {
          r.classe = c.id;
          renderizar(true);
          conteudo.querySelector('.detalhe-classe')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },
        h('img', { class: 'card-classe-img', src: src(ASSETS.retrato(raca, genero, c.id)), 'data-retrato': ASSETS.retrato(raca, genero, c.id), alt: '', draggable: 'false' }),
        h('span', { class: 'card-titulo' }, nome),
        h('span', { class: 'card-meta' }, c.papel)));
      } else {
        grade.append(cardBloqueado('card-classe', nome,
          h('span', { class: 'card-classe-img card-classe-vazio', 'aria-hidden': 'true' }),
          h('span', { class: 'card-titulo' }, nome),
          h('span', { class: 'card-meta' }, c.papel)));
      }
    }
    const sel = classePorId(r.classe);
    const linha = (rotulo: string, valor: string) => h('p', { class: 'detalhe-linha' }, h('strong', {}, `${rotulo}: `), valor);
    const detalhe = sel
      ? h('div', { class: 'detalhe-raca detalhe-classe' },
          h('h3', {}, nomeDaClasse(sel, genero), h('span', { class: 'detalhe-sub' }, ` · ${sel.papel}`)),
          h('p', {}, sel.texto),
          linha(TC.reliquia, sel.reliquia ?? '—'),
          linha(TC.naPratica, sel.naPratica ?? '—'),
          linha(TC.pericias, sel.periciasObrigatorias ?? '—'),
          blocoPvPm(sel, null),
        )
      : null;
    return h('section', { class: 'passo-classe' }, cabecalho(TC.titulo, TC.texto), grade, detalhe);
  }

  /**
   * PV e PM em duas fases: "Agora" (sem classe: 10 + CON PV e 0 PM) e "Após a Forja" (os da classe, que só
   * desperta ao jurar na Forja). Sem atributos ainda (passo Classe), mostra as fórmulas; depois, os valores.
   * Fórmulas têm a versão por extenso e a abreviada ("12 + CON"); o CSS escolhe pela largura da tela.
   */
  function blocoPvPm(classe: ClasseDados, finais: MapaAtributos | null): HTMLElement {
    const TC = T.classe;
    const tipo = finais ? 'valor' : 'formula';
    const texto = (longo: string | number, curto: string | number = longo) => longo === curto
      ? String(longo)
      : [h('span', { class: 'extenso' }, String(longo)), h('span', { class: 'sigla' }, String(curto))];
    const linha = (rotulo: string, classeValor: string, valor: Node | string | (Node | string)[]) =>
      h('div', { class: 'pv-pm-linha' }, h('span', { class: 'pv-pm-rotulo' }, rotulo),
        h('span', { class: `pv-pm-valor ${classeValor}` }, ...(Array.isArray(valor) ? valor : [valor])));
    const fase = (qual: string, titulo: string, ...linhas: HTMLElement[]) =>
      h('div', { class: `pv-pm-item pv-pm-fase fase-${qual}` }, h('span', { class: 'pv-pm-fase-titulo' }, titulo), ...linhas);
    const agora = fase('agora', TC.agora,
      linha(TC.pvCurto, `pv-agora`, finais ? String(pvAntesDaForja(finais)) : texto(formulaPvAntesDaForja(), formulaPvAntesDaForja(true))),
      linha(TC.pmCurto, `pm-agora`, String(PM_ANTES_DA_FORJA)));
    const forja = fase('forja', TC.aposForja,
      linha(TC.pvCurto, `pv-${tipo}`, finais ? String(pvPrimeiroNivel(classe, finais)) : texto(formulaPv(classe), formulaPv(classe, true))),
      linha(TC.pmCurto, `pm-${tipo}`, finais ? String(pmPrimeiroNivel(classe, finais, r.raca)) : texto(formulaPm(classe, r.raca), formulaPm(classe, r.raca, true))));
    const extra = pmExtraDaRaca(r.raca);
    // Ayoran: o +1 do Sangue dos Primevos aparece junto do valor (na fórmula por extenso, já está escrito).
    const notaRaca = extra && finais ? h('p', { class: 'pv-pm-nota pm-raca' }, fmt(TC.pmRacaNota, r.genero, { n: extra })) : null;
    return h('div', { class: 'pv-pm' }, agora, forja,
      h('p', { class: 'pv-pm-nota nota-forja' }, fmt(TC.notaForja, r.genero)), notaRaca);
  }

  function passoNome(): Node {
    const input = h('input', {
      type: 'text', class: 'campo-nome', maxlength: NOME_MAX, minlength: NOME_MIN, autocomplete: 'off', spellcheck: 'false',
      autocapitalize: 'words', enterkeyhint: 'next', id: 'campo-nome',
      placeholder: fmt(T.nome.placeholder, r.genero), value: r.nome,
    });
    const contador = h('span', { class: 'nome-contador', 'aria-hidden': 'true' });
    const dica = h('p', { class: 'nome-dica', id: 'nome-dica' }, T.nome.regra);
    input.setAttribute('aria-describedby', 'nome-dica');
    const atualizar = () => {
      contador.textContent = `${r.nome.trim().length}/${NOME_MAX}`;
      dica.classList.toggle('ok', nomeValido());
      renderPainel();
      renderRodape();
      renderPassos();
    };
    input.addEventListener('input', () => {
      r.nome = input.value.slice(0, NOME_MAX);
      atualizar();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
        avancar();
      }
    });
    // Com o teclado virtual aberto, mantém o campo no meio da área visível.
    input.addEventListener('focus', () => setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300));
    const sugerir = botao(T.nome.sugerir, () => {
      const lista = ((NOMES as Record<string, Record<Genero, string[]>>)[r.raca ?? 'arake'] ?? NOMES.arake)[r.genero ?? 'm'];
      const opcoes = lista.filter((n) => n !== r.nome);
      r.nome = opcoes[Math.floor(Math.random() * opcoes.length)];
      input.value = r.nome;
      atualizar();
    }, { classe: 'btn-secundario' });
    contador.textContent = `${r.nome.trim().length}/${NOME_MAX}`;
    dica.classList.toggle('ok', nomeValido());
    // No celular, não abrir o teclado sozinho por cima da tela.
    if (!ehToque()) setTimeout(() => input.focus({ preventScroll: true }), 50);
    return h('section', { class: 'passo-nome' },
      h('div', { class: 'passo-cabecalho' }, h('h2', {}, h('label', { for: 'campo-nome' }, T.nome.titulo))),
      h('div', { class: 'passo-nome-campos' }, h('div', { class: 'campo-nome-caixa' }, input, contador), dica, sugerir),
    );
  }

  function passoAtributos(): Node {
    const pontos = h('div', { class: 'pontos' });
    const lista = h('div', { class: 'lista-atributos', role: 'list' });
    const qtdBonus = bonusAEscolher(r.raca);
    const notaBonus = qtdBonus ? h('p', { class: 'nota-bonus' }) : null;
    const classe = classePorId(r.classe);
    const chave = classe?.atributoChave ?? null;
    const selo = classe?.selo && chave
      ? h('p', { class: 'selo-chave' }, `${classe.selo[r.genero ?? 'm']}: `, h('strong', {}, chave))
      : h('p', { class: 'selo-chave' }, T.atributos.escolhaClasse);
    const vivo = h('div', { class: 'pv-pm-vivo', 'aria-live': 'polite' });

    const desenhar = () => {
      const s = saldo(r.comprados);
      pontos.replaceChildren(h('span', { class: 'pontos-rotulo' }, T.atributos.pontos), h('span', { class: `pontos-valor ${s === 0 ? 'zerado' : ''}` }, String(s)));
      if (notaBonus) notaBonus.textContent = `${T.atributos.bonusArake} (${r.bonusArake.length}/${qtdBonus})`;
      const mods = modificadoresRaciais(r.raca, r.bonusArake);
      if (classe) {
        const finais = atributosFinais(r.comprados, r.raca, r.bonusArake);
        vivo.replaceChildren(blocoPvPm(classe, finais));
      }
      lista.replaceChildren(...ATRIBUTOS.map((a) => {
        const v = r.comprados[a];
        const menos = h('button', { type: 'button', class: 'btn-ponto', 'aria-label': `Diminuir ${textos.atributos[a]}`, disabled: !podeDiminuir(r.comprados, a) }, '−');
        const mais = h('button', { type: 'button', class: 'btn-ponto', 'aria-label': `Aumentar ${textos.atributos[a]}`, disabled: !podeAumentar(r.comprados, a) }, '+');
        menos.addEventListener('click', () => {
          if (!podeDiminuir(r.comprados, a)) return audio.sfx('ui-locked');
          r.comprados[a] -= 1;
          audio.sfx('point-down');
          desenhar();
        });
        mais.addEventListener('click', () => {
          if (!podeAumentar(r.comprados, a)) return audio.sfx('ui-locked');
          r.comprados[a] += 1;
          audio.sfx('point-up');
          desenhar();
        });
        const proximo = v < MAX ? CUSTO[v + 1] - CUSTO[v] : null;
        let bonusBtn: HTMLElement | null = null;
        if (qtdBonus) {
          const ativo = r.bonusArake.includes(a);
          bonusBtn = h('button', {
            type: 'button', class: `btn-bonus ${ativo ? 'ativo' : ''}`, 'aria-pressed': String(ativo),
            disabled: !ativo && r.bonusArake.length >= qtdBonus,
            title: T.atributos.bonusArake,
          }, '+1');
          bonusBtn.addEventListener('click', () => {
            if (ativo) {
              r.bonusArake = r.bonusArake.filter((x) => x !== a);
              audio.sfx('point-down');
            } else if (r.bonusArake.length < qtdBonus) {
              r.bonusArake = [...r.bonusArake, a];
              audio.sfx('point-up');
            }
            desenhar();
          });
        }
        const mod = mods[a];
        const final = v + mod;
        return h('div', { class: `atributo ${a === chave ? 'chave' : ''}`, role: 'listitem', 'data-atributo': a },
          h('div', { class: 'atributo-nome' }, h('span', { class: 'atributo-sigla' }, a), h('span', { class: 'atributo-extenso' }, textos.atributos[a])),
          h('div', { class: 'atributo-compra' }, menos, h('span', { class: 'atributo-comprado', 'aria-label': T.atributos.comprado }, sinal(v)), mais),
          h('div', { class: 'atributo-custo' }, proximo !== null ? `+${proximo}` : '—'),
          h('div', { class: 'atributo-racial' }, bonusBtn ?? h('span', { class: `mod ${mod > 0 ? 'pos' : mod < 0 ? 'neg' : ''}` }, mod ? sinal(mod) : '')),
          h('div', { class: `atributo-final ${final > 0 ? 'pos' : final < 0 ? 'neg' : ''}`, 'aria-label': T.atributos.final }, sinal(final)),
        );
      }));
      renderPainel();
      renderRodape();
      renderPassos();
    };
    desenhar();
    return h('section', { class: 'passo-atributos' },
      h('div', { class: 'atributos-topo' }, cabecalho(T.atributos.titulo, T.atributos.custo), pontos),
      selo,
      classe ? vivo : null,
      notaBonus,
      h('div', { class: 'atributos-cabecalho', 'aria-hidden': 'true' },
        h('span', {}, ''), h('span', {}, T.atributos.comprado), h('span', {}, 'Próx.'), h('span', {}, qtdBonus ? 'Araké' : 'Raça'), h('span', {}, T.atributos.final)),
      lista,
    );
  }

  function passoRevisao(): Node {
    const racaD = racaPorId(r.raca)!;
    const variante = racaD.variantes?.find((v) => v.id === r.variante);
    const origem = ORIGENS.find((o) => o.id === r.origem)!;
    const finais = atributosFinais(r.comprados, r.raca, r.bonusArake);
    const classe = classePorId(r.classe)!;
    const item = (rotulo: string, ...valor: (Node | string)[]) => h('div', { class: 'revisao-item' }, h('dt', {}, rotulo), h('dd', {}, ...valor));
    return h('section', { class: 'passo-revisao' },
      cabecalho(fmt(T.revisao.titulo, r.genero)),
      h('div', { class: 'revisao-ficha' },
        h('div', { class: 'revisao-topo' },
          h('img', { class: 'revisao-retrato', src: src(ASSETS.retrato(r.raca!, r.genero!, classe.id)), 'data-retrato': ASSETS.retrato(r.raca!, r.genero!, classe.id), alt: `Retrato: ${nomeDaClasse(classe, r.genero)}`, draggable: 'false' }),
          h('div', { class: 'revisao-identidade' },
            h('div', { class: 'revisao-cabeca' },
              h('img', { class: 'revisao-busto', src: src(ASSETS.bustoHeroi(r.raca!, r.genero!)), 'data-retrato': ASSETS.bustoHeroi(r.raca!, r.genero!), alt: '', draggable: 'false' }),
              h('h3', { class: 'revisao-nome' }, r.nome.trim())),
            h('p', { class: 'revisao-classe' }, nomeDaClasse(classe, r.genero)),
            blocoPvPm(classe, finais))),
        h('dl', { class: 'revisao-lista' },
          item(T.resumo.genero, T.genero[r.genero!]),
          item(T.resumo.raca, `${racaD.nome} (${racaD.classico})${variante ? ` · ${variante.nome}` : ''}`),
          item(T.resumo.origem, `${origem.nome} — ${origem.pericia} +${origem.bonusPericia}`),
          item(T.origem.poder, h('em', {}, origem.poder.nome), ` — ${origem.poder.descricao}`),
          item(T.origem.itens, origem.itens.join('; ')),
          item(T.resumo.classe, `${nomeDaClasse(classe, r.genero)} — ${classe.papel}`),
          item(T.revisao.reliquia, classe.reliquia ?? '—'),
        ),
        h('div', { class: 'revisao-atributos' },
          ...ATRIBUTOS.map((a) => h('div', { class: `atributo-grande ${finais[a] > 0 ? 'pos' : finais[a] < 0 ? 'neg' : ''}` },
            h('span', { class: 'ag-sigla' }, a), h('span', { class: 'ag-valor' }, sinal(finais[a])), h('span', { class: 'ag-nome' }, textos.atributos[a])))),
        // Fase 5: "Seu dado" (vale para todas as aventuras; dá para trocar em Opções).
        h('div', { class: 'revisao-dado' }, h('h4', { class: 'revisao-dado-titulo' }, T.revisao.seuDado), escolhaDoDado()),
      ),
    );
  }

  const PASSOS: Record<IdPasso, () => Node> = {
    genero: passoGenero, raca: passoRaca, origem: passoOrigem, classe: passoClasse,
    nome: passoNome, atributos: passoAtributos, revisao: passoRevisao,
  };

  renderizar(true);

  return {
    el,
    aoEntrar() {
      // Só nos testes: pula para a revisão com um herói pronto (a escolha do dado fica lá).
      if (modoTeste()) registrarGanchos({
        irParaRevisao: () => {
          Object.assign(r, { genero: 'm', raca: 'ayoran', origem: 'campones', classe: 'arcanista', nome: 'Thaelion' });
          passo = ULTIMO;
          renderizar(true);
        },
      });
      // A mesma faixa do menu: se já estiver tocando, continua sem reiniciar.
      audio.tocarMusica(ASSETS.musicaMenu, 2000);
      void dica('criacao');
    },
    aoSair() {
      medirRodape.disconnect();
    },
  };
}
