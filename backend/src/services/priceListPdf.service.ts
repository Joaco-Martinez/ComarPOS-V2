/**
 * Lista de precios descargable en PDF con la foto de cada producto (pedido
 * explicito: poder mandarle a un cliente la lista completa con imagenes).
 * Una fila por producto vendible (las variantes van una por una, con su
 * foto o la del padre), agrupadas por categoria. El precio sale de la lista
 * elegida; si el producto no tiene precio propio en esa lista se usa el de
 * Minorista (mismo criterio que el POS).
 */
import PDFDocument from "pdfkit";
import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { COMARPOS_FOOTER_TEXT } from "../utils/comarposBranding";

type PdfRow = {
  name: string;
  sku: string | null;
  category: string;
  price: number;
  isKg: boolean;
  imageUrl: string | null;
};

const SIN_CATEGORIA = "Sin categoría";
const IMAGE_FETCH_TIMEOUT_MS = 8000;
const IMAGE_FETCH_CONCURRENCY = 8;

function formatMoneyAR(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateAR(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

// Las fotos de producto estan en Cloudinary: se piden ya achicadas y en JPG
// (PDFKit solo entiende JPG/PNG y una lista con cientos de fotos originales
// pesaria decenas de MB).
function thumbnailUrl(url: string) {
  if (url.includes("res.cloudinary.com") && url.includes("/image/upload/")) {
    return url.replace("/image/upload/", "/image/upload/c_limit,w_240,h_240,f_jpg,q_70/");
  }
  return url;
}

function isPdfkitImage(buf: Buffer) {
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
  return isPng || isJpg;
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(thumbnailUrl(url), { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const buf = Buffer.from(await response.arrayBuffer());
    if (isPdfkitImage(buf)) return buf;

    // Otro formato (gif, bmp, tiff...) fuera de Cloudinary: se intenta pasar a PNG.
    const { Jimp } = await import("jimp");
    const image = await Jimp.read(buf);
    image.scaleToFit({ w: 240, h: 240 });
    return await image.getBuffer("image/png");
  } catch {
    return null;
  }
}

async function fetchImages(urls: string[]): Promise<Map<string, Buffer>> {
  const unique = Array.from(new Set(urls));
  const result = new Map<string, Buffer>();
  let next = 0;

  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++];
      const buf = await fetchImage(url);
      if (buf) result.set(url, buf);
    }
  };

  await Promise.all(Array.from({ length: Math.min(IMAGE_FETCH_CONCURRENCY, unique.length) }, worker));
  return result;
}

async function getRows(priceListId: string, categoryId?: string): Promise<{ listName: string; rows: PdfRow[] } | null> {
  const list = await prisma.priceList.findFirst({
    where: { id: priceListId, ...tenantScope() },
    select: { name: true, isDefault: true },
  });
  if (!list) return null;

  // Los padres de productos con variantes no se venden: van sus variantes.
  const where: any = { ...tenantScope(), isActive: true, hasVariants: false };
  if (categoryId) {
    where.OR = [{ categoryId }, { categoryId: null, parent: { categoryId } }];
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, sku: true, price: true, pricePerKg: true, saleUnit: true, imageUrl: true,
      category: { select: { name: true } },
      parent: { select: { imageUrl: true, category: { select: { name: true } } } },
    },
  });

  const overrides = list.isDefault
    ? new Map<string, { price: number; pricePerKg: number | null }>()
    : new Map(
        (
          await prisma.priceListItem.findMany({
            where: { priceListId, productId: { in: products.map((p) => p.id) } },
            select: { productId: true, price: true, pricePerKg: true },
          })
        ).map((i) => [i.productId, i])
      );

  const rows = products.map((p) => {
    const isKg = p.saleUnit === "KG";
    const item = overrides.get(p.id);
    const basePrice = isKg ? p.pricePerKg ?? p.price : p.price;
    const price = item ? (isKg ? item.pricePerKg ?? item.price : item.price) : basePrice;
    return {
      name: p.name,
      sku: p.sku,
      category: p.category?.name ?? p.parent?.category?.name ?? SIN_CATEGORIA,
      price: price ?? 0,
      isKg,
      imageUrl: p.imageUrl || p.parent?.imageUrl || null,
    };
  });

  rows.sort((a, b) => {
    if (a.category !== b.category) {
      if (a.category === SIN_CATEGORIA) return 1;
      if (b.category === SIN_CATEGORIA) return -1;
      return a.category.localeCompare(b.category, "es", { numeric: true });
    }
    return a.name.localeCompare(b.name, "es", { numeric: true });
  });

  return { listName: list.name, rows };
}

