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

// Grilla de etiquetas: 3 columnas por hoja A4, tamano pensado para hojas de
// stickers autoadhesivos estandar (aprox 63x38mm por etiqueta).
const COLS = 3;
const LABEL_W = 178;
const LABEL_H = 108;

async function exportPdf(params: { productIds?: string[]; quantities?: Record<string, number> }): Promise<Buffer> {
  const products = await getProducts(params.productIds);

  if (products.length === 0) {
    throw new Error("No hay productos con SKU para generar códigos de barra");
  }

  const labels: BarcodeProduct[] = [];
  for (const p of products) {
    const rawQty = params.quantities?.[p.id];
    const qty = Number.isFinite(Number(rawQty)) && Number(rawQty) > 0 ? Math.floor(Number(rawQty)) : 1;
    for (let i = 0; i < qty; i++) labels.push(p);
  }

  const doc = new PDFDocument({ size: "A4", margin: 20 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const marginX = doc.page.margins.left;
  const marginY = doc.page.margins.top;
  const rowsPerPage = Math.floor((doc.page.height - marginY * 2) / LABEL_H);

  let col = 0;
  let row = 0;

  for (const label of labels) {
    if (row >= rowsPerPage) {
      doc.addPage();
      row = 0;
      col = 0;
    }

    const x = marginX + col * LABEL_W;
    const y = marginY + row * LABEL_H;

    const png = await renderBarcodePng(label.sku);

    doc.rect(x, y, LABEL_W - 8, LABEL_H - 8).stroke("#dddddd");
    doc
      .fontSize(8)
      .fillColor("#000")
      .text(label.name, x + 6, y + 6, { width: LABEL_W - 20, height: 22, ellipsis: true });
    doc.image(png, x + 10, y + 26, { width: LABEL_W - 36, height: 36 });
    doc.fontSize(9).text(label.sku, x + 6, y + 66, { width: LABEL_W - 20, align: "center" });
    doc
      .fontSize(10)
      .text(`$${label.price.toFixed(2)}`, x + 6, y + 80, { width: LABEL_W - 20, align: "center" });

    col += 1;
    if (col >= COLS) {
      col = 0;
      row += 1;
    }
  }

  doc.end();
  return finished;
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
