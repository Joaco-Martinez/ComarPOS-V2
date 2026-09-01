/**
 * Renderizado de las secciones del PDF de cotizacion (header, info, tabla, totales, footer).
 * Extraidos de generarCotizacionPDF.ts (modularizacion, doc seccion 4).
 *
 * Diseño compacto tipo planilla/documento formal (no "tarjetas" grandes con
 * fotos de producto) - ver doc "listas de precios + descuentos multiples",
 * pedido explicito del usuario de achicar todo y sacarle lo "tosco" despues
 * de comparar contra varias plantillas de cotizacion de referencia.
 */
import { PAGE, C, CotizacionPDFSale } from "./types";
import {
  money,
  dateText,
  dateOnlyText,
  safe,
  getBusinessName,
  getQuotationDiscountLabel,
  getClientName,
  getClientDocLine,
  getClientAddressLine,
  titleCase,
  getProductName,
  getProductSku,
  getProductQty,
  getItemIvaBreakdown,
  getItemDiscountBreakdown,
  getDiscountRowLabel,
  getQuotationNumber,
} from "./format";
import { findLogoPath, getImageBuffer } from "./assets";
import { COMARPOS_FOOTER_TEXT } from "../comarposBranding";

export function drawPageBackground(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(C.white);
}

const LOGO_SIZE = 34;

export async function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, logoUrl?: string | null) {
  doc.save();
  doc.circle(x + LOGO_SIZE / 2, y + LOGO_SIZE / 2, LOGO_SIZE / 2).fill("#000000");
  doc.restore();

  const remoteLogo = await getImageBuffer(logoUrl);

  if (remoteLogo) {
    try {
      doc.image(remoteLogo, x, y, { cover: [LOGO_SIZE, LOGO_SIZE], align: "center", valign: "center" });
      return;
    } catch {}
  }

  const logoPath = findLogoPath();

  if (logoPath) {
    try {
      doc.image(logoPath, x, y, { cover: [LOGO_SIZE, LOGO_SIZE], align: "center", valign: "center" });
      return;
    } catch {}
  }

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("VJ", x, y + LOGO_SIZE / 2 - 5, { width: LOGO_SIZE, align: "center" });
}

/** Header compacto: logo + nombre a la izquierda, tipo de documento +
 * numero + fecha a la derecha, todo en una franja chica (una linea de
 * dato, no un banner gigante centrado). */
export async function drawHeader(doc: PDFKit.PDFDocument, sale: CotizacionPDFSale) {
  drawPageBackground(doc);

  const x = PAGE.marginX;
  const right = PAGE.width - x;
  const y = PAGE.top;

  await drawLogo(doc, x, y, sale.logoUrl);

  const discountLabel = getQuotationDiscountLabel(sale);
  const nameX = x + LOGO_SIZE + 10;
  const nameWidth = 250;

  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(discountLabel ? `${getBusinessName(sale)} - ${discountLabel}` : getBusinessName(sale), nameX, y, {
      width: nameWidth,
      height: 15,
      ellipsis: true,
      lineBreak: false,
    });

  const contactParts = [sale.businessAddress, sale.businessPhone, sale.businessEmail]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(7.5)
    .text(contactParts.join("  ·  "), nameX, y + 15, { width: nameWidth, ellipsis: true });

  const blockX = 355;
  const blockWidth = right - blockX;

  doc
    .fillColor(C.muted)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text("COTIZACIÓN", blockX, y, { width: blockWidth, align: "right", characterSpacing: 0.4 });

  doc
    .fillColor(C.text)
    .font("Helvetica")
    .fontSize(8)
    .text(`N° ${getQuotationNumber(sale)}`, blockX, y + 12, { width: blockWidth, align: "right" });

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(7.5)
    .text(dateText(sale.createdAt), blockX, y + 23, { width: blockWidth, align: "right" });

  const dividerY = y + LOGO_SIZE + 8;

  doc.moveTo(x, dividerY).lineTo(right, dividerY).strokeColor(C.line).lineWidth(1).stroke();

  return dividerY + 10;
}

