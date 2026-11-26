import { audio } from './audio';
import { forcarD20 } from './dados';
import { atualizarCampanha, getEstado, type EstadoMissao } from './estado';
import { avisosRecentes } from './toasts';
import { darItem, definirMissao, somarAtraso } from './progresso';
import { definirRelogio, listarSlots } from './saves';
import { estadoTutorial } from './tutorial';
import { estadoCaderno } from './caderno';
import { estadoEtapas } from './etapas';

/**
 * Ganchos de teste (só com ?test=1), comuns a todas as telas do jogo. Cada tela acrescenta os seus
 * (goto, state, avancar…) por cima destes.
 */
export const modoTeste = (): boolean => new URLSearchParams(location.search).has('test');

/** Estado comum do progresso (relações, inventário, atraso…), incluído no state() de cada tela. */
export function estadoProgresso() {
  const c = getEstado().campanha;
  return {
    ato: c.ato,
    /** Apelido de compatibilidade dos testes antigos: o Prólogo era o Capítulo 01. */
    capitulo: c.ato + 1,
    parte: c.parte ?? null,
    flags: [...c.flags],
    pv: c.pvAtual,
    atraso: c.atraso,
    missoes: { ...c.missoes },
    inventario: { ...c.inventario },
    reais: c.reais,
    relacoes: { ...c.relacoes },
    compendio: JSON.parse(JSON.stringify(c.compendio)),
    contadores: { ...c.contadores },
    local: { ...c.local },
    toasts: avisosRecentes(),
    musica: audio.estadoMusica(),
    efeitos: audio.efeitosRecentes(),
    musicaAbafada: audio.abafada,
    duracaoGritos: audio.duracaoEfeito('gritos-fullmun'),
    tutorial: estadoTutorial(),
    erro: !!document.querySelector('.tela-erro'),
    caderno: { ...estadoCaderno(), tela: telaCaderno() },
    etapas: estadoEtapas(),
  };
}

/** O caderno aberto na tela (aba e páginas visíveis), ou null. */
function telaCaderno() {
  const f = document.querySelector<HTMLElement>('.caderno-fundo:not(.saindo)');
  if (!f) return null;
  return { aba: f.dataset.aba ?? null, paginas: (f.dataset.pagina ?? '').split(' ').filter(Boolean), imagemCheia: !!f.querySelector('.caderno-imagem-cheia') };
}

/** Saves (Fase 4B): metadados dos 3 slots e o relógio simulado (para o "há 3 dias"). */
const ganchosSaves = () => ({
  saves: () => listarSlots().map((s) => (s.estado === 'ok' ? { slot: s.slot, estado: s.estado, ...s.meta } : { slot: s.slot, estado: s.estado })),
  setRelogio: (iso: string | null) => definirRelogio(iso),
});

/** Ganchos mínimos (telas sem ganchos próprios, como o menu): saves e relógio. */
export function registrarGanchosBase(): void {
  const w = window as unknown as { __fdg?: Record<string, unknown> };
  if (!modoTeste() || w.__fdg) return;
  w.__fdg = { ...ganchosSaves(), state: () => ({ ...estadoProgresso(), tela: null }) };
}

export function registrarGanchos(extra: Record<string, unknown>): void {
  if (!modoTeste()) return;
  (window as unknown as { __fdg: unknown }).__fdg = {
    ...ganchosSaves(),
    forceRoll: (v: number[]) => forcarD20(v),
    pularFaixa: () => audio.pularParaOFim(),
    setAtraso: (n: number) => somarAtraso(n - getEstado().campanha.atraso),
    setRelacao: (id: string, n: number) => atualizarCampanha({ relacoes: { ...getEstado().campanha.relacoes, [id]: n } }),
    giveItem: (id: string, qtd = 1) => darItem(id, qtd),
    setFlag: (f: string) => { if (!getEstado().campanha.flags.includes(f)) atualizarCampanha({ flags: [...getEstado().campanha.flags, f] }); },
    setMissao: (id: string, e: EstadoMissao) => definirMissao(id, e),
    ...extra,
  };
}
