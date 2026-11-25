import { ASSETS, SFX, src, type NomeSfx } from './assets';
import { criarAmbiente, type Ambiente } from './ambiente';
import { getEstado } from './estado';

/** Um dos dois canais de música (dois elementos permitem crossfade entre faixas). */
interface Canal {
  el: HTMLAudioElement;
  faixa: string | null;
  /** Fator do fade (0 a 1), multiplicado pelo volume das Opções. */
  fator: number;
  anim: number;
  /** Foi mandado tocar (e não terminou nem foi parado). Não depende de o navegador já ter começado. */
  ligado: boolean;
}

/** Estado da música, para os testes e para o Diário. */
export interface EstadoMusica {
  faixa: string | null;
  playlist: string[] | null;
  tocando: boolean;
  loop: boolean;
  /** Faixas que já começaram a tocar, em ordem (para conferir a alternância da playlist). */
  historico: string[];
}

/**
 * Gerenciador de áudio único do jogo.
 * - Música: dois HTMLAudioElement (streaming) que se alternam para fazer crossfade. Sobrevivem às trocas
 *   de tela. Pedir a mesma faixa (ou a mesma playlist) que já está tocando não a reinicia.
 *   Playlist: as faixas tocam uma depois da outra, alternando, sem repetir a mesma seguida.
 *   Vinheta: toca uma vez, sem loop, e avisa quando termina.
 * - Efeitos: Web Audio (buffers decodificados no pré-carregamento, com um nó de ganho).
 * Volume e mudo vêm das Opções (estado.config).
 */
class GerenciadorAudio {
  private ctx: AudioContext | null = null;
  private ganhoSfx: GainNode | null = null;
  private buffers = new Map<NomeSfx, AudioBuffer>();
  private canais: Canal[] = [0, 1].map(() => ({ el: new Audio(), faixa: null, fator: 0, anim: 0, ligado: false }));
  private ativo = 0;
  private querTocando = false;
  private playlist: string[] | null = null;
  private indicePlaylist = 0;
  private aoTerminarVinheta: (() => void) | null = null;
  private historico: string[] = [];
  private ultimoHover = 0;
  private videos = new Set<HTMLMediaElement>();

  constructor() {
    for (const c of this.canais) {
      c.el.preload = 'auto';
      c.el.addEventListener('ended', () => { c.ligado = false; this.aoTerminarFaixa(c); });
    }
    document.addEventListener('visibilitychange', () => {
      const el = this.canal.el;
      if (document.hidden) el.pause();
      else if (this.querTocando) el.play().catch(() => {});
    });
  }

  private get canal(): Canal {
    return this.canais[this.ativo];
  }

  private contexto(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.ganhoSfx = this.ctx.createGain();
    this.ganhoSfx.connect(this.ctx.destination);
    this.aplicarVolumes();
    return this.ctx;
  }

  /** Decodifica os efeitos (os da interface no pré-carregamento; os do sonho ao entrar nele). */
  async carregarEfeitos(nomes: readonly NomeSfx[] = SFX): Promise<void> {
    const ctx = this.contexto();
    if (!ctx) return;
    await Promise.all(
      nomes.filter((n) => !this.buffers.has(n)).map(async (nome) => {
        try {
          const dados = await (await fetch(src(ASSETS.sfx(nome)))).arrayBuffer();
          this.buffers.set(nome, await ctx.decodeAudioData(dados));
        } catch (erro) {
          console.warn(`Efeito não carregado: ${nome}`, erro);
        }
      }),
    );
  }

  /**
   * Chamado no clique "Clique para começar": libera o áudio do navegador.
   * Não contorna o bloqueio de autoplay, só aproveita o gesto do jogador.
   */
  desbloquear(): void {
    this.contexto()?.resume().catch(() => {});
    // iOS: um play() dentro do gesto libera cada elemento para tocar depois, fora de gestos.
    for (const c of this.canais) {
      if (c.faixa) continue;
      if (c === this.canal) {
        c.el.src = src(ASSETS.musicaMenu);
        c.faixa = ASSETS.musicaMenu;
      }
      c.el.muted = true;
      c.el.play().then(() => {
        if (!this.querTocando || c !== this.canal) c.el.pause();
        this.aplicarVolumes();
      }).catch(() => this.aplicarVolumes());
    }
  }