function drawFiscalPanel(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  lines: string[]
) {
  doc
    .fillColor(C.muted)
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .text(title, x, y, { characterSpacing: 0.4 });

  let lineY = y + 10;

  lines.forEach((line, i) => {
    doc
      .fillColor(i === 0 ? C.black : C.text)
      .font(i === 0 ? "Helvetica-Bold" : "Helvetica")
      .fontSize(i === 0 ? 9.5 : 8)
      .text(line, x, lineY, { width, ellipsis: true });

    lineY += 10.5;
  });

  return lineY;
}

/** Datos fiscales del emisor (negocio) y del cliente, lado a lado - pedido
 * explicito: "tendrian que estar todos los datos fiscales del local y del
 * cliente". El emisor sale de ArcaConfig si el tenant configuro ARCA/AFIP
 * (CUIT, condicion IVA, domicilio fiscal); el cliente, de sus propios
 * datos (documento, condicion IVA, direccion). Debajo, una linea chica con
 * vigencia y vendedor. */
export function drawInfo(doc: PDFKit.PDFDocument, sale: CotizacionPDFSale, startY: number) {
  const x = PAGE.marginX;
  const right = PAGE.width - x;
  const colGap = 16;
  const colW = (right - x - colGap) / 2;
  const y = startY;

  const emisorLines = [
    getBusinessName(sale),
    sale.businessCuit ? `CUIT: ${sale.businessCuit}` : null,
    sale.businessIvaCondition ? `Cond. IVA: ${titleCase(sale.businessIvaCondition)}` : null,
    sale.businessIibb ? `Ing. Brutos: ${sale.businessIibb}` : null,
    sale.businessAddress || null,
  ].filter((v): v is string => Boolean(v));

  const clienteLines = [
    getClientName(sale.client),
    getClientDocLine(sale.client) || null,
    sale.client?.ivaCondition ? `Cond. IVA: ${titleCase(sale.client.ivaCondition)}` : null,
    getClientAddressLine(sale.client) || null,
  ].filter((v): v is string => Boolean(v));

  const emisorBottom = drawFiscalPanel(doc, x, y, colW, "EMISOR", emisorLines);
  const clienteBottom = drawFiscalPanel(doc, x + colW + colGap, y, colW, "CLIENTE", clienteLines);

  const metaY = Math.max(emisorBottom, clienteBottom) + 2;

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      `Válida hasta ${dateOnlyText(sale.quotationExpiresAt)}   ·   Vendedor: ${safe(sale.user?.name)}`,
      x,
      metaY,
      { width: right - x }
    );

  const bottom = metaY + 12;

  doc.moveTo(x, bottom).lineTo(right, bottom).strokeColor(C.line).lineWidth(1).stroke();

  return bottom + 10;
}

type DiscountRef = { label?: string | null; type: string; value: number; applied: boolean };
type TableColumn = { x: number; width: number };
type TableLayout = {
  producto: TableColumn;
  codigo: TableColumn;
  cant: TableColumn;
  precioUnit: TableColumn;
  iva: TableColumn;
  subtotal: TableColumn;
  discountCols: (TableColumn & { discount: DiscountRef })[];
};

/**
 * Cuando hay 2+ descuentos condicionales (no acumulables - ej. "10% en
 * efectivo" vs "5% con tarjeta"), cada uno se ve como su propia columna
 * "D1"/"D2"/... en la tabla de productos, discriminado por producto (pedido
 * explicito: "quiero que los descuentos esten en esta fila"). Si se
 * acumulan, o hay 0-1 descuento, no suman columnas propias - el total ya
 * refleja el combinado y no hay nada "a elegir" por linea.
 */
function getTableDiscountColumns(sale: CotizacionPDFSale): DiscountRef[] {
  if (sale.discountsAccumulate) return [];
  const active = (sale.discounts ?? []).filter((d) => d.applied);
  return active.length >= 2 ? active : [];
}

