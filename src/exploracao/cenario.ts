import Phaser from 'phaser';
import { dentroDoPoligono } from './geometria';
import type { ObjetoMontado } from './montagem';
import type { Ponto } from './tipos';

/**
 * Objetos do cenário (Fase 5): cada objeto é um sprite do atlas, ancorado no centro da base e ordenado
 * junto com os personagens pela linha de profundidade (y-sort de verdade). Árvores com copa ficam
 * translúcidas (60%) quando alguém passa atrás. As animações (fumaça, fogo, lanternas, varal, copas e
 * riacho) são feitas por código e desligam com "Animações reduzidas".
 */

export interface OpcoesCenario {
  chaveAtlas: string;
  quadros: Record<string, { x: number; y: number; w: number; h: number }>;
  objetos: ObjetoMontado[];
  animacoes: boolean;
  /** Polígonos de água (o brilho do riacho). */
  agua?: Ponto[][];
}

export interface SpriteCenario { o: ObjetoMontado; img: Phaser.GameObjects.Image; partes?: Phaser.GameObjects.Image[]; translucido: boolean }

/**
 * Objetos rasteiros (canteiros, plantações, degraus, pedras baixas): não cobrem ninguém, então vão todos
 * para uma textura só, desenhada logo acima do chão. Menos objetos por quadro (desempenho no celular).
 */
const RASTEIROS = /^(canteiro|abobora|repolho|verduras|degraus|feno|cocho)/;
/** Margem (px do mapa) além da câmera em que os objetos continuam desenhados. */
const MARGEM_VISTA = 260;

const ALFA_COPA = 0.6;

export class Cenario {
  readonly sprites: SpriteCenario[] = [];
  private mascara: Uint8ClampedArray | null = null;
  private larguraAtlas = 0;
  private extras: (Phaser.GameObjects.GameObject & { x?: number; y?: number })[] = [];
  private rasteiros: Phaser.GameObjects.RenderTexture | null = null;
  private quadro = 0;

  constructor(private cena: Phaser.Scene, private o: OpcoesCenario) {
    const tex = cena.textures.get(o.chaveAtlas);
    for (const [id, q] of Object.entries(o.quadros)) if (!tex.has(id)) tex.add(id, 0, q.x, q.y, q.w, q.h);
    this.criarTexturas();
    this.assarRasteiros(o.objetos.filter((x) => this.ehRasteiro(x)));
    for (const obj of o.objetos) if (!this.ehRasteiro(obj)) this.criar(obj);
    if (o.animacoes) this.animarAgua();
  }

  private ehRasteiro(o: ObjetoMontado) { return RASTEIROS.test(o.id) && !o.copa && !o.animacao.length; }
  /** No editor, cada objeto precisa ser um sprite próprio (para arrastar). */
  static semAssar = false;

  /** Desenha os objetos rasteiros numa textura do tamanho da área deles. */
  private assarRasteiros(lista: ObjetoMontado[]) {
    if (!lista.length || Cenario.semAssar) { for (const o of lista) this.criar(o); return; }
    const caixas = lista.map((o) => { const q = this.o.quadros[o.id]; return { o, q, x: o.x - q.w / 2, y: o.y - q.h }; });
    const x0 = Math.floor(Math.min(...caixas.map((c) => c.x))), y0 = Math.floor(Math.min(...caixas.map((c) => c.y)));
    const x1 = Math.ceil(Math.max(...caixas.map((c) => c.x + c.q.w))), y1 = Math.ceil(Math.max(...caixas.map((c) => c.y + c.q.h)));
    const rt = this.cena.add.renderTexture(x0, y0, x1 - x0, y1 - y0).setOrigin(0).setDepth(-90_000);
    for (const c of caixas.sort((a, b) => a.o.profundidade - b.o.profundidade)) {
      const img = this.cena.make.image({ x: 0, y: 0, key: this.o.chaveAtlas, frame: c.o.id }, false).setOrigin(0).setFlipX(!!c.o.espelhar);
      rt.draw(img, c.x - x0, c.y - y0);
      img.destroy();
    }
    this.rasteiros = rt;
  }

