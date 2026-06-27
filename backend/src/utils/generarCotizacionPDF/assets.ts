/**
 * Resolucion de logo e imagenes de producto (filesystem/URL/base64), con cache.
 * Extraidos de generarCotizacionPDF.ts (modularizacion, doc seccion 4).
 */
import fs from "fs";
import path from "path";

const imageCache = new Map<string, Buffer | null>();

export function findLogoPath() {
  const candidates = [
    path.join(process.cwd(), "src", "utils", "logo-vj.png"),
    path.join(process.cwd(), "src", "utils", "logo-vj.jpg"),
    path.join(process.cwd(), "src", "utils", "logo-vj.jpeg"),
    path.join(process.cwd(), "src", "utils", "logo-vj.webp"),
  ];

  return candidates.find((file) => fs.existsSync(file)) || null;
}

export async function getImageBuffer(src?: string | null) {
  if (!src) return null;

  if (imageCache.has(src)) {
    return imageCache.get(src) ?? null;
  }

  try {
    if (src.startsWith("data:image/")) {
      const base64 = src.split(",")[1];
      const buffer = Buffer.from(base64, "base64");
      imageCache.set(src, buffer);
      return buffer;
    }

    if (src.startsWith("http://") || src.startsWith("https://")) {
      const response = await fetch(src);

      if (!response.ok) {
        imageCache.set(src, null);
        return null;
      }

      const arr = await response.arrayBuffer();
      const buffer = Buffer.from(arr);
      imageCache.set(src, buffer);
      return buffer;
    }

    const absolute = path.isAbsolute(src) ? src : path.join(process.cwd(), src);

    if (!fs.existsSync(absolute)) {
      imageCache.set(src, null);
      return null;
    }

    const buffer = fs.readFileSync(absolute);
    imageCache.set(src, buffer);
    return buffer;
  } catch {
    imageCache.set(src, null);
    return null;
  }
}