function computeTableLayout(sale: CotizacionPDFSale): TableLayout {
  const left = PAGE.marginX;
  const right = PAGE.width - PAGE.marginX;
  const gap = 6;

  const codigoW = 40;
  const cantW = 26;
  const precioW = 46;
  const ivaW = 30;
  const subtotalW = 44;
  const minProductoW = 120;

  const discounts = getTableDiscountColumns(sale);
  const reservedFixed = codigoW + cantW + precioW + ivaW + subtotalW + gap * 5;
  const availableForDiscounts = right - left - minProductoW - reservedFixed - gap * discounts.length;
  const discW = discounts.length > 0
    ? Math.max(26, Math.min(46, availableForDiscounts / discounts.length))
    : 0;

  let cursorRight = right;
  const discountCols: (TableColumn & { discount: DiscountRef })[] = [];

  for (let i = discounts.length - 1; i >= 0; i -= 1) {
    const colX = cursorRight - discW;
    discountCols.unshift({ x: colX, width: discW, discount: discounts[i] });
    cursorRight = colX - gap;
  }

  const subtotalX = cursorRight - subtotalW;
  cursorRight = subtotalX - gap;

  const ivaX = cursorRight - ivaW;
  cursorRight = ivaX - gap;

  const precioX = cursorRight - precioW;
  cursorRight = precioX - gap;

  const cantX = cursorRight - cantW;
  cursorRight = cantX - gap;

  const codigoX = cursorRight - codigoW;
  cursorRight = codigoX - gap;

  return {
    producto: { x: left, width: cursorRight - left },
    codigo: { x: codigoX, width: codigoW },
    cant: { x: cantX, width: cantW },
    precioUnit: { x: precioX, width: precioW },
    iva: { x: ivaX, width: ivaW },
    subtotal: { x: subtotalX, width: subtotalW },
    discountCols,
  };
}

const TABLE_HEADER_H = 20;
const ROW_H = 22;

export function drawTableHeader(doc: PDFKit.PDFDocument, y: number, sale: CotizacionPDFSale) {
  const x = PAGE.marginX;
  const layout = computeTableLayout(sale);

  doc.rect(x, y, PAGE.width - x * 2, TABLE_HEADER_H).fill(C.headerSoft);
  doc.moveTo(x, y + TABLE_HEADER_H).lineTo(PAGE.width - x, y + TABLE_HEADER_H).strokeColor(C.line).lineWidth(1).stroke();

  const textY = y + 6;

  doc
    .fillColor(C.text)
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text("PRODUCTO", layout.producto.x, textY, { width: layout.producto.width, characterSpacing: 0.3 })
    .text("CÓD.", layout.codigo.x, textY, { width: layout.codigo.width, characterSpacing: 0.3 })
    .text("CANT.", layout.cant.x, textY, { width: layout.cant.width, align: "right", characterSpacing: 0.3 })
    .text("P. UNIT.", layout.precioUnit.x, textY, { width: layout.precioUnit.width, align: "right", characterSpacing: 0.3 })
    .text("IVA", layout.iva.x, textY, { width: layout.iva.width, align: "right", characterSpacing: 0.3 })
    .text("SUBTOTAL", layout.subtotal.x, textY, { width: layout.subtotal.width, align: "right", characterSpacing: 0.3 });

  layout.discountCols.forEach((col, i) => {
    doc
      .fillColor(C.text)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(`D${i + 1}`, col.x, textY, { width: col.width, align: "right" });
  });

  return y + TABLE_HEADER_H;
}

