import { audio } from '../core/audio';
import { h } from '../core/ui';

export interface Fala {
  /** Sem título: a caixa aparece sem a faixa do nome (ex.: "O escolhido…"). */
  titulo?: string;
  texto: string;
  /** Cor da borda e do título. */
  cor: string;
  /** Letras por segundo (padrão 38). */
  velocidade?: number;
  /** Se falso, cliques não completam nem fecham (o clímax controla a caixa). */
  interativa?: boolean;
  aoFechar?: () => void;
}

/**
 * Caixa de fala na parte de baixo da tela, com o texto aparecendo letra por letra.
 * Um clique/toque (ou E/Espaço) completa o texto; outro fecha.
 */
export class CaixaFala {
  readonly el: HTMLElement;
  private titulo: HTMLElement;
  private texto: HTMLElement;
  private seta: HTMLElement;
  private fala: Fala | null = null;
  private mostradas = 0;
  private timer = 0;
  private completa = false;

  constructor(raiz: HTMLElement) {
    this.titulo = h('div', { class: 'fala-titulo' });
    this.texto = h('p', { class: 'fala-texto' });
    this.seta = h('span', { class: 'fala-seta', 'aria-hidden': 'true' }, '▾');
    this.el = h('div', { class: 'caixa-fala', role: 'dialog', 'aria-live': 'polite', hidden: true }, this.titulo, this.texto, this.seta,
      h('span', { class: 'dica-tecla', 'aria-hidden': 'true' }, 'Espaço ▸'));
    window.addEventListener('keydown', this.tecla, true);
    this.el.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      this.avancar();
    });
    raiz.append(this.el);
  }

  /** Espaço e Enter completam o texto e, depois, fecham a fala (na captura: o mapa não interage junto). */
  private tecla = (e: KeyboardEvent) => {
    if (!this.fala || (e.key !== ' ' && e.key !== 'Enter') || document.querySelector('.modal-fundo, .dica-tutorial')) return;
    e.preventDefault();
    if (e.repeat) return;
    this.avancar();
  };

  get aberta(): boolean {
    return this.fala !== null;
  }

  mostrar(fala: Fala) {
    clearInterval(this.timer);
    this.fala = fala;
    this.mostradas = 0;
    this.completa = false;
    this.titulo.textContent = fala.titulo ?? '';
    this.titulo.hidden = !fala.titulo;
    this.texto.textContent = '';
    this.el.style.setProperty('--cor-fala', fala.cor);
    this.el.classList.toggle('sem-titulo', !fala.titulo);
    this.el.classList.remove('completa');
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('visivel'));
    const letras = Array.from(fala.texto);
    const intervalo = 1000 / (fala.velocidade ?? 38);
    this.timer = window.setInterval(() => {
      this.mostradas++;
      this.texto.textContent = letras.slice(0, this.mostradas).join('');
      if (this.mostradas % 3 === 1 && letras[this.mostradas - 1]?.trim()) audio.sfx('text-blip', { taxa: 0.95 + Math.random() * 0.1, ganho: 0.6 });
      if (this.mostradas >= letras.length) this.terminarTexto();
    }, intervalo);
  }

  private terminarTexto() {
    clearInterval(this.timer);
    if (!this.fala) return;
    this.texto.textContent = this.fala.texto;
    this.completa = true;
    this.el.classList.add('completa');
  }

  /** Completa o texto; se já estiver completo, fecha. */
  avancar() {
    if (!this.fala || this.fala.interativa === false) return;
    if (!this.completa) this.terminarTexto();
    else this.fechar();
  }

  fechar() {
    if (!this.fala) return;
    clearInterval(this.timer);
    const aoFechar = this.fala.aoFechar;
    this.fala = null;
    this.el.classList.remove('visivel');
    this.el.hidden = true;
    aoFechar?.();
  }

  destruir() {
    window.removeEventListener('keydown', this.tecla, true);
    clearInterval(this.timer);
    this.fala = null;
    this.el.remove();
  }
}
