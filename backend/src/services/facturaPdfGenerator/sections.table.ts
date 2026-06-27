/**
 * Renderizado de la tabla de productos del PDF de factura.
 * Extraidos de facturaPdfGenerator.service.ts (modularizacion, doc seccion 4).
 */
import { COLORS, Product } from "./types";
import { formatCurrency, numberOrZero } from "./format";
import { drawBox } from "./sections.header";

export function renderTableHeader(doc: PDFKit.PDFDocument) {
  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const top = doc.y;

  const rowH = 24;

  drawBox(doc, left, top, width, rowH, COLORS.gray100);

  const cols = {
    qty: 54,
    desc: width - 54 - 92 - 102,
    unit: 92,
    total: 102,
  };

  let x = left;

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.black)
    .text("Cant.", x + 7, top + 7, {
      width: cols.qty - 14,
      align: "left",
    });

  x += cols.qty;

  doc.text("Descripción", x + 7, top + 7, {
    width: cols.desc - 14,
    align: "left",
  });

  x += cols.desc;

  doc.text("P. Unitario", x + 7, top + 7, {
    width: cols.unit - 14,
    align: "right",
  });

  x += cols.unit;

  doc.text("Importe", x + 7, top + 7, {
    width: cols.total - 14,
    align: "right",
  });

  doc.y = top + rowH;
}

export function ensureTableSpace(doc: PDFKit.PDFDocument, neededHeight: number) {
  const reservedBottomSpace = 218;
  const bottomLimit = doc.page.height - reservedBottomSpace;

  if (doc.y + neededHeight > bottomLimit) {
    throw new Error(
      "La factura excede el espacio disponible de una sola hoja A4. Ajustá el layout o reducí el contenido."
    );
  }
}

export function renderProductsTable(doc: PDFKit.PDFDocument, products: Product[]) {
  renderTableHeader(doc);

  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;

  const cols = {
    qty: 54,
    desc: width - 54 - 92 - 102,
    unit: 92,
    total: 102,
  };

  if (!products.length) {
    const rowH = 24;
    drawBox(doc, left, doc.y, width, rowH);

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.gray700)
      .text("Sin productos", left + 8, doc.y + 7, {
        width: width - 16,
      });

    doc.y += rowH;
    return;
  }

  for (const prod of products) {
    const quantity = numberOrZero(prod.quantity);

    const quantityKg =
      prod.quantityKg !== null && prod.quantityKg !== undefined
        ? numberOrZero(prod.quantityKg)
        : undefined;

    const displayQuantity =
      quantityKg !== undefined && quantityKg > 0
        ? `${quantityKg} kg`
        : String(quantity);

    const price = numberOrZero(prod.price);

    const importe =
      prod.subtotal !== undefined && prod.subtotal !== null
        ? numberOrZero(prod.subtotal)
        : quantityKg !== undefined && quantityKg > 0
        ? quantityKg * price
        : quantity * price;

    const descHeight = doc.heightOfString(prod.name, {
      width: cols.desc - 14,
      align: "left",
    });

    const rowH = Math.max(22, descHeight + 10);

    ensureTableSpace(doc, rowH);

    const y = doc.y;

    drawBox(doc, left, y, width, rowH);

    let x = left;

    doc.font("Helvetica").fontSize(8.8).fillColor(COLORS.gray900);

    doc.text(displayQuantity, x + 7, y + 7, {
      width: cols.qty - 14,
      align: "left",
    });

    x += cols.qty;

    doc.text(prod.name, x + 7, y + 7, {
      width: cols.desc - 14,
      align: "left",
    });

    x += cols.desc;

    doc.text(formatCurrency(price), x + 7, y + 7, {
      width: cols.unit - 14,
      align: "right",
    });

    x += cols.unit;

    doc.text(formatCurrency(importe), x + 7, y + 7, {
      width: cols.total - 14,
      align: "right",
    });

    doc.y = y + rowH;
  }

  doc.moveDown(0.45);
}
