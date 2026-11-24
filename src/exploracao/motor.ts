import Phaser from 'phaser';
import type { Genero } from '../core/assets';
import { h } from '../core/ui';
import { COLUNAS, QUADRO, desenharFolhaChibi } from './chibi';
import { PES, dentroDoPoligono, encontrarCaminho, escalarPes, pesLivres, pontoLivreMaisProximo } from './geometria';
import { caixaDoContorno, mascaraRecorte } from './recorte';
import { Cenario } from './cenario';
import type { ObjetoMontado } from './montagem';
import { DIRECOES, type DadosMapa, type Direcao } from './tipos';

/**
 * Motor de exploração reutilizável (Phaser 3): mapa de fundo, herói andando em 4 direções, colisões por
 * polígonos, áreas de interação, gatilhos, câmera presa ao mapa e modo de ajuste (F2 / ?debug=1).
 * Cada mapa é só um JSON (src/data/mapas/*.json); o que é específico da cena (estátuas, clímax…) fica
 * em quem usa o motor, pelos callbacks.
 */

export interface OpcoesMotor {
  container: HTMLElement;
  mapa: DadosMapa;
  /** O chão do mapa: um bloco (imagem inteira) ou vários (mapas grandes), com a URL final de cada um. */
  blocos: { url: string; x: number; y: number; largura: number; altura: number }[];
  heroi: { raca: string; genero: Genero; spriteUrl: string | null };
  /** Direção desejada pelo jogador (módulo até 1). */
  entrada: () => { x: number; y: number };
  /** Pode ligar o modo de ajuste com F2? */
  debugPermitido: boolean;
  debugInicial: boolean;
  /** Quantas alturas de tela o mapa ocupa (o zoom se ajusta a isso). */
  alturasDeTela?: number;
  /**
   * Objetos do cenário (mapas de chão + objetos): o atlas, os quadros e as instâncias montadas. Ficam
   * ordenados junto com os personagens pela linha de profundidade.
   */
  cenario?: { atlasUrl: string; quadros: Record<string, { x: number; y: number; w: number; h: number }>; objetos: ObjetoMontado[]; animacoes: boolean; agua?: [number, number][][] };
  /** Imagens a mais para carregar junto do mapa (folhas de moradores, ícones de itens). */
  extras?: { chave: string; url: string; tipo: 'folha' | 'imagem' }[];
  /** Começa aqui em vez do `inicio` do mapa (posição salva, saída de outro mapa). */
  inicio?: { x: number; y: number; direcao?: Direcao };
  aoProximidade?: (id: string | null) => void;
  aoEntrarGatilho?: (id: string) => void;
  aoSairGatilho?: (id: string) => void;
  /** A cada passo da animação (som de passo). */
  aoPasso?: () => void;
  /** Chamado uma vez, com a cena pronta (para a cena específica criar seus efeitos). */
  aoCriar?: (motor: Motor) => void;
  aoAtualizar?: (dtMs: number) => void;
}

export interface Motor {
  cena: Phaser.Scene;
  /** Pixels de tela (CSS) por pixel do mapa, com o zoom atual da câmera. */
  pxTela(): number;
  /**
   * Profundidade mínima para que nada do cenário (objetos, recortes) cubra a caixa `b` de quem tem a
   * profundidade `prof`: devolve `prof` se nada opaco fica na frente, senão a do objeto mais à frente + 1.
   */
  frenteDe(b: Phaser.Geom.Rectangle, prof: number): number;
  /** Fração (0–1) da caixa `b` coberta por cenário opaco desenhado na frente da profundidade `prof`. */
  coberturaCaixa(b: Phaser.Geom.Rectangle, prof: number): number;
  /** Pixels de tela por pixel do chibi (inteiro) e o filtro das texturas de personagem. */
  nitidez(): { escalaTela: number; filtros: Record<string, number> };
  heroi: Phaser.GameObjects.Sprite;
  /** Bloqueia o controle do jogador (diálogos, clímax). */
  bloquear(sim: boolean): void;
  teleportar(x: number, y: number, direcao?: Direcao): void;
  virar(direcao: Direcao): void;
  andarAte(x: number, y: number, ms: number): Promise<void>;
  /**
   * Anda sozinho até (x, y) na velocidade normal, com a animação de caminhada, desviando das colisões
   * (caminho calculado na malha andável). Resolve ao chegar; false se não houver caminho.
   */
  caminharAte(x: number, y: number): Promise<boolean>;
  /** Para toda caminhada por script e tween do herói (ao voltar de uma cena, por exemplo). */
  pararMovimento(): void;
  /** Religa a câmera ao sprite atual do herói e centraliza nele. */
  seguirCamera(): void;
  /** Herói fora dos limites do mapa ou com os pés numa colisão. */
  foraDaArea(): boolean;
  /** Ponto andável mais próximo do herói (ou o início do mapa, se não achar nenhum por perto). */
  pontoSeguro(): { x: number; y: number };
  /** Fade rápido da câmera (escurece, chama `meio`, clareia). */
  piscar(meio: () => void, ms?: number): Promise<void>;
  /** O controle do jogador está bloqueado (diálogo, clímax) ou o herói anda por script? */
  travado(): boolean;
  /** Id do recorte que está cobrindo o herói agora (ele está atrás dele), ou null. */
  atrasDe(): string | null;
  /**
   * Personagem que os recortes devem levar em conta (morador, seguidor): quando ele está atrás de um
   * recorte, o recorte fica translúcido; com `silhueta`, ganha o contorno dourado quando está coberto.
   */
  registrarAtor(id: string, sprite: Phaser.GameObjects.Sprite, opcoes?: { silhueta?: boolean }): void;
  removerAtor(id: string): void;
  /** Fração (0 a 1) do sprite coberta pelos recortes que estão na frente dele (opacos). */
  cobertura(sprite: Phaser.GameObjects.Sprite): number;
  /** Estado dos recortes e das silhuetas (para os testes). */
  estadoProfundidade(): { translucidos: string[]; silhuetas: string[]; blocos: number; blocosCarregados: number };
  /** Escala dos personagens neste mapa. */
  readonly escala: number;
  /** Objetos do cenário (para o editor e os testes); null em mapas de ilustração única. */
  readonly cenario: Cenario | null;
  /** Liga ou desliga as animações do cenário (Animações reduzidas). */
  definirAnimacoes(sim: boolean): void;
  posicao(): { x: number; y: number; direcao: Direcao };
  proximo(): string | null;
  /** Multiplica o zoom base (1 = normal), suavemente. */
  zoomPara(fator: number, ms: number): void;
  tremer(ms: number, intensidade: number): void;
  pausar(sim: boolean): void;
  alternarDebug(): void;
  destruir(): void;
}

