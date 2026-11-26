// Prepara os sons e as músicas do Ato I (Fase 6) a partir das gravações originais (pasta FdG).
//
//   node scripts/prepare-audio-ato1.mjs                  (usa C:\Users\...\Documents\FdG)
//   node scripts/prepare-audio-ato1.mjs "D:\outra\FdG"
//
// Todos viram MP3 de 128 kbps, sem o silêncio do começo. Os loops (fogo distante, gotejar, tocha) são um
// trecho do original com crossfade de 0,5 s no ponto do loop: o fim do trecho emenda no começo sem estalo.
// Os originais longos (a tocha tem 13 min, o fogo 5 min) entram só como um trecho de 20 s.
// Copia, não move: os originais ficam onde estão.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || process.env.FDG_DIR || 'C:\\Users\\AdamPauloCarrijoNeve\\Documents\\FdG';
const SFX_OUT = path.join('public', 'assets', 'sfx');
const MUS_OUT = path.join('public', 'assets', 'music');

/** Efeitos: arquivo original → id. `loop`: [início, duração] do trecho; `max`: corta a duração. */
const EFEITOS = [
  { arq: 'fx_fogo_distante.wav', id: 'fogo-distante', loop: [30, 20] },
  { arq: 'fx_madeira_estalando.m4a', id: 'madeira-estalando', max: 6 },
  { arq: 'fx_cadeado_abrindo.wav', id: 'cadeado-abrindo' },
  { arq: 'fx_cadeado_cai.wav', id: 'cadeado-cai' },
  { arq: 'fx_alcapao_fecha.wav', id: 'alcapao-fecha' },
  { arq: 'fx_cadeado_tranca.wav', id: 'cadeado-tranca' },
  { arq: 'fx_passos_afastando.wav', id: 'passos-afastando' },
  { arq: 'fx_gotejar.mp3', id: 'gotejar', loop: [0, 19] },
  { arq: 'fx_tocha.wav', id: 'tocha', loop: [60, 20] },
  { arq: 'fx_armadilha_estalo.wav', id: 'armadilha-estalo' },
  { arq: 'fx_tochas_acendendo.wav', id: 'tochas-acendendo' },
  // Freesound 553250, "opening door squeak" (título no arquivo: "Tür öffnen"), de nachtmahrtv.
  { arq: '553250__nachtmahrtv__opening-door-squeak.wav', id: 'porta-antiga' },
];
const MUSICAS = [
  { arq: 'tunel.mp3', id: 'tunel' },
  { arq: 'forja.mp3', id: 'forja' },
];
const XFADE = 0.5;

function ffmpeg() {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return 'ffmpeg';
  throw new Error('ffmpeg não encontrado no PATH.');
}
const FF = ffmpeg();

function rodar(args) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg falhou: ${args.join(' ')}`);
}

/** Tira o silêncio do começo (abaixo de −50 dB). */
const SEM_SILENCIO = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02';
const MP3 = ['-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k'];

function efeito({ arq, id, loop, max }) {
  const ent = path.join(SRC, 'sfx', arq);
  if (!existsSync(ent)) { console.warn(`  ! falta ${arq} (o jogo usa o provisório de ${id}, se houver)`); return false; }
  const saida = path.join(SFX_OUT, `${id}.mp3`);
  if (loop) {
    const [ini, dur] = loop;
    // [corpo] = trecho com fade-in de XFADE; [cauda] = os XFADE s seguintes, com fade-out, somados ao começo.
    const filtro = [
      `[0:a]atrim=start=${ini}:end=${ini + dur + XFADE},asetpts=PTS-STARTPTS,aresample=44100,asplit=2[a][b]`,
      `[a]atrim=0:${dur},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${XFADE}[corpo]`,
      `[b]atrim=${dur}:${dur + XFADE},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${XFADE}[cauda]`,
      '[corpo][cauda]amix=inputs=2:duration=first:normalize=0[s]',
    ].join(';');
    rodar(['-i', ent, '-filter_complex', filtro, '-map', '[s]', ...MP3, saida]);
  } else {
    const filtros = [SEM_SILENCIO, ...(max ? [`atrim=0:${max}`, `afade=t=out:st=${max - 0.4}:d=0.4`] : [])].join(',');
    rodar(['-i', ent, '-af', filtros, ...MP3, saida]);
  }
  console.log(`  ✓ ${id}.mp3`);
  return true;
}

function musica({ arq, id }) {
  const ent = path.join(SRC, 'músicas', arq);
  if (!existsSync(ent)) { console.warn(`  ! falta a música ${arq}`); return; }
  rodar(['-i', ent, '-map_metadata', '-1', ...MP3, path.join(MUS_OUT, `${id}.mp3`)]);
  console.log(`  ✓ música ${id}.mp3`);
}

mkdirSync(SFX_OUT, { recursive: true });
mkdirSync(MUS_OUT, { recursive: true });
console.log('Efeitos do Ato I:');
const faltando = EFEITOS.filter((e) => !efeito(e)).map((e) => e.id);
console.log('Músicas do Ato I:');
MUSICAS.forEach(musica);
if (faltando.length) console.log(`Provisórios: ${faltando.join(', ')}`);
