// Prepara os efeitos sonoros reais da tragédia (Fase 5C) a partir das gravações originais (pasta FdG).
//
//   node scripts/prepare-audio.mjs                  (usa C:\Users\...\Documents\FdG)
//   node scripts/prepare-audio.mjs "D:\outra\FdG"
//
// - gritos-fullmun.mp3: o trecho GRITOS_INICIO–GRITOS_FIM da multidão, tratado para soar como um ataque
//   distante ouvido de dentro do templo (passa-baixa, eco curto, um semitom abaixo, volume normalizado,
//   fade-in de 0,1 s e fade-out de 1,5 s embutidos). MP3 128 kbps.
// - flecha-nyme.mp3: o woosh inteiro, sem o silêncio do começo (bate junto com a troca de imagem).
// - assets-src/audio-teste/: o trecho cru (antes), o tratado (depois) e três trechos alternativos, para ouvir.
//
// Medição (RMS em janelas de 0,5 s, primeiros 15 s do original): o pico de gritos vai de ~0,7 s a ~6 s
// (−11,6 a −12,6 dBFS); dali em diante cai (−15 a −20 dBFS) e, depois de ~12 s, quase só risadas e silêncio.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || process.env.FDG_DIR || 'C:\\Users\\AdamPauloCarrijoNeve\\Documents\\FdG';
const SFX_OUT = path.join('public', 'assets', 'sfx');
const TESTE = path.join('assets-src', 'audio-teste');

/** Trecho dos gritos (segundos no original). Padrão: o pico do começo, antes das risadas. */
export const GRITOS_INICIO = 0.5;
export const GRITOS_FIM = 6.5;
/** Trechos alternativos para comparar (mesmo tratamento). */
const ALTERNATIVAS = [[0, 6], [3, 9], [8, 14]];

const SEMITOM = 2 ** (-1 / 12); // −1 semitom

function ffmpeg() {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return 'ffmpeg';
  throw new Error('ffmpeg não encontrado no PATH.');
}
const FF = ffmpeg();

function rodar(args) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg falhou: ${args.join(' ')}`);
}

/** Cadeia de filtros do grito distante, para um trecho [ini, fim] do original. */
function filtrosGritos(ini, fim) {
  const dur = fim - ini;
  return [
    `atrim=start=${ini}:end=${fim}`,
    'asetpts=PTS-STARTPTS',
    'aresample=48000',
    // Abafado: como quem ouve através de paredes de pedra.
    'lowpass=f=2500:poles=2',
    // Distância: um eco curto e fraco.
    'aecho=0.8:0.55:70|140:0.30|0.18',
    // Um semitom abaixo, sem mudar a duração.
    `asetrate=${Math.round(48000 * SEMITOM)}`,
    'aresample=48000',
    `atempo=${(1 / SEMITOM).toFixed(5)}`,
    // Volume normalizado.
    'loudnorm=I=-16:TP=-1.5:LRA=11',
    'aresample=48000',
    'afade=t=in:st=0:d=0.1',
    `afade=t=out:st=${(dur - 1.5).toFixed(2)}:d=1.5`,
  ].join(',');
}

const mp3 = ['-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k'];

const gritos = path.join(SRC, 'sfx', 'fx_gritos_fullmun.wav');
const flecha = path.join(SRC, 'sfx', 'fx_flecha_nyme.wav');
for (const f of [gritos, flecha]) if (!existsSync(f)) throw new Error(`Arquivo não encontrado: ${f}`);
mkdirSync(SFX_OUT, { recursive: true });
mkdirSync(TESTE, { recursive: true });

// Gritos: o trecho escolhido, tratado.
rodar(['-i', gritos, '-af', filtrosGritos(GRITOS_INICIO, GRITOS_FIM), ...mp3, path.join(SFX_OUT, 'gritos-fullmun.mp3')]);
console.log(`gritos-fullmun.mp3: ${GRITOS_INICIO}s–${GRITOS_FIM}s, tratado`);

// Escuta: antes (cru, só o corte) e depois; e as alternativas.
rodar(['-i', gritos, '-af', `atrim=start=${GRITOS_INICIO}:end=${GRITOS_FIM},asetpts=PTS-STARTPTS`, ...mp3, path.join(TESTE, 'gritos-antes.mp3')]);
rodar(['-i', gritos, '-af', filtrosGritos(GRITOS_INICIO, GRITOS_FIM), ...mp3, path.join(TESTE, 'gritos-depois.mp3')]);
for (const [a, b] of ALTERNATIVAS) {
  const nome = `gritos-alt-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}.mp3`;
  rodar(['-i', gritos, '-af', filtrosGritos(a, b), ...mp3, path.join(TESTE, nome)]);
  console.log(`alternativa ${nome}`);
}

// Flecha: inteira, sem o silêncio do começo.
rodar(['-i', flecha, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005', ...mp3, path.join(SFX_OUT, 'flecha-nyme.mp3')]);
console.log('flecha-nyme.mp3: sem o silêncio inicial');
