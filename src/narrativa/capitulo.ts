import CAP01 from '../data/capitulos/cap01.json';
import CAP02 from '../data/capitulos/cap02.json';
import ATO1 from '../data/capitulos/ato1.json';
import CADERNO from '../data/caderno.json';
import { getEstado, type Campanha, type EstadoMissao, type ParteCapitulo, type Personagem } from '../core/estado';
import type { IdPericia } from '../core/pericias';
import { textos } from '../core/textos';
import { atrasoFinal, cestoIntacto, contador, estadoMissao, qtdItem, relacao } from '../core/progresso';

/**
 * Formato dos capítulos (src/data/capitulos/capNN.json): uma lista de cenas com fundo, música, falas,
 * escolhas (com condições, testes de perícia e batalhas) e o resumo gerado pelas flags.
 */

/** Condição para uma fala ou escolha aparecer. Escolha que não atende NÃO aparece (nem cinza). */
export interface Condicao {
  origem?: string;
  /** Uma flag ou várias (todas precisam estar marcadas). */
  flag?: string | string[];
  semFlag?: string | string[];
  /** Alguma destas flags. */
  algumaFlag?: string[];
  genero?: 'm' | 'f';
  /** Estado de missões, ex.: { "hulda": "concluida" }. */
  missao?: Record<string, EstadoMissao>;
  /** Alguma destas missões neste estado. */
  algumaMissao?: Record<string, EstadoMissao>;
  /** Cesto de pães: intacto, com pão faltando, ou sem cesto. */
  cesto?: 'intacto' | 'faltando' | 'sem';
  /** Faixa do atraso final do Capítulo 02 (com o desconto do cesto), inclusiva. */
  atrasoFinal?: [number, number];
  /** Pontos mínimos de relação, ex.: { "selene": 1 }. */
  relacaoMin?: Record<string, number>;
  /** Contadores mínimos, ex.: { "estantes": 2 }. */
  contadorMin?: Record<string, number>;
  contadorMax?: Record<string, number>;
  /** Tem estes itens (todos). */
  temItem?: string | string[];
  /** Quantidade mínima de itens, ex.: { "repolho": 5 }. */
  itemMin?: Record<string, number>;
}

export interface Efeitos {
  flag?: string | string[];
  /** Soma (ou subtrai) PV. */
  pv?: number;
  /** Define os PV (ex.: 1 depois da derrota). */
  pvDefinir?: number;
  bonusProximoTeste?: number;
  /** Pontos de relação, ex.: { "kobanu": 2 }. */
  relacao?: Record<string, number>;
  /** Marcas do relógio do atraso. */
  atraso?: number;
  /** Itens ganhos (ou perdidos, com número negativo). */
  itens?: Record<string, number>;
  reais?: number;
  missao?: Record<string, EstadoMissao>;
  /** Libera a ficha do personagem no Compêndio. */
  conhecer?: string | string[];
  /** Bestiário: criatura encontrada; `sabe` libera "O que você sabe". */
  bestiario?: { id: string; sabe?: boolean };
  contador?: Record<string, number>;
  /** Estes efeitos só contam uma vez no jogo inteiro (chave única). */
  uma_vez?: string;
  /** A voz escolhida na Forja (id do deus). */
  divindade?: string;
  /** Efeitos que só valem se a condição for verdadeira. */
  condicional?: { requer: Condicao; efeitos: Efeitos }[];
}

