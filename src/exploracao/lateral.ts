import Phaser from 'phaser';

/**
 * Motor de fase em 2D lateral (Fase 6, Ato I, Partes 2 a 5), dirigido por dados (src/data/lateral/*.json).
 *
 * - Fundo: os painéis emendados, lado a lado; a câmera segue o herói só na horizontal, presa ao trecho.
 * - Faixa de chão: o herói anda para os lados e sobe e desce entre `chao[0]` e `chao[1]` do painel; é um
 *   pouco menor no fundo (0,9) e maior na frente (1,0); y-sort com os objetos da faixa.
 * - Camada da frente: peças com parallax 1,25 (já desfocadas no arquivo), por cima do herói.
 * - Pulo em arco, com sombra no chão; pulos roteirizados até um x (o corredor de Sólem).
 * - Escuridão: uma camada escura com o círculo de luz quente da tocha em volta do herói (raio ≈ 30% da
 *   altura da tela, tremulando ±4%), luz ambiente configurável, tochas de parede e brilho das poças.
 * - Grade de lajes desenhada por código (juntas escuras com um fio claro), com os símbolos dos deuses
 *   "deitados" em cada laje e o brilho de cada um refeito por código.
 *
 * O motor não conhece as regras (dados, flechas, falas): a tela (screens/lateral.ts) cuida delas.
 */

export interface PainelLateral { id: string; x: number; w: number; chao: [number, number] }
export interface PecaFrente { id: string; x: number; lado: 'cima' | 'baixo'; altura: number }
export interface Poca { x: number; y: number; r: number }
export interface GradeLajes { x: number; larguraLaje: number; y: number; alturas: number[]; tabuleiro: string[] }
export interface Tocha { x: number; y: number }

export interface OpcoesLateral {
  container: HTMLElement;
  paineis: PainelLateral[];
  /** URL de cada textura (já em memória: blob:). */
  urls: Record<string, string>;
  altura: number;
  alturaHeroi: number;
  velocidade: number;
  frente: PecaFrente[];
  pocas: Poca[];
  inicio: { x: number; y: number };
  limites: [number, number];
  reduzidas: boolean;
}

export interface EstadoLateral {
  x: number; y: number; z: number;
  noAr: boolean;
  escala: number;
  direcao: 'esquerda' | 'direita' | 'frente';
  camX: number; camY: number;
  visao: { x: number; y: number; w: number; h: number };
  frente: { id: string; x: number; tex?: string; w?: number; h?: number; y?: number; vis?: boolean; alpha?: number }[];
  luz: { x: number; y: number; raio: number; ambiente: number; acesa: boolean };
  limites: [number, number];
  tochasAcesas: number;
  velocidade: number;
}

export interface MotorLateral {
  cena: Phaser.Scene;
  posicao(): { x: number; y: number };
  teleportar(x: number, y: number): void;
  /** Direção desejada (−1..1), do teclado ou do joystick. */
  definirEntrada(fn: () => { x: number; y: number }): void;
  /** Pulo livre (botão PULAR / Espaço). Falso se já está no ar ou bloqueado. */
  pular(): boolean;
  /** Pulo roteirizado até um x (o corredor de Sólem); resolve no pouso. */
  pularAte(x: number, ms?: number): Promise<void>;
  noAr(): boolean;
  bloquear(sim: boolean): void;
  /** Fator de velocidade (teto baixo = 0,5; Parte 3: pulo curto). */
  velocidade(f: number): void;
  alcancePulo(f: number): void;
  limites(x0: number, x1: number): void;
  /** Parede invisível à esquerda (Parte 5). */
  paredeEsquerda(x: number | null): void;
  /** Luz da tocha: raio relativo (1 = normal; 0 = apagada) e luz ambiente (0 a 1), com transição. */
  luz(o: { raio?: number; ambiente?: number; ms?: number }): Promise<void>;
  /** Silhueta dourada fraca do herói (no escuro total). */
  silhueta(sim: boolean): void;
  definirTochas(t: Tocha[]): void;
  /** Acende as tochas uma a uma (da esquerda para a direita), chamando `aoAcender` em cada. */
  acenderTochas(intervalo: number, aoAcender?: (i: number) => void): Promise<void>;
  grade(g: GradeLajes | null): void;
  /** Casa (coluna, linha) sob os pés do herói, ou null fora da grade. */
  casa(): { col: number; lin: number } | null;
  /** Dispara a armadilha: a laje afunda 2 px e vira o sol rachado. */
  dispararLaje(col: number, lin: number): void;
  /** Brilho das lajes seguras por um tempo (dica de tutorial). */
  brilharSeguras(ms: number): void;
  /** Flechas antigas quebradas perto destas casas (pista). */
  flechasAntigas(casas: { col: number; lin: number }[]): void;
  /** Flecha saindo da fenda da parede até o herói. */
  flecha(): Promise<void>;
  /** Mostra um texto flutuando sobre o herói (dano, "A flecha acerta o seu tornozelo"). */
  textoSobre(t: string, cor?: string): void;
  tremer(): void;
  estado(): EstadoLateral;
  aoMover(fn: (x: number, y: number) => void): void;
  destruir(): void;
}

