// Convierte el logo del tenant (PNG/JPG/WEBP arbitrario, ver
// tenantLogo.service.ts) a un bitmap ESC/POS listo para imprimir. El ESP32
// no decodifica imagenes comprimidas -- necesita bytes 1bpp tal cual el
// comando GS v 0 los espera.
const DEFAULT_TARGET_WIDTH_PX = 384; // ancho tipico de impresoras termicas de 58/80mm a 203dpi

function buildRasterCommand(widthPx: number, heightPx: number, pixels: Uint8Array) {
  const widthBytes = Math.ceil(widthPx / 8);
  const raster = Buffer.alloc(widthBytes * heightPx, 0);

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      const isBlack = pixels[y * widthPx + x] === 1;
      if (!isBlack) continue;

      const byteIndex = y * widthBytes + Math.floor(x / 8);
      const bit = 7 - (x % 8);
      raster[byteIndex] |= 1 << bit;
    }
  }

  const header = Buffer.from([
    0x1d,
    0x76,
    0x30,
    0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    heightPx & 0xff,
    (heightPx >> 8) & 0xff,
  ]);

  return Buffer.concat([header, raster]);
}

/**
 * imageSource: path local o Buffer con la imagen original (PNG/JPG/WEBP).
 * Devuelve el comando ESC/POS GS v 0 completo (header + bitmap), listo
 * para mandarle directo al socket 9100 de la impresora.
 */
export async function rasterizeLogoForEscPos(
  imageSource: string | Buffer,
  targetWidthPx = DEFAULT_TARGET_WIDTH_PX
): Promise<Buffer> {
  const { Jimp } = await import("jimp");

  const image = await Jimp.read(imageSource as any);

  const scale = targetWidthPx / image.bitmap.width;
  const targetHeightPx = Math.max(1, Math.round(image.bitmap.height * scale));

  image.resize({ w: targetWidthPx, h: targetHeightPx });
  image.greyscale();

  const pixels = new Uint8Array(targetWidthPx * targetHeightPx);

  for (let y = 0; y < targetHeightPx; y++) {
    for (let x = 0; x < targetWidthPx; x++) {
      const hex = image.getPixelColor(x, y); // 0xRRGGBBAA (greyscale => R=G=B)
      const red = (hex >>> 24) & 0xff;
      pixels[y * targetWidthPx + x] = red < 128 ? 1 : 0;
    }
  }

  return buildRasterCommand(targetWidthPx, targetHeightPx, pixels);
}
