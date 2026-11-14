/**
 * Generacion de codigos de barra (Code128) para imprimir etiquetas de
 * productos - PDF en hojas de etiquetas y Excel con la imagen embebida.
 * Usa bwip-js (puro JS, sin dependencias nativas tipo canvas) para rasterizar
 * cada codigo a PNG.
 */
import bwipjs from "bwip-js";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import prisma from "../prisma";
import { Prisma } from "@prisma/client";
import { currentTenantId } from "../context/tenantContext";
import { tenantScope } from "../utils/tenantScope";
import {
  ELEMENT_GAP_MM,
  LABEL_GAP_MM,
  LABEL_PADDING_MM,
  LABEL_SIZE_KEYS,
  LINE_HEIGHT,
  MM_TO_PT,
  formatLabelPrice,
  normalizeDesigns,
  type LabelDesign,
  type LabelDesigns,
  type LabelSize,
} from "./labelDesign";

export type BarcodeProduct = {
  id: string;
  name: string;
  sku: string;
  price: number;
  // Variantes: la etiqueta muestra el nombre del padre y el label de la
  // variante (ej. "Remera" + "M / Rojo") en vez del nombre largo.
  parentId?: string | null;
  parentName?: string | null;
  variantLabel?: string | null;
  // Precios de otras listas elegidas para imprimir debajo del principal
  // (ej. "Efectivo: $900"). Solo las listas donde el producto tiene precio.
  extraPrices: { listId: string; label: string; price: number }[];
};

async function renderBarcodePng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 3,
    height: 12,
    includetext: false,
    backgroundcolor: "FFFFFF",
  });
}

async function getProducts(productIds?: string[], priceListIds?: string[]): Promise<BarcodeProduct[]> {
  const where: any = { ...tenantScope(), isActive: true, sku: { not: null } };
  if (productIds && productIds.length > 0) {
    // Elegir un padre incluye todas sus variantes (cada una con su SKU). El
    // padre solo genera su propia etiqueta si tiene SKU y se pidio explicito.
    where.OR = [{ id: { in: productIds } }, { parentId: { in: productIds } }];
  } else {
    // Sin seleccion: todo lo que se vende (los padres no se venden).
    where.hasVariants = false;
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, sku: true, price: true, pricePerKg: true, saleUnit: true,
      parentId: true, variantLabel: true, parent: { select: { name: true } },
    },
  });

  // Listas adicionales (la default "Minorista" ya es el precio del producto).
  const priceLists = priceListIds && priceListIds.length > 0
    ? await prisma.priceList.findMany({
        where: { ...tenantScope(), id: { in: priceListIds }, isDefault: false, isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          items: {
            where: { productId: { in: products.map((p) => p.id) } },
            select: { productId: true, price: true, pricePerKg: true },
          },
        },
      })
    : [];

  return products
    .filter((p) => !!p.sku)
    .map((p) => ({
      extraPrices: priceLists.flatMap((list) => {
        const item = list.items.find((i) => i.productId === p.id);
        if (!item) return [];
        const price = p.saleUnit === "KG" ? item.pricePerKg ?? item.price : item.price;
        return [{ listId: list.id, label: list.name, price }];
      }),
      id: p.id,
      name: p.name,
      sku: p.sku as string,
      price: p.saleUnit === "KG" ? p.pricePerKg ?? 0 : p.price ?? 0,
      parentId: p.parentId,
      parentName: p.parent?.name ?? null,
      variantLabel: p.variantLabel,
    }));
}

// Tamanos de etiqueta: cada uno con su diseno editable (medidas, letra,
// colores, orden). Ver labelDesign.ts - la vista previa del frontend usa los
// mismos valores, asi que el PDF sale como se ve en pantalla.
function normalizeSize(value: unknown): LabelSize {
  return value === "chico" || value === "grande" ? value : "mediano";
}

export type BarcodeLabel = BarcodeProduct & { size: LabelSize };

