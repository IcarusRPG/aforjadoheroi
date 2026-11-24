import type Phaser from 'phaser';

/**
 * Fase 5B: marcas que chamam a atenção no mapa.
 * - Balões de missão (! … ?) e o "!" vermelho de destino: balão escuro arredondado com borda colorida.
 * - Destaque de itens: contorno claro de 1 px, flutuação, brilho pulsante, faíscas e seta de missão.
 * - Anel de luz no chão (alçapão).
 * Tudo desenhado por código (texturas em canvas, criadas uma vez por cena). Sem import do Phaser em tempo
 * de execução: o pacote do Phaser continua carregando só quando o mapa abre.
 */

export type TipoBalao = '!' | '…' | '?' | '!vermelho';

const ESTILO: Record<TipoBalao, { borda: string; simbolo: string; texto: string; brilho: number | null; alfa: number }> = {
  '!': { borda: '#d6a94a', simbolo: '!', texto: '#ffd25a', brilho: 0xffc94a, alfa: 1 },
  '…': { borda: '#b9b2a4', simbolo: '…', texto: '#ece7dc', brilho: null, alfa: 0.85 },
  '?': { borda: '#ffcc33', simbolo: '?', texto: '#ffe680', brilho: 0xffd84a, alfa: 1 },
  '!vermelho': { borda: '#e0473a', simbolo: '!', texto: '#ff6a55', brilho: 0xff4a3a, alfa: 1 },
};

/** Altura (px de textura) do corpo do balão; a ponta fica embaixo. */
const TEX_H = 112;
const TEX_W = 92;
const CORPO = 92;

export const chaveBalao = (t: TipoBalao) => `balao-${t === '!' ? 'excl' : t === '…' ? 'retic' : t === '?' ? 'interr' : 'vermelho'}`;

