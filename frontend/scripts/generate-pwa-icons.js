// One-off script: generates the PWA icon set from public/brand/isologo.png.
// Run with: node scripts/generate-pwa-icons.js
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'public', 'brand', 'isologo.png');
const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const APP_DIR = path.join(__dirname, '..', 'app');

// isologo.png tiene mucho blanco de sobra alrededor del isotipo real (viene
// de un canvas de diseño más grande) - sin recortarlo primero, cualquier
// padPercent queda aplicado sobre ese lienzo entero, no sobre el dibujo, y
// el ícono termina viéndose chico dentro del cuadrado (ver /guia visual del
// isotipo real vs. el archivo fuente). `.trim()` saca ese margen antes de
// componer, así padPercent sí controla el margen real alrededor del dibujo.
async function trimmedSource() {
  return sharp(SRC).trim().toBuffer();
}

async function squareOnWhite(size, padPercent = 0) {
  const pad = Math.round(size * padPercent);
  const inner = size - pad * 2;
  const trimmed = await trimmedSource();
  const logo = await sharp(trimmed).resize(inner, inner, { fit: 'contain', background: '#FFFFFF' }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: logo, left: pad, top: pad }])
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  const icon192 = await squareOnWhite(192, 0.08);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon-192.png'), icon192);

  const icon512 = await squareOnWhite(512, 0.08);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon-512.png'), icon512);

  // Maskable needs a larger safe-zone (~20%) since OSes crop to a circle/rounded-square.
  const maskable512 = await squareOnWhite(512, 0.20);
  fs.writeFileSync(path.join(ICONS_DIR, 'maskable-512.png'), maskable512);

  const apple180 = await squareOnWhite(180, 0.10);
  fs.writeFileSync(path.join(APP_DIR, 'apple-icon.png'), apple180);

  // Next's app/icon.png convention (favicon/tab icon) — regenerate at 512 for crisp scaling.
  fs.writeFileSync(path.join(APP_DIR, 'icon.png'), icon512);

  console.log('PWA icons generated in public/icons/, app/apple-icon.png, app/icon.png');
}

main().catch((e) => { console.error(e); process.exit(1); });