async function exportPdf(params: {
  productIds?: string[];
  quantities?: Record<string, number>;
  sizes?: Record<string, string>;
  priceListIds?: string[];
  // Diseno a usar (el que se esta viendo en la vista previa, aunque no se
  // haya guardado). Sin diseno se usa el guardado del negocio.
  designs?: unknown;
}): Promise<Buffer> {
  const products = await getProducts(params.productIds, params.priceListIds);

  if (products.length === 0) {
    throw new Error("No hay productos con SKU para generar códigos de barra");
  }

  const designs = params.designs ? normalizeDesigns(params.designs) : await getSavedDesigns();

  const labels: BarcodeLabel[] = [];
  for (const p of products) {
    // Una variante incluida por haber elegido a su padre usa la cantidad y
    // el tamano cargados para el padre.
    const rawQty = params.quantities?.[p.id] ?? (p.parentId ? params.quantities?.[p.parentId] : undefined);
    const qty = Number.isFinite(Number(rawQty)) && Number(rawQty) > 0 ? Math.floor(Number(rawQty)) : 1;
    const size = normalizeSize(params.sizes?.[p.id] ?? (p.parentId ? params.sizes?.[p.parentId] : undefined));
    for (let i = 0; i < qty; i++) labels.push({ ...p, size });
  }

  return renderLabelsPdf(labels, designs);
}

// Arma el PDF (A4) con las etiquetas ya resueltas - sin acceso a la DB.
export async function renderLabelsPdf(labels: BarcodeLabel[], designs: LabelDesigns): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 20 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const marginX = doc.page.margins.left;
  const marginY = doc.page.margins.top;
  const usableWidth = doc.page.width - marginX * 2;
  const pageBottom = doc.page.height - marginY;
  const gap = LABEL_GAP_MM * MM_TO_PT;

  // Se agrupan las etiquetas por tamano (cada grupo arma su propia grilla de
  // columnas) para no mezclar tamanos distintos en una misma fila.
  const groups = LABEL_SIZE_KEYS.map((size) => ({ size, items: labels.filter((l) => l.size === size) })).filter(
    (g) => g.items.length > 0
  );

  // El codigo se rasteriza una sola vez por SKU (con "cantidad = stock" el
  // mismo producto se repite decenas de veces).
  const pngCache = new Map<string, Buffer>();
  const barcodePng = async (sku: string) => {
    let png = pngCache.get(sku);
    if (!png) {
      png = await renderBarcodePng(sku);
      pngCache.set(sku, png);
    }
    return png;
  };

  let y = marginY;

  for (const group of groups) {
    const design = designs[group.size];
    const w = Math.min(design.widthMm * MM_TO_PT, usableWidth);
    const h = Math.min(design.heightMm * MM_TO_PT, pageBottom - marginY);
    const cols = Math.max(1, Math.floor((usableWidth + gap) / (w + gap)));
    let col = 0;

    if (y + h > pageBottom) {
      doc.addPage();
      y = marginY;
    }

    for (const label of group.items) {
      if (y + h > pageBottom) {
        doc.addPage();
        y = marginY;
        col = 0;
      }

      const x = marginX + col * (w + gap);
      drawLabel(doc, label, design, await barcodePng(label.sku), x, y, w, h);

      col += 1;
      if (col >= cols) {
        col = 0;
        y += h + gap;
      }
    }

    if (col !== 0) y += h + gap; // cierra la fila parcial antes de pasar al siguiente grupo
  }

  doc.end();
  return finished;
}

