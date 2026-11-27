import { botaoMenu, h } from '../core/ui';

/**
 * Entrada da exploração, em HTML por cima do canvas:
 * - teclado: setas/WASD (andar), E/Espaço (interagir), Esc (pausa);
 * - toque: joystick virtual (canto inferior esquerdo), botão ✦ de interação (canto inferior direito,
 *   só aparece perto de algo) e botão de pausa (canto superior).
 * Tocar no mapa não move o herói.
 */
export interface OpcoesControles {
  raiz: HTMLElement;
  toque: boolean;
  rotuloInteragir: string;
  rotuloPausa: string;
  aoInteragir: () => void;
  aoPausar: () => void;
  /** Fase lateral (Fase 6): Espaço pula (E interage) e aparece o botão PULAR (Fase 6B: também no PC). */
  aoPular?: () => void;
  rotuloPular?: string;
  /** Dica da tecla embaixo do botão PULAR no PC ("Espaço"). */
  teclaPular?: string;
}

const TECLAS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

export class Controles {
  private apertadas = new Set<string>();
  private joy = { x: 0, y: 0 };
  private ponteiroJoy: number | null = null;
  private habilitado = true;
  readonly joystick: HTMLElement;
  readonly botaoInteragir: HTMLButtonElement;
  readonly botaoPausa: HTMLButtonElement;
  readonly botaoPular: HTMLButtonElement | null = null;
  private pino: HTMLElement;
  private limpar: (() => void)[] = [];

