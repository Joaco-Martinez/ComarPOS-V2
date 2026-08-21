// El ESP32 reescala esto a un cuadrado de 280x280px (35x35mm @ 203dpi, ver
// TARGET_SIZE en printbox/src/main.cpp) manteniendo proporcion -- este
// ancho tiene que ser >= 280 para que esa reescalada no haga upscale (que
// se ve borroso/con bloques) de una fuente mas chica.
const DEFAULT_TARGET_WIDTH_PX = 320;

function buildRasterCommand(
  widthPx: number,
  heightPx: number,
  pixels: Uint8Array
): Buffer {
  const widthBytes = Math.ceil(widthPx / 8);

  const raster = Buffer.alloc(
    widthBytes * heightPx,
    0
  );

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {

      if (pixels[y * widthPx + x] !== 1) {
        continue;
      }

      const byteIndex =
        y * widthBytes +
        Math.floor(x / 8);

      const bit =
        7 - (x % 8);

      raster[byteIndex] |= 1 << bit;
    }
  }

  const header = Buffer.from([
    0x1D,
    0x76,
    0x30,
    0x00,

    widthBytes & 0xFF,
    (widthBytes >> 8) & 0xFF,

    heightPx & 0xFF,
    (heightPx >> 8) & 0xFF,
  ]);

  return Buffer.concat([
    header,
    raster,
  ]);
}

export async function rasterizeLogoForEscPos(
  imageSource: string | Buffer,
  targetWidthPx = DEFAULT_TARGET_WIDTH_PX
): Promise<Buffer> {
  const { Jimp } = await import("jimp");

  const image = await Jimp.read(imageSource as any);

  if (!image.bitmap.width || !image.bitmap.height) {
    throw new Error("Logo inválido: no tiene dimensiones");
  }

  const scale = targetWidthPx / image.bitmap.width;

  const targetHeightPx = Math.max(
    1,
    Math.round(image.bitmap.height * scale)
  );

  image.resize({
    w: targetWidthPx,
    h: targetHeightPx,
  });

  image.greyscale();

  const pixels = new Uint8Array(
    targetWidthPx * targetHeightPx
  );

  for (let y = 0; y < targetHeightPx; y++) {
    for (let x = 0; x < targetWidthPx; x++) {
      const hex = image.getPixelColor(x, y);

      // Jimp devuelve 0xRRGGBBAA
      const red = (hex >>> 24) & 0xff;
      const alpha = hex & 0xff;

      /*
       * Fondo transparente = BLANCO
       *
       * Pixel visible + oscuro = NEGRO
       */
      const isBlack =
        alpha > 128 &&
        red < 150;

      pixels[y * targetWidthPx + x] = isBlack ? 1 : 0;
    }
  }

  const result = buildRasterCommand(
    targetWidthPx,
    targetHeightPx,
    pixels
  );

  console.log(
    `[PrintBox] Logo rasterizado: ` +
    `${targetWidthPx}x${targetHeightPx}px, ` +
    `${result.length} bytes`
  );

  return result;
}