export async function drawProductRow(
  doc: PDFKit.PDFDocument,
  sale: CotizacionPDFSale,
  item: CotizacionPDFSale["items"][number],
  y: number,
  index: number
) {
  const x = PAGE.marginX;

  if (y + ROW_H > PAGE.bottom - 40) {
    y = addPage(doc, sale);
  }

  const layout = computeTableLayout(sale);
  const isEven = index % 2 === 0;

  if (!isEven) {
    doc.rect(x, y, PAGE.width - x * 2, ROW_H).fill(C.rowSoft);
  }

  const textY = y + 6;

  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(getProductName(item), layout.producto.x, textY, {
      width: layout.producto.width,
      height: 11,
      ellipsis: true,
    });

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(getProductSku(item), layout.codigo.x, textY, { width: layout.codigo.width, ellipsis: true });

  doc
    .fillColor(C.text)
    .font("Helvetica")
    .fontSize(8.5)
    .text(String(getProductQty(item)), layout.cant.x, textY, { width: layout.cant.width, align: "right" });

  doc
    .fillColor(C.text)
    .font("Helvetica")
    .fontSize(8.5)
    .text(money(item.price), layout.precioUnit.x, textY, { width: layout.precioUnit.width, align: "right" });

  const { rate: ivaRate } = getItemIvaBreakdown(item);

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(`${ivaRate}%`, layout.iva.x, textY, { width: layout.iva.width, align: "right" });

  // Con columnas de descuento por opcion (condicionales, no acumulables):
  // "Subtotal" queda como el bruto sin descontar, cada columna D1/D2/...
  // muestra cuanto se lleva ESA opcion en esta linea puntual. Sin columnas
  // (0-1 descuento, o acumulados), Subtotal ya muestra el valor final -
  // el desglose combinado vive en el cuadro de totales, no por linea.
  if (layout.discountCols.length > 0) {
    doc
      .fillColor(C.black)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(money(item.subtotal), layout.subtotal.x, textY, { width: layout.subtotal.width, align: "right" });

    const cartSubtotal = Number(sale.subtotal || 0);

    layout.discountCols.forEach((col) => {
      const d = col.discount;
      const totalAmount = d.type === "FIXED" ? Number(d.value) : cartSubtotal * (Number(d.value) / 100);
      const cappedTotalAmount = Math.min(Math.max(totalAmount, 0), cartSubtotal);
      const lineAmount = cartSubtotal > 0 ? (item.subtotal || 0) * (cappedTotalAmount / cartSubtotal) : 0;

      doc
        .fillColor(C.text)
        .font("Helvetica")
        .fontSize(8)
        .text(lineAmount > 0.01 ? `-${money(lineAmount)}` : "—", col.x, textY, {
          width: col.width,
          align: "right",
        });
    });
  } else {
    const { amount: itemDiscountAmount, finalSubtotal } = getItemDiscountBreakdown(sale, item);
    const hasItemDiscount = Math.abs(itemDiscountAmount) > 0.01;

    doc
      .fillColor(C.black)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(money(hasItemDiscount ? finalSubtotal : item.subtotal), layout.subtotal.x, textY, {
        width: layout.subtotal.width,
        align: "right",
      });
  }

  doc.moveTo(x, y + ROW_H).lineTo(PAGE.width - x, y + ROW_H).strokeColor(C.lightLine).lineWidth(0.6).stroke();

  return y + ROW_H;
}

export function addPage(doc: PDFKit.PDFDocument, sale: CotizacionPDFSale) {
  doc.addPage({ size: "A4", margin: 0 });
  drawPageBackground(doc);

  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(getBusinessName(sale), PAGE.marginX, 38, { width: 300, height: 13, ellipsis: true, lineBreak: false });

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(`Continuación  ·  ${dateText(sale.createdAt)}`, PAGE.marginX, 52);

  doc
    .moveTo(PAGE.marginX, 68)
    .lineTo(PAGE.width - PAGE.marginX, 68)
    .strokeColor(C.line)
    .lineWidth(1)
    .stroke();

  return drawTableHeader(doc, 78, sale);
}

/**
 * Detalle de los descuentos multiples de la cotizacion (pantalla de
 * Cotizaciones - distinto del descuento unico viejo, que sigue viviendo
 * como una etiqueta corta en el header). Si "discountsAccumulate" es
 * false y hay 2+ descuentos, son alternativas condicionales (ej. "10%
 * pagando en efectivo" vs "5% con tarjeta") y cada una muestra el total
 * que le corresponde a esa opcion sola - el que terminó en sale.total es
 * el primero (mismo criterio que sale.discounts.ts#calculateDiscountedTotal).
 */