  /** A cada poucos quadros: só desenha o que está perto da câmera (objetos, brilhos, partículas). */
  recortarVista() {
    if (++this.quadro % 6) return;
    const v = this.cena.cameras.main.worldView;
    const x0 = v.x - MARGEM_VISTA, x1 = v.right + MARGEM_VISTA, y0 = v.y - MARGEM_VISTA, y1 = v.bottom + MARGEM_VISTA * 1.6;
    for (const s of this.sprites) {
      const q = this.o.quadros[s.o.id];
      const perto = s.o.x + q.w / 2 > x0 && s.o.x - q.w / 2 < x1 && s.o.y > y0 && s.o.y - q.h < y1;
      if (s.partes) s.partes.forEach((p) => p.setVisible(perto));
      else s.img.setVisible(perto);
    }
    for (const e of this.extras) {
      if (e.x === undefined || e.y === undefined) continue;
      const perto = e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1;
      (e as unknown as Phaser.GameObjects.Components.Visible).setVisible?.(perto);
      if ('emitting' in e) (e as unknown as Phaser.GameObjects.Particles.ParticleEmitter).emitting = perto;
    }
  }

  /** Cria (ou recria, no editor) o sprite de um objeto. */
  criar(obj: ObjetoMontado): SpriteCenario | null {
    if (!this.o.quadros[obj.id]) return null;
    const img = this.cena.add.image(obj.x, obj.y, this.o.chaveAtlas, obj.id).setOrigin(0.5, 1).setDepth(obj.profundidade).setFlipX(!!obj.espelhar);
    const s: SpriteCenario = { o: obj, img, translucido: false };
    this.sprites.push(s);
    if (this.o.animacoes) this.animar(s);
    return s;
  }

  remover(s: SpriteCenario) {
    this.cena.tweens.killTweensOf(s.img);
    s.img.destroy();
    s.partes?.forEach((p) => p.destroy());
    const k = this.sprites.indexOf(s);
    if (k >= 0) this.sprites.splice(k, 1);
  }

  /* ------------------------------------------------------------ transparência das copas e cobertura */

  /** Lê o alfa do atlas uma vez (para medir quanto de um personagem um objeto cobre). */
  private alfa(): Uint8ClampedArray {
    if (this.mascara) return this.mascara;
    const fonte = this.cena.textures.get(this.o.chaveAtlas).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const cv = document.createElement('canvas');
    cv.width = fonte.width;
    cv.height = fonte.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(fonte, 0, 0);
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
    this.mascara = new Uint8ClampedArray(cv.width * cv.height);
    for (let i = 0; i < this.mascara.length; i++) this.mascara[i] = px[i * 4 + 3];
    this.larguraAtlas = cv.width;
    return this.mascara;
  }

  /** O pixel (x, y) do mapa é opaco no objeto `s`? */
  opaco(s: SpriteCenario, x: number, y: number): boolean {
    const q = this.o.quadros[s.o.id];
    if (!q) return false;
    let lx = Math.floor(x - (s.o.x - q.w / 2));
    const ly = Math.floor(y - (s.o.y - q.h));
    if (lx < 0 || ly < 0 || lx >= q.w || ly >= q.h) return false;
    if (s.o.espelhar) lx = q.w - 1 - lx;
    return this.alfa()[(q.y + ly) * this.larguraAtlas + q.x + lx] > 128;
  }

  /** Objetos desenhados na frente de quem tem os pés em `y` (e que cruzam a caixa `b`). */
  naFrente(y: number, b: Phaser.Geom.Rectangle, mesmoForaDaVista = false): SpriteCenario[] {
    return this.sprites.filter((s) => s.o.profundidade > y && (mesmoForaDaVista || s.img.visible || !!s.partes) && Phaser.Geom.Intersects.RectangleToRectangle(b, s.img.getBounds()));
  }