const QUADRO = 240;
const PARALLAX = 1.25;
const PROF = { fundo: 0, grade: 5, simbolo: 6, brilho: 7, faixa: 100, frente: 3000, escuro: 4000, luzQuente: 4001, silhueta: 4002, texto: 4100 };
const COR_DEUS: Record<string, number> = {
  S: 0xffd25a, J: 0xe4ecf7, A: 0xff6a3d, X: 0x4f95ff, E: 0xffffff, M: 0xffb340, I: 0xb46bff,
};
export const SIMBOLO_DA_LETRA: Record<string, string> = {
  S: 'solem', J: 'justar', A: 'ardor', X: 'expiria', E: 'eternus', M: 'mentis', I: 'irae',
};

/** Textura radial (branco no centro → transparente na borda), para a luz e os halos. */
function texturaRadial(cena: Phaser.Scene, chave: string, tam: number, paradas: [number, number][], cor = '255,255,255') {
  if (cena.textures.exists(chave)) return;
  const c = cena.textures.createCanvas(chave, tam, tam)!;
  const ctx = c.getContext();
  const g = ctx.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
  for (const [p, a] of paradas) g.addColorStop(p, `rgba(${cor},${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, tam, tam);
  c.refresh();
}

export function criarMotorLateral(o: OpcoesLateral): Promise<MotorLateral> {
  return new Promise((resolve) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let motor: MotorLateral | null = null;
    let destruido = false;

    class CenaLateral extends Phaser.Scene {
      constructor() { super('lateral'); }

      preload() {
        for (const p of o.paineis) this.load.image(`painel-${p.id}`, o.urls[`painel-${p.id}`]);
        this.load.spritesheet('heroi', o.urls.heroi, { frameWidth: QUADRO, frameHeight: QUADRO });
        for (const [k, u] of Object.entries(o.urls)) if (k.startsWith('frente-') || k.startsWith('simbolo-') || k.startsWith('brilho-')) this.load.image(k, u);
      }

      create() {
        const cena = this;
        const cam = this.cameras.main;
        let lim: [number, number] = [...o.limites];
        let parede: number | null = null;
        const mundoW = o.paineis.reduce((m, p) => Math.max(m, p.x + p.w), 0);
        cam.setBounds(0, 0, mundoW, o.altura);
        const zoomCamera = () => cam.height / o.altura;
        cam.setZoom(zoomCamera());
        cam.setRoundPixels(true);

        for (const p of o.paineis) this.add.image(p.x, 0, `painel-${p.id}`).setOrigin(0, 0).setDepth(PROF.fundo);
        const faixa = (x: number): [number, number] => (o.paineis.find((p) => x >= p.x && x < p.x + p.w) ?? o.paineis[o.paineis.length - 1]).chao;

        // ---------- herói ----------
        this.textures.get('heroi').setFilter(Phaser.Textures.FilterMode.NEAREST);
        const anim = (k: string, linha: number) => this.anims.create({ key: k, frames: this.anims.generateFrameNumbers('heroi', { frames: [linha * 4, linha * 4 + 1, linha * 4 + 2, linha * 4 + 3] }), frameRate: 8, repeat: -1 });
        anim('andar-esquerda', 1);
        anim('andar-direita', 2);
        const base = o.alturaHeroi / (QUADRO * 46 / 48);
        const sombra = this.add.ellipse(0, 0, 120, 26, 0x000000, 0.45).setDepth(PROF.faixa - 1);
        const heroi = this.add.sprite(o.inicio.x, o.inicio.y, 'heroi', 0).setOrigin(0.5, 0.98);
        let x = o.inicio.x, y = o.inicio.y, z = 0, vz = 0, vx = 0;
        let direcao: 'esquerda' | 'direita' | 'frente' = 'frente';
        let bloqueado = false;
        let fatorVel = 1;
        let fatorPulo = 1;
        let entrada = () => ({ x: 0, y: 0 });
        let aoMover: ((x: number, y: number) => void) | null = null;
        let roteiro: { de: number; para: number; t: number; dur: number; ok: () => void } | null = null;
        const GRAV = 2600;
        const escalaEm = (yy: number) => {
          const [a, b] = faixa(x);
          const t = Phaser.Math.Clamp((yy - a) / Math.max(1, b - a), 0, 1);
          return base * (0.9 + 0.1 * t);
        };

        // ---------- camada da frente (parallax 1,25) ----------
        const vw = () => cam.width / cam.zoom;
        const pecas = o.frente.map((f) => {
          const img = this.add.image(0, 0, `frente-${f.id}`).setScrollFactor(PARALLAX, 1).setDepth(PROF.frente);
          img.setScale(f.altura / img.height);
          img.setOrigin(0.5, f.lado === 'cima' ? 0 : 1);
          // Aparece sobre o x do mundo quando a câmera está centrada nele.
          img.setPosition(PARALLAX * f.x - (PARALLAX - 1) * vw() / 2, f.lado === 'cima' ? -4 : o.altura + 4);
          return { f, img };
        });

        // ---------- poças (brilham dentro da luz) ----------
        texturaRadial(this, 'halo', 128, [[0, 0.9], [0.45, 0.35], [1, 0]]);
        const pocas = o.pocas.map((p) => this.add.image(p.x, p.y, 'halo').setDisplaySize(p.r * 2.2, p.r * 0.9).setTint(0x9fd8ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(PROF.luzQuente));

        // ---------- escuridão e luz ----------
        texturaRadial(this, 'luz', 512, [[0, 1], [0.55, 0.92], [0.78, 0.45], [1, 0]]);
        texturaRadial(this, 'luz-quente', 256, [[0, 0.5], [0.6, 0.18], [1, 0]], '255,150,60');
        // Escuridão: um "furo" de luz (preto nas bordas, transparente no centro) em volta da tocha, e
        // quatro retângulos pretos cobrindo o resto da vista. Todos com a mesma opacidade (1 − ambiente).
        if (!this.textures.exists('furo')) {
          const tam = 512;
          const c = this.textures.createCanvas('furo', tam, tam)!;
          const ctx = c.getContext();
          const g = ctx.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(0.45, 'rgba(0,0,0,0.05)');
          g.addColorStop(0.72, 'rgba(0,0,0,0.5)');
          g.addColorStop(0.9, 'rgba(0,0,0,0.9)');
          g.addColorStop(1, 'rgba(0,0,0,1)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, tam, tam);
          c.refresh();
        }
        const furo = this.add.image(0, 0, 'furo').setDepth(PROF.escuro);
        const bordas = [0, 1, 2, 3].map(() => this.add.rectangle(0, 0, 10, 10, 0x000000, 1).setOrigin(0, 0).setDepth(PROF.escuro));
        const escuro = { raio: 0 };
        const quente = this.add.image(0, 0, 'luz-quente').setBlendMode(Phaser.BlendModes.ADD).setDepth(PROF.luzQuente);
        const silhueta = this.add.sprite(0, 0, 'heroi', 0).setOrigin(0.5, 0.98).setTintFill(0xffd27a).setAlpha(0).setDepth(PROF.silhueta);
        let raioRel = 1, ambiente = 0.08, comSilhueta = false;
        const raioBase = () => 0.3 * o.altura;
        let tochas: { t: Tocha; acesa: boolean; chama: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image }[] = [];
        texturaRadial(this, 'chama', 64, [[0, 1], [0.35, 0.85], [1, 0]], '255,190,90');

        // ---------- grade ----------
        let grade: GradeLajes | null = null;
        let gradeObjs: Phaser.GameObjects.GameObject[] = [];
        let lajes: { col: number; lin: number; letra: string; simbolo: Phaser.GameObjects.Image; brilho: Phaser.GameObjects.Image; fase: number; disparada: boolean }[] = [];
        const linhaY = (g: GradeLajes, lin: number) => g.y + g.alturas.slice(0, lin).reduce((s, a) => s + a, 0);
        function montarGrade(g: GradeLajes | null) {
          gradeObjs.forEach((x) => x.destroy());
          gradeObjs = [];
          lajes = [];
          grade = g;
          if (!g) return;
          const cols = g.tabuleiro[0].length;
          const larg = g.larguraLaje;
          const gr = cena.add.graphics().setDepth(PROF.grade);
          gradeObjs.push(gr);
          const yFim = linhaY(g, g.alturas.length);
          // Juntas: escuras, com um fio claro de 1 px embaixo de cada uma.
          for (let l = 0; l <= g.alturas.length; l++) {
            const yy = linhaY(g, l);
            gr.lineStyle(3, 0x0d0a07, 0.75).lineBetween(g.x, yy, g.x + cols * larg, yy);
            gr.lineStyle(1, 0xd8c7a0, 0.28).lineBetween(g.x, yy + 2, g.x + cols * larg, yy + 2);
          }
          for (let c = 0; c <= cols; c++) {
            const xx = g.x + c * larg;
            gr.lineStyle(3, 0x0d0a07, 0.75).lineBetween(xx, g.y, xx, yFim);
            gr.lineStyle(1, 0xd8c7a0, 0.22).lineBetween(xx + 2, g.y, xx + 2, yFim);
          }
          for (let lin = 0; lin < g.alturas.length; lin++) {
            for (let col = 0; col < cols; col++) {
              const letra = g.tabuleiro[lin][col];
              const id = SIMBOLO_DA_LETRA[letra];
              if (!id) continue;
              const cx = g.x + col * larg + larg / 2;
              const cy = linhaY(g, lin) + g.alturas[lin] / 2;
              const s = cena.add.image(cx, cy, `simbolo-${id}`).setDepth(PROF.simbolo);
              // "Deitado": ~75% da largura da laje, achatado na proporção da laje; levemente escurecido.
              const w = larg * 0.75;
              s.setDisplaySize(w, w * (g.alturas[lin] / larg) * 0.92);
              s.setTint(letra === 'S' ? 0xf2eadb : 0xc9bfae);
              s.setAlpha(letra === 'S' ? 0.92 : 0.82);
              // Justar e Mentis (claros): contorno um pouco mais claro, para não sumirem na pedra.
              if (letra === 'J' || letra === 'M') {
                const contorno = cena.add.image(cx, cy, `simbolo-${id}`).setDepth(PROF.simbolo - 0.5).setDisplaySize(s.displayWidth * 1.06, s.displayHeight * 1.08).setTintFill(0xfff7e6).setAlpha(0.28);
                gradeObjs.push(contorno);
              }
              // Brilho refeito por código: o traço desfocado (simbolos/<id>-brilho.png), na cor do deus, aditivo.
              const temBrilho = cena.textures.exists(`brilho-${id}`);
              const b = cena.add.image(cx, cy, temBrilho ? `brilho-${id}` : `simbolo-${id}`).setDepth(PROF.brilho).setBlendMode(Phaser.BlendModes.ADD)
                .setDisplaySize(s.displayWidth * (temBrilho ? 1.37 : 1.12), s.displayHeight * (temBrilho ? 1.4 : 1.16)).setTintFill(COR_DEUS[letra]).setAlpha(0.18);
              gradeObjs.push(s, b);
              lajes.push({ col, lin, letra, simbolo: s, brilho: b, fase: Math.random() * Math.PI * 2, disparada: false });
            }
          }
        }
        let brilhoSeguras = 0;

        // ---------- textos flutuantes ----------
        function textoSobre(t: string, cor = '#ffe2a8') {
          const tx = cena.add.text(x, y - o.alturaHeroi - 30 - z, t, {
            fontFamily: 'Inter, sans-serif', fontSize: '30px', color: cor, stroke: '#000', strokeThickness: 6, align: 'center',
            wordWrap: { width: 560 },
          }).setOrigin(0.5, 1).setDepth(PROF.texto);
          cena.tweens.add({ targets: tx, y: tx.y - 60, alpha: 0, delay: 1400, duration: 900, onComplete: () => tx.destroy() });
        }

        // ---------- laço ----------
        let tempo = 0;
        this.events.on('update', (_t: number, dtMs: number) => {
          const dt = Math.min(dtMs, 50) / 1000;
          tempo += dt;
          // Movimento
          if (roteiro) {
            roteiro.t += dt * 1000;
            const k = Math.min(1, roteiro.t / roteiro.dur);
            x = roteiro.de + (roteiro.para - roteiro.de) * k;
            z = Math.sin(Math.PI * k) * 170;
            direcao = roteiro.para >= roteiro.de ? 'direita' : 'esquerda';
            if (k >= 1) { z = 0; const ok = roteiro.ok; roteiro = null; ok(); }
          } else {
            const e = bloqueado ? { x: 0, y: 0 } : entrada();
            const noAr = z > 0 || vz !== 0;
            if (!noAr) vx = e.x * o.velocidade * fatorVel;
            x += vx * dt;
            if (!noAr) y += e.y * o.velocidade * 0.6 * fatorVel * dt;
            if (noAr) {
              vz -= GRAV * dt;
              z += vz * dt;
              if (z <= 0) { z = 0; vz = 0; }
            }
            if (Math.abs(e.x) > 0.05 && !noAr) direcao = e.x < 0 ? 'esquerda' : 'direita';
            else if (!noAr && Math.abs(e.y) < 0.05) direcao = 'frente';
          }
          const minX = Math.max(lim[0] + 40, parede ?? -Infinity);
          x = Phaser.Math.Clamp(x, minX, lim[1] - 40);
          const [a, b] = faixa(x);
          y = Phaser.Math.Clamp(y, a, b);
          // Sprite
          const esc = escalaEm(y);
          heroi.setScale(esc).setPosition(Math.round(x), Math.round(y - z)).setDepth(PROF.faixa + y);
          const andando = !roteiro && (Math.abs(vx) > 1 || Math.abs(entrada().y) > 0.05) && !bloqueado;
          if (direcao === 'frente' || (!andando && !roteiro && z === 0)) { heroi.anims.stop(); heroi.setFrame(0); }
          else {
            const k = `andar-${direcao}`;
            if (z > 0 || roteiro) { heroi.anims.stop(); heroi.setFrame((direcao === 'esquerda' ? 1 : 2) * 4 + 1); }
            else if (heroi.anims.currentAnim?.key !== k || !heroi.anims.isPlaying) heroi.play(k);
          }
          sombra.setPosition(x, y).setDepth(PROF.faixa + y - 1).setScale(esc / base * (1 - Math.min(0.5, z / 340)));
          sombra.setAlpha(0.45 * (1 - Math.min(0.6, z / 300)));
          // Câmera: só na horizontal, presa ao trecho.
          const larguraVista = vw();
          const cx = Phaser.Math.Clamp(x - larguraVista / 2, lim[0], Math.max(lim[0], lim[1] - larguraVista));
          cam.centerOn(cx + larguraVista / 2, o.altura / 2);
          // Escuridão
          const vista = cam.worldView;
          const treme = o.reduzidas ? 1 : 1 + 0.04 * Math.sin(tempo * 7.3) * Math.sin(tempo * 3.1 + 1.7);
          const raio = raioBase() * raioRel * treme;
          const cxL = x, cyL = y - o.alturaHeroi * 0.55 - z;
          escuro.raio = raio;
          const alfa = 1 - ambiente;
          const vx0 = vista.x - 4, vy0 = vista.y - 4, vx1 = vista.right + 4, vy1 = vista.bottom + 4;
          if (raio > 2) {
            // Os retângulos entram 4 px no furo (sem fresta de luz entre eles).
            const fx0 = cxL - raio + 4, fy0 = cyL - raio + 4, fx1 = cxL + raio - 4, fy1 = cyL + raio - 4;
            furo.setVisible(true).setPosition(cxL, cyL).setDisplaySize(raio * 2, raio * 2).setAlpha(alfa);
            const r4: [number, number, number, number][] = [
              [vx0, vy0, vx1 - vx0, Math.max(0, fy0 - vy0)],
              [vx0, fy1, vx1 - vx0, Math.max(0, vy1 - fy1)],
              [vx0, fy0, Math.max(0, fx0 - vx0), fy1 - fy0],
              [fx1, fy0, Math.max(0, vx1 - fx1), fy1 - fy0],
            ];
            r4.forEach(([a1, b1, w1, h1], i) => bordas[i].setPosition(a1, b1).setSize(w1, h1).setAlpha(alfa).setVisible(w1 > 0 && h1 > 0));
          } else {
            furo.setVisible(false);
            bordas[0].setPosition(vx0, vy0).setSize(vx1 - vx0, vy1 - vy0).setAlpha(alfa).setVisible(true);
            for (let i = 1; i < 4; i++) bordas[i].setVisible(false);
          }
          quente.setPosition(cxL, cyL).setDisplaySize(raio * 2.1, raio * 2.1).setAlpha(raio > 2 ? 0.55 : 0);
          // Poças: brilham dentro da luz.
          pocas.forEach((p, i) => {
            const d = Math.hypot(o.pocas[i].x - cxL, o.pocas[i].y - cyL);
            const alvo = raio > 2 ? Math.max(0, 1 - d / raio) * 0.5 : 0;
            p.setAlpha(alvo * (o.reduzidas ? 1 : 0.85 + 0.15 * Math.sin(tempo * 2 + i)));
          });
          // Silhueta dourada (escuro total).
          silhueta.setVisible(comSilhueta).setPosition(heroi.x, heroi.y).setScale(heroi.scaleX).setFrame(heroi.frame.name).setAlpha(comSilhueta ? 0.22 : 0);
          // Tochas tremulam.
          for (const [i, t] of tochas.entries()) if (t.acesa && !o.reduzidas) t.chama.setScale(0.9 + 0.12 * Math.sin(tempo * 9 + i), 1.1 + 0.15 * Math.sin(tempo * 11 + i * 2));
          // Brilho dos símbolos (período ~3 s, fases diferentes).
          for (const l of lajes) {
            const seg = brilhoSeguras > 0 && l.letra !== 'S';
            const pulso = o.reduzidas ? 0.5 : 0.5 + 0.5 * Math.sin(tempo * (Math.PI * 2 / 3) + l.fase);
            l.brilho.setAlpha(seg ? 0.75 : l.disparada ? 0.05 : (l.letra === 'S' ? 0.2 : 0.14) + 0.12 * pulso);
          }
          if (brilhoSeguras > 0) brilhoSeguras -= dt * 1000;
          aoMover?.(x, y);
        });

        motor = {
          cena,
          posicao: () => ({ x, y }),
          teleportar(nx, ny) { x = nx; y = ny; z = 0; vz = 0; vx = 0; roteiro = null; },
          definirEntrada(fn) { entrada = fn; },
          pular() {
            if (bloqueado || z > 0 || vz !== 0 || roteiro) return false;
            const e = entrada();
            vz = 900;
            z = 0.01;
            vx = e.x * o.velocidade * fatorVel * fatorPulo;
            return true;
          },
          pularAte(alvo, ms = 650) {
            return new Promise<void>((ok) => { vz = 0; roteiro = { de: x, para: alvo, t: 0, dur: ms, ok }; });
          },
          noAr: () => z > 0 || vz !== 0 || !!roteiro,
          bloquear(sim) { bloqueado = sim; if (sim) vx = 0; },
          velocidade(f) { fatorVel = f; },
          alcancePulo(f) { fatorPulo = f; },
          limites(x0, x1) { lim = [x0, x1]; },
          paredeEsquerda(px) { parede = px; },
          luz(op) {
            return new Promise<void>((ok) => {
              const ms = op.ms ?? 0;
              const alvo = { raio: op.raio ?? raioRel, ambiente: op.ambiente ?? ambiente };
              if (!ms) { raioRel = alvo.raio; ambiente = alvo.ambiente; return ok(); }
              const de = { raio: raioRel, ambiente };
              cena.tweens.addCounter({
                from: 0, to: 1, duration: ms,
                onUpdate: (tw) => { const k = tw.getValue() ?? 0; raioRel = de.raio + (alvo.raio - de.raio) * k; ambiente = de.ambiente + (alvo.ambiente - de.ambiente) * k; },
                onComplete: () => ok(),
              });
            });
          },
          silhueta(sim) { comSilhueta = sim; },
          definirTochas(ts) {
            tochas.forEach((t) => { t.chama.destroy(); t.halo.destroy(); });
            tochas = ts.map((t) => ({
              t, acesa: false,
              chama: cena.add.image(t.x, t.y, 'chama').setBlendMode(Phaser.BlendModes.ADD).setDepth(PROF.luzQuente).setVisible(false).setDisplaySize(34, 52),
              halo: cena.add.image(t.x, t.y + 40, 'luz-quente').setBlendMode(Phaser.BlendModes.ADD).setDepth(PROF.luzQuente).setVisible(false).setDisplaySize(380, 380).setAlpha(0.6),
            }));
          },
          async acenderTochas(intervalo, aoAcender) {
            for (const [i, t] of tochas.entries()) {
              if (destruido) return;
              t.acesa = true;
              t.chama.setVisible(true);
              t.halo.setVisible(true).setAlpha(0);
              cena.tweens.add({ targets: t.halo, alpha: 0.6, duration: 380 });
              aoAcender?.(i);
              await new Promise((r) => cena.time.delayedCall(intervalo, r));
            }
          },
          grade: montarGrade,
          casa() {
            if (!grade || z > 0 || roteiro) return null;
            const g: GradeLajes = grade;
            const col = Math.floor((x - g.x) / g.larguraLaje);
            if (col < 0 || col >= g.tabuleiro[0].length) return null;
            let lin = -1;
            for (let l = 0; l < g.alturas.length; l++) if (y >= linhaY(g, l) && y < linhaY(g, l + 1)) lin = l;
            if (lin < 0) lin = y < g.y ? 0 : g.alturas.length - 1;
            return { col, lin };
          },
          dispararLaje(col, lin) {
            const l = lajes.find((q) => q.col === col && q.lin === lin);
            if (!l || l.disparada) return;
            l.disparada = true;
            l.simbolo.setTexture('simbolo-solem-rachado');
            l.simbolo.y += 2;
            l.brilho.setTexture(cena.textures.exists('brilho-solem-rachado') ? 'brilho-solem-rachado' : 'simbolo-solem-rachado');
            l.brilho.y += 2;
          },
          brilharSeguras(ms) { brilhoSeguras = ms; },
          flechasAntigas(casas) {
            if (!grade) return;
            const g: GradeLajes = grade;
            const gr = cena.add.graphics().setDepth(PROF.simbolo + 1);
            gradeObjs.push(gr);
            for (const c of casas) {
              const cx = g.x + c.col * g.larguraLaje + g.larguraLaje * (0.2 + 0.5 * ((c.col * 7 + c.lin * 3) % 5) / 5);
              const cy = linhaY(g, c.lin) + g.alturas[c.lin] * 0.75;
              const ang = ((c.col * 13 + c.lin * 5) % 7 - 3) * 0.12;
              const dx = Math.cos(ang) * 26, dy = Math.sin(ang) * 26;
              gr.lineStyle(3, 0x6b4a2a, 0.9).lineBetween(cx - dx, cy - dy, cx + dx * 0.4, cy + dy * 0.4);
              gr.lineStyle(2, 0x3c2a18, 0.9).lineBetween(cx + dx * 0.6, cy + dy * 0.6 + 3, cx + dx, cy + dy + 2);
              gr.fillStyle(0xd9d2c2, 0.85).fillTriangle(cx - dx, cy - dy, cx - dx - 10, cy - dy - 6, cx - dx - 8, cy - dy + 6);
            }
          },
          flecha() {
            return new Promise<void>((ok) => {
              const deX = x + 520, deY = (grade ? (grade as GradeLajes).y : 520) - 90;
              const alvoX = x + 6, alvoY = y - o.alturaHeroi * 0.45;
              const f = cena.add.rectangle(deX, deY, 56, 4, 0xd8c8a4).setDepth(PROF.texto - 1);
              f.setRotation(Math.atan2(alvoY - deY, alvoX - deX));
              cena.tweens.add({ targets: f, x: alvoX, y: alvoY, duration: 170, ease: 'Quad.easeIn', onComplete: () => { f.destroy(); ok(); } });
            });
          },
          textoSobre,
          tremer() { if (!o.reduzidas) cam.shake(220, 0.006); },
          estado() {
            const v = cam.worldView;
            return {
              x: Math.round(x), y: Math.round(y), z: Math.round(z), noAr: z > 0 || vz !== 0 || !!roteiro,
              escala: Math.round((heroi.scaleX / base) * 1000) / 1000, direcao,
              camX: Math.round(v.x), camY: Math.round(v.y), visao: { x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.width), h: Math.round(v.height) },
              frente: pecas.map((p) => ({ id: p.f.id, x: Math.round(p.img.x - v.x * PARALLAX) })),
              luz: { x: Math.round(x), y: Math.round(y - o.alturaHeroi * 0.55 - z), raio: Math.round(escuro.raio), ambiente: Math.round(ambiente * 100) / 100, acesa: raioRel >= 0.5 },
              limites: [...lim] as [number, number],
              tochasAcesas: tochas.filter((t) => t.acesa).length,
              velocidade: fatorVel,
            };
          },
          aoMover(fn) { aoMover = fn; },
          destruir,
        };
        resolve(motor);
      }
    }

    const largura = () => Math.max(1, o.container.clientWidth);
    const altura = () => Math.max(1, o.container.clientHeight);
    const jogo = new Phaser.Game({
      type: Phaser.AUTO,
      parent: o.container,
      width: Math.round(largura() * dpr),
      height: Math.round(altura() * dpr),
      backgroundColor: '#000000',
      banner: false,
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
      audio: { noAudio: true },
      input: { keyboard: false, gamepad: false },
      render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
      scene: CenaLateral,
    });
    const observador = new ResizeObserver(() => {
      if (destruido) return;
      jogo.scale.resize(Math.round(largura() * dpr), Math.round(altura() * dpr));
      jogo.scale.setZoom(1 / dpr);
      const cam = jogo.scene.getScene('lateral')?.cameras?.main;
      if (cam) cam.setZoom(cam.height / o.altura);
    });
    observador.observe(o.container);
    function destruir() {
      if (destruido) return;
      destruido = true;
      observador.disconnect();
      jogo.destroy(true);
    }
  });
}