export function drawDiscountOptions(doc: PDFKit.PDFDocument, sale: CotizacionPDFSale, y: number) {
  const activeDiscounts = (sale.discounts ?? []).filter((d) => d.applied);

  if (activeDiscounts.length === 0) return y;

  const x = PAGE.marginX;
  const right = PAGE.width - x;
  const accumulate = Boolean(sale.discountsAccumulate);
  const subtotal = Number(sale.subtotal || 0);

  // Acumulados: un unico resultado combinado (ya es el Total de mas abajo),
  // acá solo se lista que se sumo - no hace falta destacar nada porque no
  // hay nada "a elegir".
  if (accumulate) {
    const rowHeight = 12;
    const estimatedHeight = 22 + activeDiscounts.length * rowHeight;

    if (y + estimatedHeight > PAGE.bottom) {
      doc.addPage({ size: "A4", margin: 0 });
      drawPageBackground(doc);
      y = 50;
    }

    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(9).text("Descuentos aplicados", x, y);
    y += 14;

    for (const discount of activeDiscounts) {
      doc
        .fillColor(C.text)
        .font("Helvetica")
        .fontSize(8)
        .text(`•  ${getDiscountRowLabel(discount)}`, x, y, { width: right - x, ellipsis: true });
      y += rowHeight;
    }

    y += 6;
    doc.moveTo(x, y).lineTo(right, y).strokeColor(C.lightLine).lineWidth(1).stroke();
    return y + 10;
  }

  // Condicionales (no acumulables): "el total segun como quieran pagar",
  // una fila de fichas chicas, numeradas D1/D2/... igual que las columnas
  // de la tabla de arriba (getTableDiscountColumns) cuando hay 2+, para
  // poder cruzar la referencia. La opcion mas barata se marca con un borde.
  const numbered = activeDiscounts.length >= 2;
  const cols = Math.min(activeDiscounts.length, 4);
  const gap = 8;
  const cardW = (right - x - gap * (cols - 1)) / cols;
  const cardH = 38;
  const rowsOfCards = Math.ceil(activeDiscounts.length / cols);
  const estimatedHeight = 22 + rowsOfCards * (cardH + gap);

  if (y + estimatedHeight > PAGE.bottom) {
    doc.addPage({ size: "A4", margin: 0 });
    drawPageBackground(doc);
    y = 50;
  }

  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("TOTAL SEGÚN FORMA DE PAGO", x, y, { characterSpacing: 0.3 });

  y += 16;

  const totalsPerOption = activeDiscounts.map((d) => {
    const amount = d.type === "FIXED" ? Number(d.value) : subtotal * (Number(d.value) / 100);
    return Math.max(0, subtotal - Math.min(Math.max(amount, 0), subtotal));
  });
  const bestTotal = Math.min(...totalsPerOption);

  activeDiscounts.forEach((discount, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cardX = x + col * (cardW + gap);
    const cardY = y + row * (cardH + gap);
    const resultingTotal = totalsPerOption[index];
    const isBest = resultingTotal === bestTotal;
    const label = getDiscountRowLabel(discount);

    doc.rect(cardX, cardY, cardW, cardH).fillAndStroke(C.soft, C.lightLine);

    if (isBest) {
      doc.rect(cardX, cardY, 3, cardH).fill(C.black);
    }

    doc
      .fillColor(C.muted)
      .font("Helvetica-Bold")
      .fontSize(6.5)
      .text(numbered ? `D${index + 1}` : "OPCIÓN", cardX + 8, cardY + 6, { characterSpacing: 0.3 });

    doc
      .fillColor(C.text)
      .font("Helvetica")
      .fontSize(7)
      .text(label, cardX + 8, cardY + 15, { width: cardW - 16, height: 12, ellipsis: true });

    doc
      .fillColor(C.black)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(money(resultingTotal), cardX + 8, cardY + cardH - 15, { width: cardW - 16 });
  });

  y += rowsOfCards * (cardH + gap) + 4;

  doc.moveTo(x, y).lineTo(right, y).strokeColor(C.lightLine).lineWidth(1).stroke();

  return y + 10;
}