  /** Copas a 60% enquanto alguém (herói, seguidor, morador perto) está atrás delas. */
  atualizarCopas(atores: Phaser.GameObjects.Sprite[]) {
    for (const s of this.sprites) {
      if (!s.o.copa) continue;
      let atras = false;
      const caixa = s.img.getBounds();
      for (const a of atores) {
        if (!a.active || !a.visible || a.y >= s.o.profundidade) continue;
        const b = a.getBounds();
        if (!Phaser.Geom.Intersects.RectangleToRectangle(b, caixa)) continue;
        // Algum ponto do personagem sob um pixel opaco da copa?
        for (let yy = b.top; yy < b.bottom && !atras; yy += 4) for (let xx = b.left; xx < b.right && !atras; xx += 4) if (this.opaco(s, xx, yy)) atras = true;
        if (atras) break;
      }
      if (atras !== s.translucido) {
        s.translucido = atras;
        this.cena.tweens.add({ targets: [s.img, ...(s.partes ?? [])], alpha: atras ? ALFA_COPA : 1, duration: 150, ease: 'Sine.easeOut' });
      }
    }
  }

  /* ------------------------------------------------------------ animações */

  private criarTexturas() {
    const t = this.cena.textures;
    if (!t.exists('cen-fumaca')) {
      const g = this.cena.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xdddddd, 1).fillCircle(16, 16, 16);
      g.generateTexture('cen-fumaca', 32, 32);
      g.destroy();
    }
    if (!t.exists('cen-brilho')) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const ctx = cv.getContext('2d')!;
      const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,220,140,1)');
      gr.addColorStop(0.35, 'rgba(255,170,60,0.55)');
      gr.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 128, 128);
      t.addCanvas('cen-brilho', cv);
    }
    if (!t.exists('cen-fagulha')) {
      const g = this.cena.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffc060, 1).fillRect(0, 0, 3, 3);
      g.generateTexture('cen-fagulha', 3, 3);
      g.destroy();
    }
  }

  private ponto(s: SpriteCenario, ax = 0, ay = 0) {
    const q = this.o.quadros[s.o.id];
    const fx = s.o.espelhar ? -ax : ax;
    return { x: s.o.x + fx * q.w, y: s.o.y + ay * q.h };
  }

  private animar(s: SpriteCenario) {
    const cena = this.cena;
    const prof = s.o.profundidade;
    for (const a of s.o.animacao) {
      if (a.tipo === 'fumaca') {
        const p = this.ponto(s, a.x, a.y);
        const em = cena.add.particles(p.x, p.y, 'cen-fumaca', {
          speedY: { min: -26, max: -14 }, speedX: { min: -5, max: 9 }, scale: { start: 0.28, end: 1.1 },
          alpha: { start: 0.42, end: 0 }, lifespan: 2800, frequency: 320, tint: 0xd8d4cc,
        }).setDepth(prof + 0.6);
        this.extras.push(em);
      } else if (a.tipo === 'fogo' || a.tipo === 'lanterna') {
        const p = this.ponto(s, a.x, a.y);
        const r = a.raio ?? 26;
        const brilho = cena.add.image(p.x, p.y, 'cen-brilho').setBlendMode(Phaser.BlendModes.ADD).setDepth(prof + 0.5)
          .setScale((r * 2) / 128).setAlpha(a.tipo === 'fogo' ? 0.55 : 0.42);
        cena.tweens.add({
          targets: brilho, alpha: a.tipo === 'fogo' ? 0.85 : 0.6, scale: ((r * 2) / 128) * 1.08,
          duration: a.tipo === 'fogo' ? 340 + Math.random() * 200 : 1300 + Math.random() * 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        this.extras.push(brilho);
        if (a.tipo === 'fogo') {
          const fag = cena.add.particles(p.x, p.y, 'cen-fagulha', {
            speedY: { min: -60, max: -30 }, speedX: { min: -14, max: 14 }, lifespan: 750, frequency: 420, alpha: { start: 1, end: 0 }, blendMode: 'ADD',
          }).setDepth(prof + 0.6);
          this.extras.push(fag);
        }
      } else if (a.tipo === 'balanco') {
        // Balanço muito sutil, com fase e ritmo diferentes em cada árvore.
        s.img.setAngle(-0.6);
        cena.tweens.add({ targets: s.img, angle: 0.6, duration: 2400 + Math.random() * 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 2000 });
      } else if (a.tipo === 'varal') {
        this.animarVaral(s);
      }
    }
  }

  /** Roupas no varal: o sprite vira faixas verticais que balançam com fases diferentes. */
  private animarVaral(s: SpriteCenario) {
    const q = this.o.quadros[s.o.id];
    const tex = this.cena.textures.get(this.o.chaveAtlas);
    const N = 8;
    const larg = Math.ceil(q.w / N);
    s.img.setVisible(false);
    s.partes = [];
    for (let k = 0; k < N; k++) {
      const nome = `${s.o.id}#faixa${k}`;
      const w = Math.min(larg, q.w - k * larg);
      if (w <= 0) break;
      if (!tex.has(nome)) tex.add(nome, 0, q.x + k * larg, q.y, w, q.h);
      const x0 = s.o.espelhar ? s.o.x + q.w / 2 - (k + 1) * larg + (larg - w) : s.o.x - q.w / 2 + k * larg;
      const parte = this.cena.add.image(x0, s.o.y, this.o.chaveAtlas, nome).setOrigin(0, 1).setDepth(s.o.profundidade).setFlipX(!!s.o.espelhar);
      // As pontas (postes) quase não mexem; o meio balança mais.
      const amp = Math.sin((Math.PI * (k + 0.5)) / N) * 1.6;
      this.cena.tweens.add({ targets: parte, y: s.o.y - amp, duration: 900 + k * 40, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: k * 110 });
      s.partes.push(parte);
    }
  }

  /** Brilhos correndo na água (desenhados por cima do chão, só onde é riacho). */
  private animarAgua() {
    for (const pol of this.o.agua ?? []) {
      const xs = pol.map((p) => p[0]), ys = pol.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const n = Math.min(70, Math.round(((x1 - x0) * (y1 - y0)) / 6000));
      for (let i = 0; i < n; i++) {
        let x = 0, y = 0, ok = false;
        for (let t = 0; t < 20 && !ok; t++) { x = x0 + Math.random() * (x1 - x0); y = y0 + Math.random() * (y1 - y0); ok = dentroDoPoligono(x, y, pol); }
        if (!ok) continue;
        const brilho = this.cena.add.ellipse(x, y, 10 + Math.random() * 14, 2, 0xffffff, 0).setDepth(-50_000).setBlendMode(Phaser.BlendModes.ADD);
        this.cena.tweens.add({
          targets: brilho, alpha: { from: 0, to: 0.55 }, x: x + 14 + Math.random() * 10, duration: 1100 + Math.random() * 900,
          yoyo: true, repeat: -1, delay: Math.random() * 2500, ease: 'Sine.easeInOut',
        });
        this.extras.push(brilho);
      }
    }
  }

  destruirRasteiros() { this.rasteiros?.destroy(); this.rasteiros = null; }

  /** Liga ou desliga as animações (Opções → Animações reduzidas), sem remontar o mapa. */
  definirAnimacoes(sim: boolean) {
    if (sim === this.o.animacoes) return;
    this.o.animacoes = sim;
    this.extras.forEach((e) => e.destroy());
    this.extras = [];
    for (const s of this.sprites) {
      this.cena.tweens.killTweensOf(s.img);
      s.img.setAngle(0);
      s.partes?.forEach((p) => p.destroy());
      s.partes = undefined;
      s.img.setVisible(true);
      if (sim) this.animar(s);
    }
    if (sim) this.animarAgua();
  }
}
