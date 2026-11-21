// Ícones do app (Fase 5): a partir do logo (assets-src/logos/a-forja-do-heroi.png, cópia de
// FdG/img/logos/A Forja do Herói.png) → public/icons/icone-192.png, icone-512.png, icone-maskable-512.png
// e apple-touch-icon.png (180). Fundo escuro do jogo, logo centralizado.
// Uso: npm run sprites (roda junto) ou node scripts/build-icones.mjs
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(ROOT, 'assets-src', 'logos', 'a-forja-do-heroi.png');
const SAIDA = path.join(ROOT, 'public', 'icons');
const FUNDO = { r: 13, g: 11, b: 9, alpha: 1 };

async function icone(tam, arq, margem) {
  const larg = Math.round(tam * (1 - margem * 2));
  const logo = await sharp(LOGO).trim().resize({ width: larg, height: larg, fit: 'inside' }).png().toBuffer();
  const fundo = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}"><defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#2a2016"/><stop offset="1" stop-color="#0d0b09"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  await sharp({ create: { width: tam, height: tam, channels: 4, background: FUNDO } })
    .composite([{ input: fundo }, { input: logo, gravity: 'center' }]).png().toFile(path.join(SAIDA, arq));
  console.log(`  icons/${arq}`);
}
await mkdir(SAIDA, { recursive: true });
await icone(192, 'icone-192.png', 0.06);
await icone(512, 'icone-512.png', 0.06);
// "maskable": o sistema pode cortar em círculo; o logo fica dentro da zona segura (80%).
await icone(512, 'icone-maskable-512.png', 0.14);
await icone(180, 'apple-touch-icon.png', 0.06);