export function drawTotals(doc: PDFKit.PDFDocument, sale: CotizacionPDFSale, y: number) {
  const x = PAGE.marginX;

  if (y + 95 > PAGE.bottom) {
    doc.addPage({ size: "A4", margin: 0 });
    drawPageBackground(doc);
    y = 50;
  }

  doc.moveTo(x, y).lineTo(PAGE.width - x, y).strokeColor(C.line).lineWidth(1).stroke();

  const boxW = 200;
  const boxX = PAGE.width - x - boxW;
  const boxY = y + 14;
  const rowH = 15;

  // El precio cargado en cada item ya incluye IVA (precio de venta final).
  // Para mostrar el desglose correcto (neto -> + IVA por alicuota -> total)
  // primero se "destapa" el neto de cada item con su propia alicuota, y el
  // Subtotal que se muestra es la suma de esos netos - NO sale.subtotal
  // (que es el bruto). netoSum + suma de IVA reconstruye exactamente
  // sale.subtotal, asi que el descuento/total de mas abajo no cambian.
  const ivaByRate: Record<number, number> = {};
  let netoSum = 0;
  for (const item of sale.items) {
    const rate = item.ivaRate ?? (item.product as any)?.ivaRate ?? 21;
    const neto = (item.subtotal || 0) / (1 + rate / 100);
    const iva = (item.subtotal || 0) - neto;
    ivaByRate[rate] = (ivaByRate[rate] ?? 0) + iva;
    netoSum += neto;
  }

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(9)
    .text("Subtotal (sin IVA)", boxX, boxY, { width: 100, align: "left" });

  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(money(netoSum), boxX + 100, boxY, { width: 100, align: "right" });

  const ivaEntries = Object.entries(ivaByRate).filter(([, v]) => v > 0.01);
  let ivaOffsetY = 0;

  for (const [rateStr, ivaAmt] of ivaEntries) {
    doc
      .fillColor(C.muted)
      .font("Helvetica")
      .fontSize(9)
      .text(`IVA ${rateStr}%`, boxX, boxY + rowH + ivaOffsetY, { width: 100, align: "left" });
    doc
      .fillColor(C.black)
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(money(ivaAmt), boxX + 100, boxY + rowH + ivaOffsetY, { width: 100, align: "right" });
    ivaOffsetY += rowH;
  }

  // subtotal - total > 0 -> descuento; < 0 -> recargo (ver flujo de POS).
  const adjustment = Number(sale.subtotal || 0) - Number(sale.total || 0);
  const hasAdjustment = Math.abs(adjustment) > 0.01;

  let totalBoxY = boxY + rowH + ivaOffsetY + 6;

  if (hasAdjustment) {
    const isSurcharge = adjustment < 0;
    const adjustmentY = boxY + rowH + ivaOffsetY;

    doc
      .fillColor(C.muted)
      .font("Helvetica")
      .fontSize(9)
      .text(isSurcharge ? "Recargo" : "Descuento", boxX, adjustmentY, { width: 100, align: "left" });

    doc
      .fillColor(C.black)
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(`${isSurcharge ? "+" : "-"} ${money(Math.abs(adjustment))}`, boxX + 100, adjustmentY, {
        width: 100,
        align: "right",
      });

    totalBoxY = adjustmentY + rowH + 6;
  }

  doc.roundedRect(boxX - 4, totalBoxY, boxW + 4, 28, 5).fill(C.black);

  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(11).text("Total", boxX + 10, totalBoxY + 9);

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(money(sale.total), boxX + 60, totalBoxY + 9, { width: 134, align: "right" });
}

export function drawFooter(doc: PDFKit.PDFDocument, page: number, totalPages: number) {
  doc
    .fillColor(C.lightMuted)
    .font("Helvetica")
    .fontSize(7)
    .text(`Página ${page} de ${totalPages}   ·   ${COMARPOS_FOOTER_TEXT}`, PAGE.marginX, 820, {
      width: PAGE.width - PAGE.marginX * 2,
      align: "center",
    });
}
