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
import { tenantScope } from "../utils/tenantScope";

type BarcodeProduct = {
  id: string;
  name: string;
  sku: string;
  price: number;
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

async function getProducts(productIds?: string[]): Promise<BarcodeProduct[]> {
  const where: any = { ...tenantScope(), isActive: true, sku: { not: null } };
  if (productIds && productIds.length > 0) where.id = { in: productIds };

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true, price: true, pricePerKg: true, saleUnit: true },
  });

  return products
    .filter((p) => !!p.sku)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku as string,
      price: p.saleUnit === "KG" ? p.pricePerKg ?? 0 : p.price ?? 0,
    }));
}

// Tamanos de etiqueta disponibles (en puntos, 1mm ~= 2.83pt). "mediano" es el
// tamano original pensado para hojas de stickers autoadhesivos estandar
// (aprox 63x38mm) - los otros dos son variantes para productos chicos o para
// etiquetas mas grandes con mas lugar para el nombre.
export type LabelSize = "chico" | "mediano" | "grande";

const LABEL_SIZES: Record<LabelSize, { w: number; h: number }> = {
  chico: { w: 122, h: 76 }, // ~43x27mm
  mediano: { w: 178, h: 108 }, // ~63x38mm (tamano original)
  grande: { w: 232, h: 140 }, // ~82x49mm
};

const SIZE_ORDER: LabelSize[] = ["chico", "mediano", "grande"];

function normalizeSize(value: unknown): LabelSize {
  return value === "chico" || value === "grande" ? value : "mediano";
}

type BarcodeLabel = BarcodeProduct & { size: LabelSize };

async function exportPdf(params: {
  productIds?: string[];
  quantities?: Record<string, number>;
  sizes?: Record<string, string>;
}): Promise<Buffer> {
  const products = await getProducts(params.productIds);

  if (products.length === 0) {
    throw new Error("No hay productos con SKU para generar códigos de barra");
  }

  const labels: BarcodeLabel[] = [];
  for (const p of products) {
    const rawQty = params.quantities?.[p.id];
    const qty = Number.isFinite(Number(rawQty)) && Number(rawQty) > 0 ? Math.floor(Number(rawQty)) : 1;
    const size = normalizeSize(params.sizes?.[p.id]);
    for (let i = 0; i < qty; i++) labels.push({ ...p, size });
  }

  const doc = new PDFDocument({ size: "A4", margin: 20 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const marginX = doc.page.margins.left;
  const marginY = doc.page.margins.top;
  const usableWidth = doc.page.width - marginX * 2;
  const pageBottom = doc.page.height - marginY;

  // Se agrupan las etiquetas por tamano (cada grupo arma su propia grilla de
  // columnas) para no mezclar tamanos distintos en una misma fila.
  const groups = SIZE_ORDER.map((size) => ({ size, items: labels.filter((l) => l.size === size) })).filter(
    (g) => g.items.length > 0
  );

  let y = marginY;

  for (const group of groups) {
    const { w, h } = LABEL_SIZES[group.size];
    const cols = Math.max(1, Math.floor(usableWidth / w));
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

      const x = marginX + col * w;
      await drawLabel(doc, label, x, y, w, h);

      col += 1;
      if (col >= cols) {
        col = 0;
        y += h;
      }
    }

    if (col !== 0) y += h; // cierra la fila parcial antes de pasar al siguiente grupo
  }

  doc.end();
  return finished;
}

async function drawLabel(doc: PDFKit.PDFDocument, label: BarcodeLabel, x: number, y: number, w: number, h: number) {
  // Todo se escala en proporcion al tamano "mediano" original (108pt de alto)
  // para que el contenido no se vea desproporcionado en etiquetas chicas o grandes.
  const k = h / LABEL_SIZES.mediano.h;
  const png = await renderBarcodePng(label.sku);

  const nameSize = Math.max(6, Math.round(8 * k));
  const skuSize = Math.max(6, Math.round(9 * k));
  const priceSize = Math.max(7, Math.round(10 * k));
  const imgHeight = Math.max(20, Math.round(36 * k));
  const imgY = y + Math.round(26 * k);

  doc.rect(x, y, w - 8, h - 8).stroke("#dddddd");
  doc
    .fontSize(nameSize)
    .fillColor("#000")
    .text(label.name, x + 6, y + 6, { width: w - 20, height: Math.round(22 * k), ellipsis: true });
  doc.image(png, x + 10, imgY, { width: w - 36, height: imgHeight });
  doc
    .fontSize(skuSize)
    .text(label.sku, x + 6, imgY + imgHeight + 4, { width: w - 20, align: "center" });
  doc
    .fontSize(priceSize)
    .text(`$${label.price.toFixed(2)}`, x + 6, imgY + imgHeight + 4 + Math.round(skuSize * 1.4), {
      width: w - 20,
      align: "center",
    });
}

async function exportExcel(params: { productIds?: string[] }): Promise<ExcelJS.Buffer> {
  const products = await getProducts(params.productIds);

  const wb = new ExcelJS.Workbook();
  wb.creator = "ComarPOS";
  const ws = wb.addWorksheet("Códigos de barra");

  ws.columns = [
    { header: "Código de barra", key: "barcode", width: 26 },
    { header: "SKU", key: "sku", width: 16 },
    { header: "Producto", key: "name", width: 32 },
    { header: "Precio", key: "price", width: 14 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };

  for (const p of products) {
    const row = ws.addRow({ sku: p.sku, name: p.name, price: Number(p.price.toFixed(2)) });
    row.height = 42;

    const png = await renderBarcodePng(p.sku);
    const imageId = wb.addImage({ base64: `data:image/png;base64,${png.toString("base64")}`, extension: "png" });
    ws.addImage(imageId, { tl: { col: 0, row: row.number - 1 }, ext: { width: 150, height: 38 } });
  }

  ws.getColumn("price").numFmt = '"$"#,##0.00';

  return wb.xlsx.writeBuffer();
}

export const barcodeService = {
  exportPdf,
  exportExcel,
};