  /** `taxa` muda a velocidade/tom (passos com variação); `ganho` é relativo ao volume dos efeitos. */
  sfx(nome: NomeSfx, opcoes: { taxa?: number; ganho?: number } = {}): void {
    const { config } = getEstado();
    const ctx = this.ctx;
    const buffer = this.buffers.get(nome);
    const tocou = !(config.mudo || config.efeitos <= 0) && !!ctx && !!buffer && !!this.ganhoSfx && ctx.state === 'running';
    if (nome !== 'ui-hover' && nome !== 'text-blip') {
      this.historicoSfx.push({ nome, taxa: opcoes.taxa ?? 1, t: Math.round(performance.now()), tocou });
      if (this.historicoSfx.length > 60) this.historicoSfx.shift();
    }
    if (!tocou || !ctx || !buffer || !this.ganhoSfx) return;
    if (nome === 'ui-hover') {
      const agora = performance.now();
      if (agora - this.ultimoHover < 60) return;
      this.ultimoHover = agora;
    }
    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    if (opcoes.taxa) fonte.playbackRate.value = opcoes.taxa;
    if (opcoes.ganho !== undefined && opcoes.ganho !== 1) {
      const g = ctx.createGain();
      g.gain.value = opcoes.ganho;
      fonte.connect(g).connect(this.ganhoSfx);
    } else {
      fonte.connect(this.ganhoSfx);
    }
    fonte.start();
  }

  /** Os últimos efeitos pedidos (sem o hover e o blip do texto), para os testes. */
  private historicoSfx: { nome: string; taxa: number; t: number; tocou: boolean }[] = [];
  efeitosRecentes() { return [...this.historicoSfx]; }
  /** Duração (s) de um efeito já decodificado, ou null. */
  duracaoEfeito(nome: NomeSfx): number | null { return this.buffers.get(nome)?.duration ?? null; }
  /** Fator de volume da música (abafada na câmera lenta = 0,3). */
  get abafada(): boolean { return this.fatorAbafar < 1; }