/** Cria (uma vez por cena) as texturas de balões, brilho, faísca, seta e anel. */
export function texturasMarcas(cena: Phaser.Scene): void {
  const tx = cena.textures;
  for (const t of Object.keys(ESTILO) as TipoBalao[]) {
    const chave = chaveBalao(t);
    if (tx.exists(chave)) continue;
    const e = ESTILO[t];
    const cv = document.createElement('canvas');
    cv.width = TEX_W; cv.height = TEX_H;
    const c = cv.getContext('2d')!;
    const r = 26, x0 = 6, y0 = 6, w = TEX_W - 12, hh = CORPO - 12;
    c.beginPath();
    c.moveTo(x0 + r, y0);
    c.arcTo(x0 + w, y0, x0 + w, y0 + hh, r);
    c.arcTo(x0 + w, y0 + hh, x0, y0 + hh, r);
    // Ponta do balão, embaixo e ao centro.
    c.lineTo(TEX_W / 2 + 12, y0 + hh);
    c.lineTo(TEX_W / 2, TEX_H - 4);
    c.lineTo(TEX_W / 2 - 12, y0 + hh);
    c.arcTo(x0, y0 + hh, x0, y0, r);
    c.arcTo(x0, y0, x0 + w, y0, r);
    c.closePath();
    c.fillStyle = 'rgba(22, 15, 9, 0.94)';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = e.borda;
    c.stroke();
    c.fillStyle = e.texto;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${e.simbolo === '…' ? 54 : 64}px Cinzel, Georgia, serif`;
    c.shadowColor = 'rgba(0, 0, 0, 0.6)';
    c.shadowBlur = 4;
    c.fillText(e.simbolo, TEX_W / 2, CORPO / 2 + (e.simbolo === '…' ? -8 : 3));
    tx.addCanvas(chave, cv);
  }
  if (!tx.exists('marca-brilho')) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    tx.addCanvas('marca-brilho', cv);
  }
  if (!tx.exists('marca-faisca')) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 16;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#fff3c0';
    c.beginPath();
    // Estrelinha de 4 pontas.
    c.moveTo(8, 0); c.lineTo(10, 6); c.lineTo(16, 8); c.lineTo(10, 10); c.lineTo(8, 16); c.lineTo(6, 10); c.lineTo(0, 8); c.lineTo(6, 6);
    c.closePath();
    c.fill();
    tx.addCanvas('marca-faisca', cv);
  }
  if (!tx.exists('marca-seta')) {
    const cv = document.createElement('canvas');
    cv.width = 40; cv.height = 32;
    const c = cv.getContext('2d')!;
    c.beginPath();
    c.moveTo(4, 4); c.lineTo(36, 4); c.lineTo(20, 28); c.closePath();
    c.fillStyle = '#ffd25a';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#4a2c0c';
    c.stroke();
    tx.addCanvas('marca-seta', cv);
  }
  if (!tx.exists('marca-anel')) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    const c = cv.getContext('2d')!;
    for (const [lw, a] of [[14, 0.18], [8, 0.35], [3, 0.95]] as const) {
      c.beginPath();
      c.ellipse(64, 32, 54, 24, 0, 0, Math.PI * 2);
      c.lineWidth = lw;
      c.strokeStyle = `rgba(255, 214, 110, ${a})`;
      c.stroke();
    }
    tx.addCanvas('marca-anel', cv);
  }
}

export interface Balao {
  tipo: TipoBalao;
  readonly corpo: Phaser.GameObjects.Image;
  /** Altura do balão em px do mapa. */
  readonly altura: number;
  mover(x: number, yBase: number): void;
  definirTipo(t: TipoBalao | null): void;
  visivel(sim: boolean): void;
  destruir(): void;
}

/**
 * Balão sobre (x, yBase): a ponta encosta em yBase. `altura` em px do mapa. Movimento conforme o tipo:
 * ! pula de leve (≈4 px na tela, 1 s), … parado a 85%, ? pula mais alto (≈6 px) e o brilho pisca,
 * !vermelho pula e achata (o destino da Fase 4F). Animações reduzidas: tudo parado.
 */
export function criarBalao(cena: Phaser.Scene, x: number, yBase: number, tipo: TipoBalao, altura: number, o: { reduzidas: boolean; profundidade?: number }): Balao {
  const prof = o.profundidade ?? 150_000;
  const brilho = cena.add.image(x, yBase, 'marca-brilho').setOrigin(0.5, 0.5).setBlendMode('ADD').setDepth(prof - 1);
  const corpo = cena.add.image(x, yBase, chaveBalao(tipo)).setOrigin(0.5, 1).setDepth(prof);
  const sombra = cena.add.ellipse(x, yBase + altura * 0.06, altura * 0.42, altura * 0.13, 0x000000, 0.3).setDepth(prof - 2);
  const escala = altura / TEX_H;
  corpo.setScale(escala);
  let tweens: Phaser.Tweens.Tween[] = [];
  let atual: TipoBalao = tipo;
  let base = { x, y: yBase };

  const parar = () => { tweens.forEach((t) => t.remove()); tweens = []; };
  const posicionar = () => {
    corpo.setPosition(base.x, base.y);
    brilho.setPosition(base.x, base.y - altura * 0.48);
    sombra.setPosition(base.x, base.y + altura * 0.06);
  };
  const animar = () => {
    parar();
    const e = ESTILO[atual];
    corpo.setTexture(chaveBalao(atual)).setAlpha(e.alfa).setScale(escala);
    brilho.setVisible(!!e.brilho).setTint(e.brilho ?? 0xffffff).setScale((altura * 1.9) / 64).setAlpha(0.55);
    sombra.setVisible(atual !== '…');
    posicionar();
    if (o.reduzidas) return;
    // Amplitudes em px do mapa proporcionais à altura (28 px de balão na tela → 4 px de pulo).
    const pulo = altura * (atual === '?' ? 0.21 : atual === '!vermelho' ? 0.24 : 0.14);
    if (atual === '…') return;
    const dur = atual === '!vermelho' ? 400 : atual === '?' ? 450 : 500;
    tweens.push(cena.tweens.add({
      targets: corpo, y: base.y - pulo, duration: dur, ease: 'Sine.easeOut', yoyo: true, repeat: -1,
      onRepeat: atual === '!vermelho' ? () => { cena.tweens.add({ targets: corpo, scaleX: escala * 1.12, scaleY: escala * 0.86, duration: 70, yoyo: true, ease: 'Quad.easeOut' }); } : undefined,
    }));
    tweens.push(cena.tweens.add({ targets: brilho, y: base.y - altura * 0.48 - pulo, duration: dur, ease: 'Sine.easeOut', yoyo: true, repeat: -1 }));
    tweens.push(cena.tweens.add({ targets: sombra, scaleX: 0.7, scaleY: 0.7, alpha: 0.15, duration: dur, ease: 'Sine.easeOut', yoyo: true, repeat: -1 }));
    if (ESTILO[atual].brilho) {
      tweens.push(cena.tweens.add({ targets: brilho, alpha: atual === '?' ? 0.05 : 0.25, duration: atual === '?' ? 350 : 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    }
  };
  animar();

  return {
    get tipo() { return atual; },
    corpo,
    altura,
    mover(nx, ny) {
      if (nx === base.x && ny === base.y) return;
      base = { x: nx, y: ny };
      animar();
    },
    definirTipo(t) {
      if (!t) { this.visivel(false); return; }
      this.visivel(true);
      if (t === atual) return;
      atual = t;
      animar();
    },
    visivel(sim) {
      corpo.setVisible(sim);
      brilho.setVisible(sim && !!ESTILO[atual].brilho);
      sombra.setVisible(sim && atual !== '…');
    },
    destruir() { parar(); corpo.destroy(); brilho.destroy(); sombra.destroy(); },
  };
}

export interface Destaque {
  /** O item (imagem principal) e tudo o que flutua com ele. */
  readonly img: Phaser.GameObjects.Image;
  escurecer(): void;
  destruir(): void;
}

/**
 * Destaque de um item já criado (`img`, origem no centro): contorno claro de 1 px de tela, flutuação de
 * 3 px (≈1,2 s), brilho pulsante atrás, faíscas douradas de tempos em tempos e, com missão aceita, uma
 * seta dourada apontando para ele. `pxTela` = px de tela por px do mapa.
 */
export function destacarItem(cena: Phaser.Scene, img: Phaser.GameObjects.Image, o: { pxTela: number; reduzidas: boolean; seta: boolean }): Destaque {
  const prof = img.depth;
  const px = 1 / Math.max(0.1, o.pxTela);
  const contornos = [[-px, 0], [px, 0], [0, -px], [0, px]].map(([dx, dy]) =>
    cena.add.image(img.x + dx, img.y + dy, img.texture.key).setDisplaySize(img.displayWidth, img.displayHeight).setTintFill(0xfff6d8).setDepth(prof - 0.02));
  const lado = Math.max(img.displayWidth, img.displayHeight);
  const brilho = cena.add.image(img.x, img.y, 'marca-brilho').setTint(0xffc94a).setBlendMode('ADD').setScale((lado * 2.1) / 64).setAlpha(0.6).setDepth(prof - 0.04);
  const tweens: Phaser.Tweens.Tween[] = [];
  let faiscas: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  let seta: Phaser.GameObjects.Image | null = null;
  const subir = 3 * px;
  const flutuantes: Phaser.GameObjects.Image[] = [img, ...contornos];
  if (o.seta) {
    const h = Math.max(lado * 0.42, 14 * px);
    seta = cena.add.image(img.x, img.y - img.displayHeight / 2 - h * 0.3, 'marca-seta').setOrigin(0.5, 1).setDisplaySize(h * 1.25, h).setDepth(149_000);
  }
  if (!o.reduzidas) {
    for (const f of flutuantes) tweens.push(cena.tweens.add({ targets: f, y: f.y - subir, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    tweens.push(cena.tweens.add({ targets: brilho, alpha: 0.25, scale: brilho.scale * 0.85, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    if (seta) tweens.push(cena.tweens.add({ targets: seta, y: seta.y - 4 * px, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    faiscas = cena.add.particles(img.x, img.y, 'marca-faisca', {
      x: { min: -lado * 0.5, max: lado * 0.5 },
      y: { min: -lado * 0.5, max: lado * 0.3 },
      speedY: { min: -18 * px, max: -8 * px },
      speedX: { min: -6 * px, max: 6 * px },
      scale: { start: (lado * 0.22) / 16, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 900,
      frequency: 1300,
      quantity: 2,
      tint: [0xffe27a, 0xffc94a, 0xfff3c0],
      blendMode: 'ADD',
    }).setDepth(prof + 0.02);
  }
  return {
    img,
    escurecer() {
      tweens.forEach((t) => t.remove());
      faiscas?.destroy(); faiscas = null;
      brilho.setVisible(false);
      seta?.setVisible(false);
      contornos.forEach((c) => c.setVisible(false));
      img.setTint(0x8c8273);
    },
    destruir() {
      tweens.forEach((t) => t.remove());
      faiscas?.destroy();
      seta?.destroy();
      brilho.destroy();
      contornos.forEach((c) => c.destroy());
      img.destroy();
    },
  };
}

/** Anel de luz dourada pulsando no chão, em volta de (x, y). `largura` em px do mapa. */
export function anelNoChao(cena: Phaser.Scene, x: number, y: number, largura: number, reduzidas: boolean) {
  const anel = cena.add.image(x, y, 'marca-anel').setBlendMode('ADD').setDisplaySize(largura, largura / 2).setDepth(-49_000);
  const t = reduzidas ? null : cena.tweens.add({ targets: anel, alpha: 0.35, scaleX: anel.scaleX * 1.12, scaleY: anel.scaleY * 1.12, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return { anel, destruir() { t?.remove(); anel.destroy(); } };
}