const VELOCIDADE = 150; // px do mapa por segundo

/**
 * Profundidade (ordem de desenho). Tudo o que fica "em pé" no mapa usa o próprio y como profundidade
 * (o herói, pelo y dos pés; os recortes, pelo y da base): quem está mais abaixo na tela fica na frente.
 */
export const PROF = {
  mapa: -100_000,
  luzChao: -50_000,
  /** Camadas acima de tudo o que está no mapa (neblina da frente, feixes, depuração). */
  neblinaFrente: 200_000,
  feixes: 300_000,
  debug: 1_000_000,
} as const;
const CHAVE_FOLHA = 'heroi';

export function criarMotor(o: OpcoesMotor): Promise<Motor> {
  return new Promise((resolver) => {
    const { mapa } = o;
    const dpr = Math.min(window.devicePixelRatio || 1, Number((window as any).__dprMax ?? 2));
    let fatorZoom = 1;
    let bloqueado = false;
    let direcao: Direcao = mapa.inicio.direcao;
    let proximo: string | null = null;
    const dentroDe = new Set<string>();
    let debugLigado = o.debugInicial;
    let movendoPorScript = false;
    /** Encerra a caminhada por script em andamento (pararMovimento mata o tween, que então nunca completaria). */
    let interromperCaminho: (() => void) | null = null;
    let destruido = false;
    const escala = mapa.escalaPersonagens ?? 1;
    escalarPes(escala);
    const velocidade = VELOCIDADE * escala;

    const rotuloDebug = h('div', { class: 'debug-coords', hidden: !debugLigado });
    o.container.append(rotuloDebug);

    const zoomBase = () => {
      const w = o.container.clientWidth || window.innerWidth;
      const hgt = o.container.clientHeight || window.innerHeight;
      const alvo = Math.max(((o.alturasDeTela ?? 1.75) * hgt) / mapa.altura, w / mapa.largura);
      return Phaser.Math.Clamp(alvo, 0.7, 3);
    };
    /**
     * Zoom da câmera (já com o dpr) ajustado para que cada pixel do chibi vire um número inteiro de pixels
     * na tela (escala do personagem × zoom = inteiro): nítido, sem pixels de tamanhos diferentes. A câmera
     * nunca mostra além do mapa (o inteiro sobe se for preciso cobrir a tela).
     */
    const zoomCamera = (fator = fatorZoom) => {
      const z = zoomBase() * dpr * fator;
      const w = (o.container.clientWidth || window.innerWidth) * dpr, hh = (o.container.clientHeight || window.innerHeight) * dpr;
      const cobrir = Math.max(w / mapa.largura, hh / mapa.altura);
      const k = Math.max(1, Math.round(escala * z), Math.ceil(escala * cobrir - 1e-6));
      return k / escala;
    };

    let heroi!: Phaser.GameObjects.Sprite;
    const recortes: { id: string; base: number; img: Phaser.GameObjects.Image; translucido: boolean }[] = [];
    let gDebug!: Phaser.GameObjects.Graphics;
    let gPes!: Phaser.GameObjects.Graphics;
    let motor!: Motor;

    const animar = (andando: boolean) => {
      if (andando) heroi.anims.play(`andar-${direcao}`, true);
      else {
        heroi.anims.stop();
        heroi.setFrame(DIRECOES.indexOf(direcao) * COLUNAS);
      }
    };

    const desenharDebug = () => {
      gDebug.clear();
      rotulosDebug.splice(0).forEach((t) => t.destroy());
      if (!debugLigado) return;
      for (const c of mapa.colisoes) {
        const cor = c.tipo === 'andavel' ? 0x00e05a : 0xff2030;
        gDebug.fillStyle(cor, 0.18).lineStyle(2, cor, 0.9);
        gDebug.fillPoints(c.pontos.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
        gDebug.strokePoints(c.pontos.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
      }
      for (const g of mapa.gatilhos) {
        gDebug.fillStyle(0xffe000, 0.25).lineStyle(2, 0xffe000, 1);
        gDebug.fillPoints(g.pontos.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
        gDebug.strokePoints(g.pontos.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
      }
      for (const i of mapa.interacoes) {
        gDebug.fillStyle(0x00d0ff, 0.2).lineStyle(2, 0x00d0ff, 1);
        gDebug.fillCircle(i.x, i.y, i.raio).strokeCircle(i.x, i.y, i.raio);
      }
      // Recortes de profundidade: contorno em magenta, a linha da base e o id (para ajustar o JSON).
      for (const oc of mapa.oclusores ?? []) {
        gDebug.lineStyle(1.5, 0xff40ff, 0.9);
        gDebug.strokePoints(oc.contorno.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
        const xs = oc.contorno.map((p) => p[0]);
        if (oc.base < mapa.altura) gDebug.lineStyle(1, 0xff40ff, 0.6).lineBetween(Math.min(...xs), oc.base, Math.max(...xs), oc.base);
        const ys = oc.contorno.map((p) => p[1]);
        rotulosDebug.push(gDebug.scene.add.text(Math.min(...xs) + 2, Math.min(...ys) + 1, `${oc.id} · base ${oc.base}`, {
          fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#ffd0ff', backgroundColor: 'rgba(0,0,0,0.55)', padding: { x: 2, y: 1 },
        }).setDepth(PROF.debug + 2));
      }
      for (const c of mapa.colisoes) {
        if (c.tipo !== 'bloqueado' || c.pontos.length > 6) continue;
        const xs = c.pontos.map((p) => p[0]), ys = c.pontos.map((p) => p[1]);
        rotulosDebug.push(gDebug.scene.add.text(Math.min(...xs) + 1, Math.max(...ys) - 11, c.id, {
          fontFamily: 'Inter, sans-serif', fontSize: '9px', color: '#ffb0b0', backgroundColor: 'rgba(0,0,0,0.45)',
        }).setDepth(PROF.debug + 2));
      }
    };
    const rotulosDebug: Phaser.GameObjects.Text[] = [];

    const atualizarRotulo = (extra = '') => {
      if (!debugLigado) return;
      rotuloDebug.textContent = `herói ${Math.round(heroi.x)}, ${Math.round(heroi.y)}${extra}`;
    };

    /** Proximidade e gatilhos, avaliados a cada quadro. */
    const avaliarAreas = () => {
      let maisPerto: string | null = null;
      let menor = Infinity;
      for (const a of mapa.interacoes) {
        const d = Math.hypot(heroi.x - a.x, heroi.y - a.y);
        if (d <= a.raio && d < menor) { menor = d; maisPerto = a.id; }
      }
      if (maisPerto !== proximo) {
        proximo = maisPerto;
        o.aoProximidade?.(proximo);
      }
      for (const g of mapa.gatilhos) {
        const dentro = dentroDoPoligono(heroi.x, heroi.y, g.pontos);
        if (dentro && !dentroDe.has(g.id)) { dentroDe.add(g.id); o.aoEntrarGatilho?.(g.id); }
        else if (!dentro && dentroDe.has(g.id)) { dentroDe.delete(g.id); o.aoSairGatilho?.(g.id); }
      }
    };

    class CenaExploracao extends Phaser.Scene {
      constructor() {
        super('exploracao');
      }

      preload() {
        // Só os blocos do chão que a câmera vê no começo (com folga); os outros vêm logo depois.
        const vista = vistaInicial();
        for (const [k, b] of o.blocos.entries()) if (intersecta(b, vista)) this.load.image(`chao-${k}`, b.url);
        if (o.cenario) this.load.image('cenario-atlas', o.cenario.atlasUrl);
        if (o.heroi.spriteUrl) this.load.spritesheet(CHAVE_FOLHA, o.heroi.spriteUrl, { frameWidth: QUADRO, frameHeight: QUADRO });
        for (const e of o.extras ?? []) {
          if (e.tipo === 'folha') this.load.spritesheet(e.chave, e.url, { frameWidth: QUADRO, frameHeight: QUADRO });
          else this.load.image(e.chave, e.url);
        }
      }

      create() {
        cenaAtual = this;
        if (o.cenario && this.textures.exists('cenario-atlas')) {
          cenario = new Cenario(this, { chaveAtlas: 'cenario-atlas', quadros: o.cenario.quadros, objetos: o.cenario.objetos, animacoes: o.cenario.animacoes, agua: o.cenario.agua });
        }
        for (const k of o.blocos.keys()) if (this.textures.exists(`chao-${k}`)) aoBlocoCarregado(this, k);
        const faltam = [...o.blocos.entries()].filter(([k]) => !this.textures.exists(`chao-${k}`));
        if (faltam.length) {
          for (const [k, b] of faltam) this.load.image(`chao-${k}`, b.url);
          this.load.on(Phaser.Loader.Events.FILE_COMPLETE, (chave: string) => {
            const m = /^chao-(\d+)$/.exec(chave);
            if (m && !destruido) aoBlocoCarregado(this, Number(m[1]));
          });
          this.load.start();
        }

        // Sem sprite real (ou se ele falhar): o boneco desenhado por código.
        if (!this.textures.exists(CHAVE_FOLHA)) {
          const tex = this.textures.addCanvas(CHAVE_FOLHA, desenharFolhaChibi(o.heroi.raca, o.heroi.genero))!;
          for (let i = 0; i < COLUNAS * 4; i++) tex.add(i, 0, (i % COLUNAS) * QUADRO, Math.floor(i / COLUNAS) * QUADRO, QUADRO, QUADRO);
        }
        DIRECOES.forEach((d, linha) => {
          this.anims.create({
            key: `andar-${d}`,
            frames: this.anims.generateFrameNumbers(CHAVE_FOLHA, { start: linha * COLUNAS, end: linha * COLUNAS + COLUNAS - 1 }),
            frameRate: 7,
            repeat: -1,
          });
        });

        if (o.inicio?.direcao) direcao = o.inicio.direcao;
        heroi = this.add.sprite(o.inicio?.x ?? mapa.inicio.x, o.inicio?.y ?? mapa.inicio.y, CHAVE_FOLHA, DIRECOES.indexOf(direcao) * COLUNAS);
        heroi.setOrigin(0.5, 46 / QUADRO).setDepth(heroi.y).setScale(escala);
        // Fora da escala 1, os pixels do personagem ficam nítidos (sem borrar ao ampliar).
        this.textures.get(CHAVE_FOLHA).setFilter(Phaser.Textures.FilterMode.NEAREST);
        prepararSilhueta(this, CHAVE_FOLHA);
        atores.set('heroi', { sprite: heroi, silhueta: true });
        heroi.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_a: unknown, quadro: Phaser.Animations.AnimationFrame) => {
          if (quadro.index === 2 || quadro.index === 4) o.aoPasso?.();
        });

        const cam = this.cameras.main;
        cam.setBounds(0, 0, mapa.largura, mapa.altura);
        cam.setZoom(zoomCamera());
        cam.startFollow(heroi, false, 0.12, 0.12);
        cam.centerOn(heroi.x, heroi.y);

        gDebug = this.add.graphics().setDepth(PROF.debug);
        gPes = this.add.graphics().setDepth(PROF.debug + 1);
        desenharDebug();

        // No modo de ajuste, um toque/clique mostra as coordenadas do mapa naquele ponto.
        this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
          if (!debugLigado) return;
          const texto = ` · ponto ${Math.round(p.worldX)}, ${Math.round(p.worldY)}`;
          atualizarRotulo(texto);
          console.info(`[mapa ${mapa.id}]${texto}`);
        });

        motor = {
          cena: this,
          heroi,
          bloquear(sim) {
            bloqueado = sim;
            if (sim && !movendoPorScript) animar(false);
          },
          teleportar(x, y, dir) {
            heroi.setPosition(x, y);
            if (dir) direcao = dir;
            animar(false);
            cam.centerOn(x, y);
          },
          virar(dir) {
            direcao = dir;
            animar(false);
          },
          andarAte: (x, y, ms) => new Promise((ok) => {
            const dx = x - heroi.x;
            const dy = y - heroi.y;
            if (Math.hypot(dx, dy) < 2) return ok();
            direcao = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : dy < 0 ? 'cima' : 'baixo';
            movendoPorScript = true;
            animar(true);
            this.tweens.add({
              targets: heroi, x, y, duration: ms, ease: 'Sine.easeInOut',
              onComplete: () => { movendoPorScript = false; animar(false); ok(); },
            });
          }),
          caminharAte: async (x, y) => {
            const caminho = encontrarCaminho(mapa.colisoes, mapa.largura, mapa.altura, { x: heroi.x, y: heroi.y }, { x, y });
            if (!caminho) return false;
            movendoPorScript = true;
            let interrompido = false;
            for (const p of caminho) {
              if (destruido || interrompido) return false;
              await new Promise<void>((ok) => {
                interromperCaminho = () => { interrompido = true; interromperCaminho = null; ok(); };
                const dx = p.x - heroi.x;
                const dy = p.y - heroi.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 1) return ok();
                direcao = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : dy < 0 ? 'cima' : 'baixo';
                heroi.anims.timeScale = 1;
                animar(true);
                this.tweens.add({ targets: heroi, x: p.x, y: p.y, duration: (dist / velocidade) * 1000, ease: 'Linear', onComplete: () => ok() });
              });
            }
            interromperCaminho = null;
            if (interrompido) return false;
            movendoPorScript = false;
            animar(false);
            return true;
          },
          pararMovimento: () => {
            this.tweens.killTweensOf(heroi);
            interromperCaminho?.();
            movendoPorScript = false;
            animar(false);
          },
          seguirCamera: () => {
            cam.stopFollow();
            cam.startFollow(heroi, false, 0.12, 0.12);
            cam.centerOn(heroi.x, heroi.y);
          },
          foraDaArea: () => heroi.x < 0 || heroi.y < 0 || heroi.x > mapa.largura || heroi.y > mapa.altura || !pesLivres(mapa.colisoes, heroi.x, heroi.y),
          pontoSeguro: () => pontoLivreMaisProximo(mapa.colisoes, mapa.largura, mapa.altura, { x: heroi.x, y: heroi.y }) ?? { x: mapa.inicio.x, y: mapa.inicio.y },
          piscar: (meio, ms = 140) => new Promise<void>((ok) => {
            // Cena pausada (menu aberto): o fade não andaria; faz o "meio" na hora.
            if (!this.scene.isActive()) { meio(); return ok(); }
            cam.fadeOut(ms, 0, 0, 0);
            cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
              meio();
              cam.fadeIn(ms, 0, 0, 0);
              ok();
            });
          }),
          travado: () => bloqueado || movendoPorScript,
          atrasDe: () => {
            const b = heroi.getBounds();
            const r = recortes.find((rc) => rc.base > heroi.y && Phaser.Geom.Intersects.RectangleToRectangle(b, rc.img.getBounds()) && cobre(rc.id, b));
            return r?.id ?? null;
          },
          registrarAtor: (id, sprite, op) => {
            atores.get(id)?.contorno?.destroy();
            atores.set(id, { sprite, silhueta: !!op?.silhueta });
            if (op?.silhueta) prepararSilhueta(this, sprite.texture.key);
          },
          removerAtor: (id) => {
            atores.get(id)?.contorno?.destroy();
            atores.delete(id);
          },
          cobertura: (sprite) => cobertura(sprite),
          estadoProfundidade: () => ({
            translucidos: [...recortes.filter((r) => r.translucido).map((r) => r.id), ...(cenario?.sprites.filter((c) => c.translucido).map((c) => c.o.id) ?? [])],
            silhuetas: [...atores.entries()].filter(([, a]) => a.contorno?.visible).map(([id]) => id),
            blocos: o.blocos.length,
            blocosCarregados: blocosProntos.size,
          }),
          escala,
          pxTela: () => cam.zoom / dpr,
          frenteDe: (b, prof) => frenteDe(b, prof),
          coberturaCaixa: (b, prof) => coberturaCaixa(b, prof),
          /** Pixels de tela por pixel do chibi e o filtro das texturas de personagem (testes de nitidez). */
          nitidez: () => ({
            escalaTela: escala * cam.zoom,
            filtros: Object.fromEntries(this.textures.getTextureKeys().filter((k) => k === CHAVE_FOLHA || k.startsWith('npc-')).map((k) => [k, this.textures.get(k).source[0].scaleMode])),
          }),
          get cenario() { return cenario; },
          definirAnimacoes: (sim) => cenario?.definirAnimacoes(sim),
          posicao: () => ({ x: heroi.x, y: heroi.y, direcao }),
          proximo: () => proximo,
          zoomPara(fator, ms) {
            fatorZoom = fator;
            cam.zoomTo(zoomCamera(fator), ms, 'Sine.easeInOut');
          },
          tremer(ms, intensidade) {
            cam.shake(ms, intensidade);
          },
          pausar: (sim) => {
            if (sim) { this.scene.pause(); animar(false); }
            else this.scene.resume();
          },
          alternarDebug() {
            if (!o.debugPermitido) return;
            debugLigado = !debugLigado;
            rotuloDebug.hidden = !debugLigado;
            desenharDebug();
            gPes.clear();
          },
          destruir: () => destruir(),
        };
        o.aoCriar?.(motor);
        resolver(motor);
      }

      update(_t: number, delta: number) {
        // Até 100 ms por quadro: em aparelhos lentos o herói não fica mais devagar (e ainda não atravessa paredes).
        const dt = Math.min(delta, 100) / 1000;
        if (!bloqueado && !movendoPorScript) {
          const v = o.entrada();
          const forca = Math.hypot(v.x, v.y);
          if (forca > 0.05) {
            direcao = Math.abs(v.x) > Math.abs(v.y) ? (v.x < 0 ? 'esquerda' : 'direita') : v.y < 0 ? 'cima' : 'baixo';
            const dx = v.x * velocidade * dt;
            const dy = v.y * velocidade * dt;
            const camadas = mapa.colisoes;
            // Tenta o movimento inteiro; se bater, desliza no eixo que estiver livre.
            if (pesLivres(camadas, heroi.x + dx, heroi.y + dy)) heroi.setPosition(heroi.x + dx, heroi.y + dy);
            else if (dx && pesLivres(camadas, heroi.x + dx, heroi.y)) heroi.x += dx;
            else if (dy && pesLivres(camadas, heroi.x, heroi.y + dy)) heroi.y += dy;
            animar(true);
            heroi.anims.timeScale = Math.max(0.6, forca);
          } else {
            animar(false);
          }
        }
        heroi.setDepth(heroi.y);
        atualizarProfundidade();
        avaliarAreas();
        if (debugLigado) {
          gPes.clear().lineStyle(2, 0xff00ff, 1).strokeEllipse(heroi.x, heroi.y, PES.rx * 2, PES.ry * 2);
          if (!rotuloDebug.textContent?.includes('ponto')) atualizarRotulo();
        }
        o.aoAtualizar?.(delta);
      }
    }

    /* ------------------------------------------------------------ chão em blocos */

    let cenaAtual: Phaser.Scene | null = null;
    let cenario: Cenario | null = null;
    const blocosProntos = new Set<number>();
    type Caixa = { x: number; y: number; largura: number; altura: number };
    const intersecta = (a: Caixa, b: Caixa) => a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + b.altura && b.y < a.y + a.altura;
    /** Área do mapa que a câmera mostra ao começar, com uma tela de folga para cada lado. */
    function vistaInicial(): Caixa {
      const z = zoomBase();
      const w = (o.container.clientWidth || window.innerWidth) / z;
      const hh = (o.container.clientHeight || window.innerHeight) / z;
      const cx = o.inicio?.x ?? mapa.inicio.x, cy = o.inicio?.y ?? mapa.inicio.y;
      return { x: cx - w * 1.5, y: cy - hh * 1.5, largura: w * 3, altura: hh * 3 };
    }
    function aoBlocoCarregado(cena: Phaser.Scene, k: number) {
      if (blocosProntos.has(k)) return;
      blocosProntos.add(k);
      const b = o.blocos[k];
      cena.add.image(b.x, b.y, `chao-${k}`).setOrigin(0).setDepth(PROF.mapa);
      // Cada recorte nasce quando todos os blocos por baixo dele já chegaram.
      for (const oc of mapa.oclusores ?? []) if (!recortes.some((r) => r.id === oc.id)) criarRecorte(cena, oc);
    }

    /* ------------------------------------------------------------ recortes (profundidade) */

    /**
     * Recorta do próprio mapa as partes que passam na frente dos personagens (copas, telhados, estátuas).
     * Quando alguém está atrás de um recorte, ele fica translúcido (45%), como as árvores do Stardew Valley.
     */
    const mascaras = new Map<string, { m: Uint8Array; x0: number; y0: number; w: number }>();
    function criarRecorte(cena: Phaser.Scene, oc: NonNullable<DadosMapa['oclusores']>[number]) {
      const c = caixaDoContorno(oc.contorno, mapa.largura, mapa.altura);
      const caixa = { x: c.x0, y: c.y0, largura: c.largura, altura: c.altura };
      const embaixo = [...o.blocos.entries()].filter(([, b]) => intersecta(b, caixa));
      if (embaixo.some(([k]) => !blocosProntos.has(k))) return;
      const canvas = document.createElement('canvas');
      canvas.width = c.largura;
      canvas.height = c.altura;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      for (const [k, b] of embaixo) {
        const fonte = cena.textures.get(`chao-${k}`).getSourceImage() as CanvasImageSource;
        ctx.drawImage(fonte, b.x - c.x0, b.y - c.y0);
      }
      const dados = ctx.getImageData(0, 0, c.largura, c.altura);
      const m = mascaraRecorte({ rgba: dados.data, ...c, contorno: oc.contorno, sementes: oc.sementes, fixo: oc.fixo, limiar: oc.limiar });
      for (let p = 0; p < m.length; p++) if (!m[p]) dados.data[p * 4 + 3] = 0;
      ctx.putImageData(dados, 0, 0);
      const chave = `recorte-${oc.id}`;
      if (cena.textures.exists(chave)) cena.textures.remove(chave);
      cena.textures.addCanvas(chave, canvas);
      const img = cena.add.image(c.x0, c.y0, chave).setOrigin(0).setDepth(oc.base);
      recortes.push({ id: oc.id, base: oc.base, img, translucido: false });
      mascaras.set(oc.id, { m, x0: c.x0, y0: c.y0, w: c.largura });
    }

    /** Algum pixel do recorte cai dentro da caixa? (amostra a cada 2 px) */
    function cobre(id: string, b: Phaser.Geom.Rectangle) {
      const k = mascaras.get(id);
      if (!k) return false;
      const alt = k.m.length / k.w;
      for (let y = Math.max(0, Math.floor(b.top - k.y0)); y < Math.min(alt, b.bottom - k.y0); y += 2)
        for (let x = Math.max(0, Math.floor(b.left - k.x0)); x < Math.min(k.w, b.right - k.x0); x += 2)
          if (k.m[y * k.w + x]) return true;
      return false;
    }

    /* ------------------------------------------------------------ atores, transparência e silhueta */

    const atores = new Map<string, { sprite: Phaser.GameObjects.Sprite; silhueta: boolean; contorno?: Phaser.GameObjects.Sprite }>();
    /** Pixels opacos de cada quadro de cada folha (amostra de 3 em 3 px), para medir a cobertura. */
    const opacos = new Map<string, Map<string, [number, number][]>>();

    function pontosOpacos(sprite: Phaser.GameObjects.Sprite): [number, number][] {
      const chave = sprite.texture.key;
      const nome = String(sprite.frame.name);
      let porQuadro = opacos.get(chave);
      if (!porQuadro) opacos.set(chave, (porQuadro = new Map()));
      let pts = porQuadro.get(nome);
      if (pts) return pts;
      pts = [];
      const f = sprite.frame;
      const cv = document.createElement('canvas');
      cv.width = f.cutWidth;
      cv.height = f.cutHeight;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
      const px = ctx.getImageData(0, 0, f.cutWidth, f.cutHeight).data;
      for (let y = 0; y < f.cutHeight; y += 3) for (let x = 0; x < f.cutWidth; x += 3) if (px[(y * f.cutWidth + x) * 4 + 3] > 128) pts.push([x, y]);
      porQuadro.set(nome, pts);
      return pts;
    }

    /** Fração do sprite coberta pelos recortes que estão na frente dele (pela máscara, não pela opacidade). */
    function cobertura(sprite: Phaser.GameObjects.Sprite): number {
      const frente = recortes.filter((r) => r.base > sprite.y && mascaras.has(r.id));
      const objetosFrente = cenario ? cenario.naFrente(sprite.y, sprite.getBounds()) : [];
      if (!frente.length && !objetosFrente.length) return 0;
      const pts = pontosOpacos(sprite);
      if (!pts.length) return 0;
      const sx = sprite.scaleX, sy = sprite.scaleY;
      const x0 = sprite.x - sprite.displayOriginX * sx, y0 = sprite.y - sprite.displayOriginY * sy;
      let cobertos = 0;
      for (const [px, py] of pts) {
        const x = Math.round(x0 + (px + 0.5) * sx), y = Math.round(y0 + (py + 0.5) * sy);
        let coberto = false;
        for (const r of frente) {
          const k = mascaras.get(r.id)!;
          const lx = x - k.x0, ly = y - k.y0;
          if (lx >= 0 && ly >= 0 && lx < k.w && ly < k.m.length / k.w && k.m[ly * k.w + lx]) { coberto = true; break; }
        }
        if (!coberto) for (const c of objetosFrente) if (cenario!.opaco(c, x, y)) { coberto = true; break; }
        if (coberto) cobertos++;
      }
      return cobertos / pts.length;
    }

    /** O que do cenário (recortes com máscara e objetos) fica na frente de `prof` e cruza a caixa `b`. */
    function cenarioNaFrente(b: Phaser.Geom.Rectangle, prof: number) {
      const rs = recortes.filter((r) => r.base > prof && mascaras.has(r.id) && Phaser.Geom.Intersects.RectangleToRectangle(b, r.img.getBounds()));
      const os = cenario ? cenario.naFrente(prof, b, true) : [];
      return { rs, os };
    }
    function opacoRecorte(id: string, x: number, y: number) {
      const k = mascaras.get(id)!;
      const lx = Math.round(x) - k.x0, ly = Math.round(y) - k.y0;
      return lx >= 0 && ly >= 0 && lx < k.w && ly < k.m.length / k.w && !!k.m[ly * k.w + lx];
    }
    /** Pontos de amostra (grade ~12×12) dentro da caixa. */
    function amostras(b: Phaser.Geom.Rectangle): [number, number][] {
      const passo = Math.max(1, Math.min(b.width, b.height) / 12);
      const pts: [number, number][] = [];
      for (let y = b.top + passo / 2; y < b.bottom; y += passo) for (let x = b.left + passo / 2; x < b.right; x += passo) pts.push([x, y]);
      return pts;
    }
    function frenteDe(b: Phaser.Geom.Rectangle, prof: number): number {
      const { rs, os } = cenarioNaFrente(b, prof);
      let p = prof;
      const pts = amostras(b);
      for (const r of rs) if (r.base >= p && pts.some(([x, y]) => opacoRecorte(r.id, x, y))) p = r.base + 1;
      for (const s of os) if (s.o.profundidade >= p && pts.some(([x, y]) => cenario!.opaco(s, x, y))) p = s.o.profundidade + 1;
      return p;
    }
    function coberturaCaixa(b: Phaser.Geom.Rectangle, prof: number): number {
      const { rs, os } = cenarioNaFrente(b, prof);
      const pts = amostras(b);
      if (!pts.length || (!rs.length && !os.length)) return 0;
      let n = 0;
      for (const [x, y] of pts) if (rs.some((r) => opacoRecorte(r.id, x, y)) || os.some((s) => cenario!.opaco(s, x, y))) n++;
      return n / pts.length;
    }

    /** Folha só com o contorno (dourado claro) de cada quadro: a silhueta que fica por cima de tudo. */
    function prepararSilhueta(cena: Phaser.Scene, chave: string) {
      const destino = `contorno-${chave}`;
      if (cena.textures.exists(destino) || !cena.textures.exists(chave)) return;
      const tex = cena.textures.get(chave);
      const fonte = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const w = fonte.width, hh = fonte.height;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = hh;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(fonte, 0, 0);
      const px = ctx.getImageData(0, 0, w, hh);
      const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= hh ? 0 : px.data[(y * w + x) * 4 + 3]);
      const saida = ctx.createImageData(w, hh);
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        // Contorno do lado de fora do corpo: pixel transparente encostado num opaco.
        if (a(x, y) > 100) continue;
        if (a(x - 1, y) > 100 || a(x + 1, y) > 100 || a(x, y - 1) > 100 || a(x, y + 1) > 100) {
          const i = (y * w + x) * 4;
          saida.data[i] = 0xff; saida.data[i + 1] = 0xe9; saida.data[i + 2] = 0xa8; saida.data[i + 3] = 255;
        }
      }
      ctx.clearRect(0, 0, w, hh);
      ctx.putImageData(saida, 0, 0);
      const nova = cena.textures.addCanvas(destino, cv)!;
      for (const nome of tex.getFrameNames()) {
        const f = tex.get(nome);
        nova.add(nome, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
      }
      nova.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    /** A cada quadro: recorte translúcido quando alguém está atrás; silhueta quando o ator está > 40% coberto. */
    function atualizarProfundidade() {
      if (!cenaAtual) return;
      cenario?.recortarVista();
      cenario?.atualizarCopas([...atores.values()].map((a) => a.sprite));
      const vista = cenaAtual.cameras.main.worldView;
      for (const r of recortes) {
        let atras = false;
        const caixa = r.img.getBounds();
        for (const [, a] of atores) {
          const s = a.sprite;
          if (!s.active || !s.visible || s.y >= r.base) continue;
          const b = s.getBounds();
          if (!Phaser.Geom.Intersects.RectangleToRectangle(b, vista)) continue;
          if (Phaser.Geom.Intersects.RectangleToRectangle(b, caixa) && cobre(r.id, b)) { atras = true; break; }
        }
        if (atras !== r.translucido) {
          r.translucido = atras;
          cenaAtual.tweens.killTweensOf(r.img);
          cenaAtual.tweens.add({ targets: r.img, alpha: atras ? 0.45 : 1, duration: 150, ease: 'Sine.easeOut' });
        }
      }
      for (const [, a] of atores) {
        if (!a.silhueta) continue;
        const s = a.sprite;
        const coberto = s.active && s.visible && cobertura(s) > 0.4;
        if (coberto && !a.contorno && cenaAtual.textures.exists(`contorno-${s.texture.key}`)) {
          a.contorno = cenaAtual.add.sprite(s.x, s.y, `contorno-${s.texture.key}`, s.frame.name).setAlpha(0.6).setDepth(PROF.neblinaFrente - 1);
        }
        if (a.contorno) {
          a.contorno.setVisible(coberto);
          if (coberto) a.contorno.setPosition(s.x, s.y).setOrigin(s.originX, s.originY).setScale(s.scaleX, s.scaleY).setFrame(s.frame.name);
        }
      }
    }

    const largura = () => Math.max(1, o.container.clientWidth);
    const altura = () => Math.max(1, o.container.clientHeight);
    const jogo = new Phaser.Game({
      type: Phaser.AUTO,
      parent: o.container,
      width: Math.round(largura() * dpr),
      height: Math.round(altura() * dpr),
      backgroundColor: '#0b1020',
      banner: false,
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
      audio: { noAudio: true },
      input: { keyboard: false, gamepad: false },
      // Cenário suave (antialias); personagens com filtro nearest por textura e posições em pixel inteiro.
      render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
      scene: CenaExploracao,
    });

    // Acompanha o tamanho do container (girar o celular, teclado, redimensionar a janela).
    const observador = new ResizeObserver(() => {
      if (destruido) return;
      jogo.scale.resize(Math.round(largura() * dpr), Math.round(altura() * dpr));
      jogo.scale.setZoom(1 / dpr);
      const cam = jogo.scene.getScene('exploracao')?.cameras?.main;
      if (cam) cam.setZoom(zoomCamera());
    });
    observador.observe(o.container);

    const teclaF2 = (e: KeyboardEvent) => {
      if (e.key === 'F2' && motor) {
        e.preventDefault();
        motor.alternarDebug();
      }
    };
    window.addEventListener('keydown', teclaF2);

    function destruir() {
      if (destruido) return;
      destruido = true;
      observador.disconnect();
      window.removeEventListener('keydown', teclaF2);
      rotuloDebug.remove();
      jogo.destroy(true);
    }
  });
}