async function exportPdf(params: {
  priceListId: string;
  categoryId?: string;
  withImages?: boolean;
}): Promise<{ buffer: Buffer; listName: string } | null> {
  const data = await getRows(params.priceListId, params.categoryId);
  if (!data) return null;
  const { listName, rows } = data;
  const withImages = params.withImages !== false;

  const tenantId = currentTenantId();
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, logoUrl: true, ticketBusinessName: true, ticketAddress: true, ticketPhone: true },
      })
    : null;

  const [images, logo] = await Promise.all([
    withImages ? fetchImages(rows.flatMap((r) => (r.imageUrl ? [r.imageUrl] : []))) : Promise.resolve(new Map<string, Buffer>()),
    tenant?.logoUrl ? fetchImage(tenant.logoUrl) : Promise.resolve(null),
  ]);

  const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left * 2;
  const footerSpace = 30;
  const pageBottom = () => doc.page.height - doc.page.margins.bottom - footerSpace;

  // Encabezado (solo en la primera hoja): logo + negocio + lista + fecha.
  let y = doc.page.margins.top;
  let textX = left;
  if (logo) {
    try {
      doc.image(logo, left, y, { fit: [60, 60] });
      textX = left + 72;
    } catch {
      // logo en un formato que PDFKit no lee: se sigue sin logo
    }
  }
  const businessName = tenant?.ticketBusinessName || tenant?.name || "";
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111111")
    .text(businessName, textX, y, { width: width - (textX - left) });
  doc.font("Helvetica").fontSize(9).fillColor("#666666");
  const contact = [tenant?.ticketAddress, tenant?.ticketPhone].filter(Boolean).join(" · ");
  if (contact) doc.text(contact, textX, doc.y + 2, { width: width - (textX - left) });
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#1E3A5F")
    .text(`Lista de precios: ${listName}`, textX, doc.y + 6, { width: width - (textX - left) });
  doc.font("Helvetica").fontSize(9).fillColor("#666666")
    .text(`Precios vigentes al ${formatDateAR(new Date())} · ${rows.length} productos`, textX, doc.y + 2, {
      width: width - (textX - left),
    });
  y = Math.max(doc.y, logo ? doc.page.margins.top + 60 : 0) + 12;
  doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1).stroke("#1E3A5F");
  y += 10;

  if (rows.length === 0) {
    doc.font("Helvetica").fontSize(11).fillColor("#666666")
      .text("No hay productos activos para mostrar.", left, y, { width, align: "center" });
  }

  // Con fotos: 2 columnas de tarjetas (foto + nombre + SKU + precio), unos
  // 20 productos por hoja. Sin fotos: una fila por producto con el precio a
  // la derecha.
  const cols = withImages ? 2 : 1;
  const gap = 10;
  const cellW = (width - gap * (cols - 1)) / cols;
  const imgSize = withImages ? 58 : 0;
  const rowH = withImages ? 68 : 26;
  const categoryH = 22;

  const drawCategory = (name: string, cont = false) => {
    doc.rect(left, y, width, categoryH).fill("#1E3A5F");
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#FFFFFF")
      .text(cont ? `${name} (cont.)` : name, left + 8, y + 6, { width: width - 16, lineBreak: false, ellipsis: true });
    y += categoryH + 4;
  };

  const drawCell = (row: PdfRow, x: number, rowY: number, shaded: boolean) => {
    if (shaded) doc.rect(x, rowY, cellW, rowH - 4).fill("#F4F6F9");
    const priceText = `${formatMoneyAR(row.price)}${row.isKg ? " /kg" : ""}`;

    if (!withImages) {
      const priceW = 130;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111")
        .text(row.name, x + 8, rowY + 7, { width: cellW - priceW - 100, height: 13, ellipsis: true, lineGap: 0 });
      if (row.sku) {
        doc.font("Helvetica").fontSize(8).fillColor("#777777")
          .text(row.sku, x + cellW - priceW - 88, rowY + 8, { width: 80, lineBreak: false, ellipsis: true });
      }
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111")
        .text(priceText, x + cellW - priceW - 8, rowY + 6, { width: priceW, align: "right", lineBreak: false });
      return;
    }

    const imgX = x + 4;
    const imgY = rowY + (rowH - 4 - imgSize) / 2;
    const buf = row.imageUrl ? images.get(row.imageUrl) : undefined;
    let drawn = false;
    if (buf) {
      try {
        doc.image(buf, imgX, imgY, { fit: [imgSize, imgSize], align: "center", valign: "center" });
        drawn = true;
      } catch {
        drawn = false;
      }
    }
    if (!drawn) {
      doc.rect(imgX, imgY, imgSize, imgSize).fillAndStroke("#FFFFFF", "#D5D9E0");
      doc.font("Helvetica").fontSize(7).fillColor("#AAAAAA")
        .text("Sin foto", imgX, imgY + imgSize / 2 - 4, { width: imgSize, align: "center", lineBreak: false });
    }

    const textX = imgX + imgSize + 8;
    const textW = x + cellW - textX - 6;
    const nameSize = 10;
    const lineH = nameSize * 1.18;
    doc.font("Helvetica-Bold").fontSize(nameSize).fillColor("#111111");
    const nameLines = doc.heightOfString(row.name, { width: textW, lineGap: 0 }) > lineH * 1.5 ? 2 : 1;
    const skuH = row.sku ? 11 : 0;
    const priceH = 16;
    const blockTop = rowY + (rowH - 4 - (lineH * nameLines + skuH + priceH + 3)) / 2;
    doc.text(row.name, textX, blockTop, { width: textW, height: lineH * nameLines + 2, ellipsis: true, lineGap: 0 });
    let ty = blockTop + lineH * nameLines + 1;
    if (row.sku) {
      doc.font("Helvetica").fontSize(7.5).fillColor("#777777")
        .text(`SKU: ${row.sku}`, textX, ty, { width: textW, lineBreak: false, ellipsis: true });
      ty += skuH;
    }
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#1E3A5F")
      .text(priceText, textX, ty + 2, { width: textW, lineBreak: false });
  };

  let currentCategory: string | null = null;
  let col = 0;
  let rowIndex = 0;

  for (const row of rows) {
    const newCategory = row.category !== currentCategory;
    if (newCategory && col !== 0) {
      // cierra la fila a medio llenar de la categoria anterior
      y += rowH;
      col = 0;
    }
    if (col === 0) {
      // Que un titulo de categoria nunca quede solo al pie de la hoja.
      const needed = rowH + (newCategory ? categoryH + 4 + (currentCategory !== null ? 6 : 0) : 0);
      if (y + needed > pageBottom()) {
        doc.addPage();
        y = doc.page.margins.top;
        if (!newCategory) drawCategory(row.category, true);
      }
    }
    if (newCategory) {
      if (currentCategory !== null && y > doc.page.margins.top) y += 6;
      drawCategory(row.category);
      currentCategory = row.category;
      rowIndex = 0;
    }

    drawCell(row, left + col * (cellW + gap), y, rowIndex % 2 === 1);

    col += 1;
    if (col >= cols) {
      col = 0;
      y += rowH;
      rowIndex += 1;
    }
  }

  // Pie en cada hoja: numero de pagina + marca.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - doc.page.margins.bottom - 18;
    // Se baja el margen inferior para que escribir en la zona del pie no
    // dispare un salto de pagina automatico.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8).fillColor("#999999")
      .text(`${listName} · Página ${i - range.start + 1} de ${range.count}`, left, footerY, { width, align: "right", lineBreak: false });
    doc.fontSize(7).text(COMARPOS_FOOTER_TEXT, left, footerY + 11, { width, align: "center", lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
  return { buffer: await finished, listName };
}

export const priceListPdfService = {
  exportPdf,
};