// Dibuja una etiqueta apilando los elementos de arriba hacia abajo en el
// orden del diseno (igual que la vista previa). Lo que no entra se recorta.
function drawLabel(
  doc: PDFKit.PDFDocument,
  label: BarcodeLabel,
  design: LabelDesign,
  png: Buffer,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const pad = LABEL_PADDING_MM * MM_TO_PT;
  const elementGap = ELEMENT_GAP_MM * MM_TO_PT;
  const innerX = x + pad;
  const innerW = w - pad * 2;
  let cursor = y + pad;

  const text = (value: string, style: { size: number; bold: boolean; color: string; align: string }, maxLines = 1) => {
    doc.font(style.bold ? "Helvetica-Bold" : "Helvetica").fontSize(style.size).fillColor(style.color);
    const lineH = style.size * LINE_HEIGHT;
    const natural = doc.heightOfString(value, { width: innerW, lineGap: 0 });
    const blockH = Math.max(lineH, Math.min(natural, lineH * maxLines));
    // (+2 al alto: sin eso PDFKit descarta el ultimo renglon aunque entre justo.)
    doc.text(value, innerX, cursor, {
      width: innerW,
      height: blockH + 2,
      ellipsis: true,
      lineGap: 0,
      align: style.align as "left" | "center" | "right",
    });
    cursor += blockH + elementGap;
  };

  doc.save();
  doc.rect(x, y, w, h).clip();

  for (const key of design.order) {
    if (key === "name" && design.name.show) {
      const isVariant = Boolean(label.parentName && label.variantLabel);
      const fullName = isVariant ? `${label.parentName} ${label.variantLabel}` : label.name;
      text(fullName, design.name, design.name.maxLines);
    } else if (key === "barcode" && design.barcode.show) {
      const bw = (innerW * design.barcode.widthPct) / 100;
      const bh = design.barcode.heightMm * MM_TO_PT;
      doc.image(png, innerX + (innerW - bw) / 2, cursor, { width: bw, height: bh });
      cursor += bh + elementGap;
    } else if (key === "sku" && design.sku.show) {
      text(label.sku, design.sku);
    } else if (key === "price" && design.price.show) {
      const price = formatLabelPrice(label.price, design.price.decimals);
      text(design.price.showLabel ? `Precio: ${price}` : price, design.price);
    } else if (key === "extras" && design.extras.show) {
      for (const extra of label.extraPrices) {
        const override = design.listStyles[extra.listId];
        text(`${extra.label}: ${formatLabelPrice(extra.price, design.price.decimals)}`, {
          ...design.extras,
          ...(override ?? {}),
        });
      }
    }
  }

  doc.restore();
  if (design.border) {
    doc.lineWidth(0.5).rect(x, y, w, h).stroke("#cccccc");
  }
  doc.fillColor("#000000").font("Helvetica");
}

// Diseno guardado del negocio (Tenant.labelDesign); null = defaults.
async function getSavedDesigns(): Promise<LabelDesigns> {
  const tenantId = currentTenantId();
  if (!tenantId) return normalizeDesigns(null);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { labelDesign: true } });
  return normalizeDesigns(tenant?.labelDesign ?? null);
}

async function saveDesigns(raw: unknown): Promise<LabelDesigns> {
  const tenantId = currentTenantId();
  if (!tenantId) throw new Error("No hay negocio en contexto");
  const designs = normalizeDesigns(raw);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { labelDesign: designs as unknown as Prisma.InputJsonValue },
  });
  return designs;
}

async function exportExcel(params: { productIds?: string[]; priceListIds?: string[] }): Promise<ExcelJS.Buffer> {
  const products = await getProducts(params.productIds, params.priceListIds);
  const extraLabels = Array.from(new Set(products.flatMap((p) => p.extraPrices.map((e) => e.label))));

  const wb = new ExcelJS.Workbook();
  wb.creator = "ComarPOS";
  const ws = wb.addWorksheet("Códigos de barra");

  ws.columns = [
    { header: "Código de barra", key: "barcode", width: 26 },
    { header: "SKU", key: "sku", width: 16 },
    { header: "Producto", key: "name", width: 32 },
    { header: "Precio", key: "price", width: 14 },
    ...extraLabels.map((label, i) => ({ header: label, key: `extra${i}`, width: 14 })),
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };

  for (const p of products) {
    const extraValues: Record<string, number> = {};
    extraLabels.forEach((label, i) => {
      const extra = p.extraPrices.find((e) => e.label === label);
      if (extra) extraValues[`extra${i}`] = Number(extra.price.toFixed(2));
    });
    const row = ws.addRow({ sku: p.sku, name: p.name, price: Number(p.price.toFixed(2)), ...extraValues });
    row.height = 42;

    const png = await renderBarcodePng(p.sku);
    const imageId = wb.addImage({ base64: `data:image/png;base64,${png.toString("base64")}`, extension: "png" });
    ws.addImage(imageId, { tl: { col: 0, row: row.number - 1 }, ext: { width: 150, height: 38 } });
  }

  ws.getColumn("price").numFmt = '"$"#,##0.00';
  extraLabels.forEach((_, i) => { ws.getColumn(`extra${i}`).numFmt = '"$"#,##0.00'; });

  return wb.xlsx.writeBuffer();
}

export const barcodeService = {
  exportPdf,
  exportExcel,
  getSavedDesigns,
  saveDesigns,
};