  /** Efeito em loop (ex.: batida do coração na câmera lenta). Devolve a função que para. */
  sfxLoop(nome: NomeSfx, ganho = 1): () => void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(nome);
    if (!ctx || !buffer || !this.ganhoSfx) return () => {};
    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    fonte.loop = true;
    const g = ctx.createGain();
    g.gain.value = ganho;
    fonte.connect(g).connect(this.ganhoSfx);
    fonte.start();
    return () => { try { fonte.stop(); } catch { /* já parou */ } };
  }

  /** Música abafada (câmera lenta): o elemento de áudio não passa por filtro, então só baixa o volume. */
  private fatorAbafar = 1;
  /** Volume relativo pedido pela tela (ex.: intro de Füllmun a 50%). */
  private fatorExtra = 1;
  volumeRelativo(f: number): void {
    this.fatorExtra = f;
    this.aplicarVolumes();
  }
  abafar(sim: boolean): void {
    this.fatorAbafar = sim ? 0.3 : 1;
    this.aplicarVolumes();
  }

  /** Ambiente sintetizado (drone suave), usado quando a cena não tem música própria. */
  private ambiente: Ambiente | null = null;

  tocarAmbiente(fadeMs = 2000): void {
    const ctx = this.contexto();
    if (!ctx || this.ambiente) return;
    ctx.resume().catch(() => {});
    this.ambiente = criarAmbiente(ctx, () => this.volumeMusica());
    this.ambiente.iniciar(fadeMs);
  }

  pararAmbiente(fadeMs = 1500): void {
    this.ambiente?.parar(fadeMs);
    this.ambiente = null;
  }

  /** Volume efetivo da música pelas Opções (0 se mudo). */
  private volumeMusica(): number {
    const { config } = getEstado();
    return config.mudo ? 0 : config.musica;
  }

  /** A faixa está tocando agora no canal ativo? */
  private tocandoAgora(caminho: string): boolean {
    const c = this.canal;
    return c.faixa === caminho && c.ligado && this.querTocando && !c.el.ended;
  }

  /**
   * Troca de faixa com crossfade: a atual some em `fadeMs` enquanto a nova entra no outro canal.
   * Sem faixa tocando, é só um fade-in.
   */
  private trocarPara(caminho: string, fadeMs: number, loop: boolean): void {
    this.querTocando = true;
    const velho = this.canal;
    const tinhaSom = !velho.el.paused && velho.fator > 0.01;
    if (tinhaSom) {
      this.ativo = 1 - this.ativo;
      velho.ligado = false;
      this.fade(velho, 0, fadeMs, () => velho.el.pause());
    } else {
      velho.ligado = false;
      velho.el.pause();
    }
    const novo = this.canal;
    cancelAnimationFrame(novo.anim);
    if (novo.faixa !== caminho) {
      novo.el.src = src(caminho);
      novo.faixa = caminho;
    } else {
      novo.el.currentTime = 0;
    }
    novo.el.loop = loop;
    novo.fator = 0;
    novo.ligado = true;
    this.historico.push(caminho);
    if (this.historico.length > 50) this.historico.shift();
    this.aplicarVolumes();
    novo.el.play().catch((erro) => console.warn('Música bloqueada pelo navegador.', erro));
    this.fade(novo, 1, fadeMs);
  }

  /** Toca a faixa em loop com fade (crossfade se outra estiver tocando). Se ela já estiver tocando, não reinicia. */
  tocarMusica(caminho: string, fadeMs = 2000): void {
    this.playlist = null;
    this.aoTerminarVinheta = null;
    if (this.tocandoAgora(caminho)) {
      this.querTocando = true;
      this.canal.el.loop = true;
      this.fade(this.canal, 1, fadeMs);
      return;
    }
    this.trocarPara(caminho, fadeMs, true);
  }

  /**
   * Playlist: toca as faixas em sequência, sem loop em cada uma; quando uma acaba, emenda na próxima
   * (nunca repete a mesma seguida). Pedir a mesma playlist que já está tocando não reinicia nada.
   */
  tocarPlaylist(faixas: string[], fadeMs = 1500): void {
    this.aoTerminarVinheta = null;
    const mesma = this.playlist && this.playlist.join('|') === faixas.join('|');
    if (mesma && this.canal.faixa && this.tocandoAgora(this.canal.faixa)) {
      this.querTocando = true;
      this.fade(this.canal, 1, fadeMs);
      return;
    }
    this.playlist = [...faixas];
    this.indicePlaylist = 0;
    this.trocarPara(faixas[0], fadeMs, faixas.length === 1);
  }

  /** Vinheta (vitória): toca uma vez, sem loop; ao terminar, chama `depois` (ex.: voltar à música da cena). */
  tocarVinheta(caminho: string, depois?: () => void, fadeMs = 300): void {
    this.playlist = null;
    this.aoTerminarVinheta = depois ?? null;
    this.trocarPara(caminho, fadeMs, false);
  }

  private aoTerminarFaixa(c: Canal): void {
    if (c !== this.canal) return;
    if (this.playlist && this.playlist.length > 1) {
      this.indicePlaylist = (this.indicePlaylist + 1) % this.playlist.length;
      this.trocarPara(this.playlist[this.indicePlaylist], 400, false);
    } else if (this.aoTerminarVinheta) {
      const depois = this.aoTerminarVinheta;
      this.aoTerminarVinheta = null;
      this.querTocando = false;
      depois();
    }
  }

  pararMusica(fadeMs = 1000): void {
    this.querTocando = false;
    this.playlist = null;
    this.aoTerminarVinheta = null;
    const c = this.canal;
    c.ligado = false;
    this.fade(c, 0, fadeMs, () => c.el.pause());
  }

  estadoMusica(): EstadoMusica {
    const c = this.canal;
    return {
      faixa: c.faixa,
      playlist: this.playlist ? [...this.playlist] : null,
      tocando: this.querTocando && !c.el.paused,
      loop: c.el.loop,
      historico: [...this.historico],
    };
  }

  /** Para testes: leva a faixa atual para perto do fim (a playlist emenda na próxima). */
  pularParaOFim(): void {
    const el = this.canal.el;
    const ir = () => { el.currentTime = Math.max(0, el.duration - 0.4); };
    // Pela rede, a faixa nova pode ainda não saber a duração: espera os metadados.
    if (Number.isFinite(el.duration)) ir();
    else el.addEventListener('loadedmetadata', ir, { once: true });
  }

  private fade(c: Canal, alvo: number, ms: number, aoTerminar?: () => void): void {
    cancelAnimationFrame(c.anim);
    const inicio = performance.now();
    const de = c.fator;
    const passo = (agora: number) => {
      const t = ms <= 0 ? 1 : Math.min(1, (agora - inicio) / ms);
      c.fator = de + (alvo - de) * t;
      this.aplicarVolumes();
      if (t < 1) c.anim = requestAnimationFrame(passo);
      else aoTerminar?.();
    };
    c.anim = requestAnimationFrame(passo);
  }

  /** Vídeos com som (abertura, prólogo) seguem o volume da música e o mudo. */
  registrarVideo(v: HTMLMediaElement): () => void {
    this.videos.add(v);
    this.aplicarVolumes();
    return () => this.videos.delete(v);
  }

  aplicarVolumes(): void {
    const { config } = getEstado();
    for (const c of this.canais) {
      c.el.muted = config.mudo;
      c.el.volume = Math.max(0, Math.min(1, config.musica * c.fator * this.fatorAbafar * this.fatorExtra));
    }
    if (this.ganhoSfx) this.ganhoSfx.gain.value = config.mudo ? 0 : config.efeitos;
    this.ambiente?.atualizarVolume();
    for (const v of this.videos) {
      v.muted = config.mudo;
      v.volume = config.musica;
    }
  }
}

export const audio = new GerenciadorAudio();