export interface Fala {
  /** Sem `quem`: narração. "pensamento": pensamento do herói. "heroi": fala do herói. Ou o id de um NPC. */
  quem?: string;
  /** Nome mostrado no lugar do nome do personagem ("Você (criança)", "Liessa", "{Divindade}"). */
  rotulo?: string;
  /** Expressão do NPC: usa npc-<id>-<expressao>.webp se existir; senão, o busto normal. */
  expressao?: string;
  texto: string;
  requer?: Condicao;
  efeitos?: Efeitos;
  /** Troca o fundo da cena nesta fala (com fade lento). */
  fundo?: string;
  /** Mostra o cartão de ameaça (src/data/ameacas.json). */
  ameaca?: string;
  /** Falas do mesmo grupo aparecem no máximo `limite` vezes por cena (ex.: as boas ações do sermão). */
  grupo?: string;
  limite?: number;
  /** Efeitos de tela e som ao mostrar a fala (alçapão, gritos, tragédia). */
  som?: string;
  /** Velocidade/tom do som (ex.: 0.95 = 5% mais grave). */
  somTaxa?: number;
  /** Tremor de tela; "leve" = mínimo. Sem tremor com "Tremores" desligados ou animações reduzidas. */
  tremor?: boolean | 'leve';
  /** Flash branco; "curto" = 80 ms. Sem flash com animações reduzidas. */
  flash?: boolean | 'curto';
  /** Troca de fundo seca (sem crossfade), com `fundo`. */
  corte?: boolean;
  /** A fala só avança depois de tantos ms (o toque antes disso completa o texto, mas a cena espera). */
  minimo?: number;
  /** Uma música que entra depois de um tempo, sem fade-in (ex.: "tragedia?" 1,5 s depois dos gritos). */
  musicaDepois?: { musica: string; atraso: number };
  /** Fade da música quando `musica` é null (ms). */
  musicaFade?: number;
  /** Classe visual do palco: "dessaturado", "normal", "preto", "alcapao"… */
  visual?: string;
  /** Som em loop (ex.: batida do coração); null para. */
  loop?: string | null;
  /** Troca a música; null para de uma vez (sem fade). */
  musica?: string | null;
  musicaCorte?: boolean;
  /** Abafa a música (câmera lenta). */
  abafar?: boolean;
  /** Velocidade da digitação (ms por letra; padrão 22). */
  velocidade?: number;
  /** Avança sozinha depois de tantos ms (sem esperar o toque). */
  auto?: number;
  // ---- Fase 6 ----
  /** Loop de ambiente (ex.: o fogo distante); null para, com `ambienteFade` ms de fade-out. */
  ambiente?: { som: string; ganho?: number } | null;
  /** Muda o volume do ambiente atual (ex.: o fogo mais baixo na biblioteca). */
  ambienteGanho?: number;
  ambienteFade?: number;
  /** Um efeito que toca de vez em quando (ex.: madeira estalando), entre `min` e `max` ms; null para. */
  ocasional?: { som: string; ganho?: number; min: number; max: number } | null;
  /** Silêncio antes de a fala aparecer (ms). */
  pausaAntes?: number;
  /** Mostra o busto do herói nesta fala (narração ou NPC), com esta expressão ("normal", "choque"…). */
  bustoHeroi?: string;
  /** Aura dourada no busto do herói (a visão do LEVANTE). */
  aura?: boolean;
  /** Busto do NPC escurecido (uma memória). */
  memoria?: boolean;
  /** Estilo especial da caixa: "levante" = texto grande, dourado, com tremor. */
  estilo?: string;
}

export interface Escolha {
  texto: string;
  rotulo?: string;
  requer?: Condicao;
  uma_vez?: boolean;
  efeitos?: Efeitos;
  vai_para?: string;
  teste?: { pericia: IdPericia; cd: number };
  sucesso?: string;
  falha?: string;
  batalha?: string;
  vitoria?: string;
  derrota?: string;
  mapa?: string;
  x?: number;
  y?: number;
  voltar?: boolean;
  /** Fala do herói ao escolher (aparece antes do destino). */
  fala?: string;
  /** Abre o Caderno de estudos nesta página; ao fechar, segue para o destino da escolha. */
  caderno?: string;
}

/** O que acontece depois da última fala de uma cena sem escolhas. */
export interface Seguir {
  vai_para?: string;
  /** Vai para um mapa explorável (na posição dada ou no início dele). */
  mapa?: string;
  x?: number;
  y?: number;
  /** Conversa no mapa: fecha o palco e volta a explorar. */
  voltar?: boolean;
  batalha?: string;
  vitoria?: string;
  derrota?: string;
  fim?: boolean;
  /** Texto do botão (padrão: "Continuar"). */
  texto?: string;
}

export interface Cena {
  id: string;
  /** Ilustração de fundo; sem fundo (conversa no mapa), o mapa escurecido aparece por trás. */
  fundo?: string;
  /** Classe visual do palco ao entrar (ex.: "alcapao", "dessaturado"). */
  visual?: string;
  /** "fullmun" é uma playlist; o resto é o nome do arquivo em music/; null = silêncio. */
  musica?: string | null;
  fadeMusica?: number;
  /** Vinheta (sem loop) que toca ao entrar; depois a música da cena volta. */
  vinheta?: string;
  /** Silêncio antes de a música da cena entrar (ms). */
  silencioAntes?: number;
  aoEntrar?: Efeitos & { som?: string; tremor?: boolean };
  falas: Fala[];
  escolhas?: Escolha[];
  seguir?: Seguir;
  /** Cena "de resultado": depois das falas, volta às escolhas restantes desta outra cena. */
  retorna?: string;
  /** Roteador: vai para o primeiro destino cuja condição for verdadeira (sem falas). */
  rotas?: { requer?: Condicao; vai_para: string }[];
}