  constructor(private o: OpcoesControles) {
    this.pino = h('div', { class: 'joystick-pino' });
    this.joystick = h('div', { class: 'joystick', 'aria-hidden': 'true', hidden: !o.toque }, this.pino);
    this.botaoInteragir = h('button', { type: 'button', class: 'btn-interagir', 'aria-label': o.rotuloInteragir, hidden: true },
      h('span', { class: 'btn-interagir-icone', 'aria-hidden': 'true' }, '✦'),
      o.toque ? null : h('span', { class: 'btn-interagir-tecla', 'aria-hidden': 'true' }, 'E'));
    this.botaoPausa = botaoMenu();
    o.raiz.append(this.joystick, this.botaoInteragir, this.botaoPausa);
    if (o.aoPular) {
      // Fase 6B: o botão aparece sempre (no PC, clicável, com a tecla embaixo).
      this.botaoPular = h('button', { type: 'button', class: 'btn-pular', 'aria-label': o.rotuloPular ?? 'Pular' },
        h('span', { class: 'btn-pular-texto' }, o.rotuloPular ?? 'PULAR'),
        o.toque || !o.teclaPular ? null : h('span', { class: 'btn-pular-tecla', 'aria-hidden': 'true' }, o.teclaPular));
      o.raiz.append(this.botaoPular);
      this.ouvir(this.botaoPular, 'pointerdown', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.habilitado) o.aoPular?.();
      });
    }

    this.ouvir(window, 'keydown', (e: KeyboardEvent) => this.teclaDesce(e));
    this.ouvir(window, 'keyup', (e: KeyboardEvent) => this.apertadas.delete(e.code));
    this.ouvir(window, 'blur', () => this.apertadas.clear());
    this.ouvir(this.botaoInteragir, 'click', (e: Event) => {
      e.stopPropagation();
      if (this.habilitado) o.aoInteragir();
    });
    this.ouvir(this.botaoPausa, 'click', (e: Event) => {
      e.stopPropagation();
      o.aoPausar();
    });
    this.ouvir(this.joystick, 'pointerdown', (e: PointerEvent) => this.joyInicio(e));
    this.ouvir(this.joystick, 'pointermove', (e: PointerEvent) => this.joyMove(e));
    this.ouvir(this.joystick, 'pointerup', (e: PointerEvent) => this.joyFim(e));
    this.ouvir(this.joystick, 'pointercancel', (e: PointerEvent) => this.joyFim(e));
    // Se o navegador tirar o dedo do joystick sem pointerup (o joystick some atrás de uma conversa, no
    // iOS), o joystick não pode ficar "apertado" para sempre.
    this.ouvir(this.joystick, 'lostpointercapture', (e: PointerEvent) => this.joyFim(e));
    // Se a pessoa tocar na tela num aparelho híbrido, o joystick aparece.
    this.ouvir(window, 'touchstart', () => { this.joystick.hidden = false; }, { passive: true, once: true });
  }

  private ouvir<E extends Event>(alvo: EventTarget, tipo: string, fn: (e: E) => void, opcoes?: AddEventListenerOptions) {
    alvo.addEventListener(tipo, fn as EventListener, opcoes);
    this.limpar.push(() => alvo.removeEventListener(tipo, fn as EventListener, opcoes));
  }

  private teclaDesce(e: KeyboardEvent) {
    if (e.code in TECLAS) {
      this.apertadas.add(e.code);
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Space' && this.o.aoPular) {
      // Fase lateral: Espaço pula (o diálogo aberto continua avançando com Espaço: o palco trata antes).
      if (e.defaultPrevented || performance.now() - this.religadoEm < 150) { e.preventDefault(); return; }
      e.preventDefault();
      if (this.habilitado) this.o.aoPular();
      return;
    }
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
      // Enter num botão focado (pausa, Opções) não deve virar interação.
      if (e.code === 'Enter' && document.activeElement instanceof HTMLButtonElement) return;
      // A mesma tecla que avançou ou fechou um diálogo não interage (nem reabre a conversa logo depois).
      if (e.defaultPrevented || performance.now() - this.religadoEm < 150) { e.preventDefault(); return; }
      e.preventDefault();
      if (this.habilitado) this.o.aoInteragir();
    } else if (e.code === 'Escape') {
      this.o.aoPausar();
    }
  }

  private joyInicio(e: PointerEvent) {
    this.ponteiroJoy = e.pointerId;
    try { this.joystick.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético (testes) */ }
    this.joystick.classList.add('ativo');
    this.joyMove(e);
  }

  private joyMove(e: PointerEvent) {
    if (e.pointerId !== this.ponteiroJoy) return;
    // Com o controle desligado (conversa aberta), o dedo que continua no joystick não guarda direção.
    if (!this.habilitado) return;
    const r = this.joystick.getBoundingClientRect();
    const raio = r.width / 2;
    let dx = (e.clientX - (r.left + raio)) / raio;
    let dy = (e.clientY - (r.top + raio)) / raio;
    const d = Math.hypot(dx, dy);
    if (d > 1) { dx /= d; dy /= d; }
    this.joy = d < 0.18 ? { x: 0, y: 0 } : { x: dx, y: dy };
    this.pino.style.transform = `translate(${dx * raio * 0.55}px, ${dy * raio * 0.55}px)`;
  }

  private joyFim(e: PointerEvent) {
    if (e.pointerId !== this.ponteiroJoy) return;
    this.ponteiroJoy = null;
    this.joy = { x: 0, y: 0 };
    this.pino.style.transform = '';
    this.joystick.classList.remove('ativo');
  }

  /** Direção desejada, com módulo até 1 (diagonal normalizada). */
  vetor(): { x: number; y: number } {
    if (!this.habilitado) return { x: 0, y: 0 };
    let x = this.joy.x;
    let y = this.joy.y;
    for (const c of this.apertadas) {
      const t = TECLAS[c];
      if (t) { x += t[0]; y += t[1]; }
    }
    const d = Math.hypot(x, y);
    return d > 1 ? { x: x / d, y: y / d } : { x, y };
  }

  /** Mostra o botão ✦ (perto de algo interativo). */
  mostrarInteracao(sim: boolean) {
    this.botaoInteragir.hidden = !sim;
  }

  /** Durante cenas sem controle (clímax), tudo fica desligado. */
  /** Quando o controle voltou (fim de um diálogo): as teclas de interação esperam 150 ms. */
  private religadoEm = -Infinity;

  habilitar(sim: boolean) {
    if (sim && !this.habilitado) this.religadoEm = performance.now();
    this.habilitado = sim;
    // Ao desligar e ao religar, zera tudo: nenhuma tecla ou dedo de antes da conversa continua andando.
    this.apertadas.clear();
    this.joy = { x: 0, y: 0 };
    this.ponteiroJoy = null;
    this.pino.style.transform = '';
    this.joystick.classList.remove('ativo');
    this.o.raiz.classList.toggle('sem-controle', !sim);
  }

  /** O jogador tem o controle agora? */
  get ativo(): boolean {
    return this.habilitado;
  }

  destruir() {
    this.limpar.forEach((f) => f());
    this.limpar = [];
    this.joystick.remove();
    this.botaoInteragir.remove();
    this.botaoPausa.remove();
    this.botaoPular?.remove();
  }
}