export interface Capitulo {
  id: string;
  numero: number;
  titulo: string;
  /** Parte do capítulo que este arquivo cobre (o Capítulo 01 tem "fullmun" e "templo"). */
  parte?: ParteCapitulo | number;
  /** Ao terminar esta parte, segue para a próxima (cartão de local), sem a tela de fim de capítulo. */
  proximaParte?: string;
  /** Cartão de local no começo da parte (no lugar do cartão de capítulo). */
  cartaoLocal?: { titulo: string; subtitulo?: string };
  /**
   * Resumo da tela de fim de capítulo (no arquivo da primeira parte): no máximo 8 linhas, as de maior
   * `prioridade` (escolhas raras), na ordem da lista; a linha `final` vem por último, sozinha.
   */
  resumoFim?: (Condicao & { texto: string; prioridade?: number; final?: boolean })[];
  /** Quantas partes o ato tem (o Ato I tem 6). */
  totalPartes?: number;
  /** Nomes das partes de um ato, para os cards de save ({ "2": "O túnel" }). */
  nomesPartes?: Record<string, string>;
  /** Lugar do capítulo, para os cards de save ("Füllmun", "Templo de Sólem"). */
  lugar?: string;
  inicio: string;
  proximoCapitulo: { numero: number; titulo: string };
  resumo: (Condicao & { texto: string })[];
  fundoFim?: string;
  /** Música da tela de fim (null = silêncio). */
  musicaFim?: string | null;
  cenas: Cena[];
}

/**
 * Fase 6: o jogo é o Prólogo (ato 0, "Amanhecer Tardio") e os atos. O Prólogo tem duas partes, cada uma
 * no seu arquivo: Füllmun (cap01.json) e o Templo de Sólem (cap02.json). `ATOS` tem um registro por ato
 * (o da primeira parte: número, título, próximo ato e o resumo do fim); `PARTES` tem as cenas de cada parte.
 */
export const PARTES: Record<string, Capitulo> = {
  fullmun: CAP01 as unknown as Capitulo, templo: CAP02 as unknown as Capitulo, ato1: ATO1 as unknown as Capitulo,
};
export const ATOS: Record<number, Capitulo> = { 0: PARTES.fullmun, 1: PARTES.ato1 };
/** Apelido de compatibilidade (o antigo registro por capítulo). */
export const CAPITULOS = ATOS;

const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** "Prólogo", "Ato I", "Ato II"… */
export const nomeAto = (n: number): string => (n <= 0 ? textos.atos.prologo : fmtAto(n));
const fmtAto = (n: number) => textos.atos.ato.replace('{n}', ROMANOS[n] ?? String(n));

/** Título do ato ("Provação Sob a Luz"), mesmo de um ato que ainda não existe (pelo anúncio do anterior). */
export const tituloAto = (n: number): string =>
  ATOS[n]?.titulo ?? Object.values(ATOS).find((a) => a.proximoCapitulo.numero === n)?.proximoCapitulo.titulo ?? '';

/** O arquivo de cenas que vale agora (a parte do Prólogo, ou o ato). */
export function parteAtual(c: Pick<Campanha, 'ato' | 'parte'> = getEstado().campanha): Capitulo {
  if (c.ato === 0) return PARTES[typeof c.parte === 'string' ? c.parte : 'fullmun'] ?? PARTES.fullmun;
  return ATOS[c.ato] ?? PARTES.fullmun;
}

/** As partes (arquivos de cenas) de um ato, em ordem. */
export function partesDo(numero: number): Capitulo[] {
  const r: Capitulo[] = [];
  for (let cap: Capitulo | undefined = ATOS[numero]; cap; cap = cap.proximaParte ? PARTES[cap.proximaParte] : undefined) r.push(cap);
  return r;
}

/** Procura a cena em todas as partes (as conversas do mapa podem ser de qualquer uma). */
export function cenaGlobal(id: string): { cap: Capitulo; cena: Cena } | null {
  for (const cap of Object.values(PARTES)) {
    const cena = cap.cenas.find((x) => x.id === id);
    if (cena) return { cap, cena };
  }
  return null;
}

export function cenaPorId(cap: Capitulo, id: string): Cena {
  const c = cap.cenas.find((x) => x.id === id);
  if (!c) throw new Error(`Cena desconhecida: ${id}`);
  return c;
}

export function atende(cond: Condicao | undefined, p: Personagem | null = getEstado().personagem): boolean {
  if (!cond) return true;
  const flags = getEstado().campanha.flags;
  const lista = (x: string | string[] | undefined) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
  if (cond.origem && p?.origem !== cond.origem) return false;
  if (cond.genero && p?.genero !== cond.genero) return false;
  if (lista(cond.flag).some((f) => !flags.includes(f))) return false;
  if (lista(cond.semFlag).some((f) => flags.includes(f))) return false;
  if (cond.algumaFlag && !cond.algumaFlag.some((f) => flags.includes(f))) return false;
  if (cond.missao && Object.entries(cond.missao).some(([id, e]) => estadoMissao(id) !== e)) return false;
  if (cond.algumaMissao && !Object.entries(cond.algumaMissao).some(([id, e]) => estadoMissao(id) === e)) return false;
  if (cond.cesto) {
    const atual = cestoIntacto() ? 'intacto' : qtdItem('cesto-paes') > 0 || flags.includes('comeu_pao') ? 'faltando' : 'sem';
    if (atual !== cond.cesto) return false;
  }
  if (cond.atrasoFinal) {
    const a = atrasoFinal();
    if (a < cond.atrasoFinal[0] || a > cond.atrasoFinal[1]) return false;
  }
  if (cond.relacaoMin && Object.entries(cond.relacaoMin).some(([id, n]) => relacao(id) < n)) return false;
  if (cond.contadorMin && Object.entries(cond.contadorMin).some(([id, n]) => contador(id) < n)) return false;
  if (cond.contadorMax && Object.entries(cond.contadorMax).some(([id, n]) => contador(id) > n)) return false;
  if (lista(cond.temItem).some((i) => qtdItem(i) <= 0)) return false;
  if (cond.itemMin && Object.entries(cond.itemMin).some(([id, n]) => qtdItem(id) < n)) return false;
  return true;
}

/**
 * Variáveis do texto: {nome} é o nome do herói; {a|b} flexiona pelo gênero do herói (o primeiro termo
 * para homem, o segundo para mulher). Ex.: "{garoto|garota}".
 */
export function interpolar(texto: string, p: Personagem | null = getEstado().personagem): string {
  return texto
    .replace(/\{nome\}/g, p?.nome ?? 'Herói')
    .replace(/\{[Dd]ivindade\}/g, () => dadosDeus(getEstado().campanha.divindade)?.nome ?? 'Sólem')
    .replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_m, a: string, b: string) => (p?.genero === 'f' ? b : a));
}

/** Os deuses do Caderno (nome, Alfar ou Baldur, domínio e imagem do panteão). */
export interface DadosDeus { id: string; nome: string; grupo: 'alfar' | 'baldur'; dominio: string; imagem: string }
const PAGINAS = (CADERNO as unknown as { paginas: { id: string; deus?: { nome: string; grupo: 'alfar' | 'baldur'; dominio: string }; imagem?: string }[] }).paginas;
export function dadosDeus(id: string | null | undefined): DadosDeus | null {
  const p = PAGINAS.find((x) => x.id === id && x.deus);
  return p?.deus ? { id: p.id, ...p.deus, imagem: p.imagem ?? p.id } : null;
}

/** Linhas do resumo de uma parte (Diário), pelas flags. */
export function resumoDoCapitulo(cap: Capitulo): string[] {
  return cap.resumo.filter((r) => atende(r)).map((r) => interpolar(r.texto));
}

/** O Diário: um resumo só do capítulo, crescendo ao longo das partes (sem repetir linhas). */
export function resumoDoDiario(numero: number): string[] {
  return [...new Set(partesDo(numero).flatMap(resumoDoCapitulo))];
}

/**
 * Resumo da tela de fim de capítulo: até 8 linhas. As de maior prioridade (escolhas raras) entram
 * primeiro; aparecem na ordem da lista, e a linha final (a Nyme) vem por último, sozinha.
 */
export function resumoDoFim(numero: number, max = 8): string[] {
  const cap = ATOS[numero];
  if (!cap?.resumoFim) return resumoDoDiario(numero).slice(0, max);
  const valem = cap.resumoFim.filter((r) => atende(r));
  const finais = valem.filter((r) => r.final);
  const outras = valem.map((r, i) => ({ r, i })).filter(({ r }) => !r.final);
  const escolhidas = [...outras]
    .sort((a, b) => (b.r.prioridade ?? 1) - (a.r.prioridade ?? 1) || a.i - b.i)
    .slice(0, Math.max(0, max - finais.length))
    .sort((a, b) => a.i - b.i)
    .map(({ r }) => r);
  return [...escolhidas, ...finais].map((r) => interpolar(r.texto));
}
