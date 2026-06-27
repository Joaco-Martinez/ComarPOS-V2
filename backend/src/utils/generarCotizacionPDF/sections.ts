/**
 * Renderizado de las secciones del PDF de cotizacion (header, info, tabla, totales, footer).
 * Extraidos de generarCotizacionPDF.ts (modularizacion, doc seccion 4).
 */
import { PAGE, C, CotizacionPDFSale } from "./types";
import {
  money,
  dateText,
  safe,
  getQuotationCategoryLabel,
  getClientName,
  getClientDetails,
  getProductName,
  getProductSku,
  getProductQty,
} from "./format";
import { findLogoPath, getImageBuffer } from "./assets";

export function drawPageBackground(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(C.white);
}

export function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number) {
  const logoPath = findLogoPath();

  doc.save();
  doc.circle(x + 31, y + 31, 31).fill("#000000");
  doc.restore();

  if (logoPath) {
    try {
      doc.image(logoPath, x, y, {
        cover: [62, 62],
        align: "center",
        valign: "center",
      });
      return;
    } catch {}
  }

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("VJ", x, y + 21, {
      width: 62,
      align: "center",
    });
}

export function drawHeader(doc: PDFKit.PDFDocument, sale: CotizacionPDFSale) {
  drawPageBackground(doc);

  const x = PAGE.marginX;
  const y = PAGE.top;

  drawLogo(doc, x, y);

  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(21)
    .text(`Grupo VJ - ${getQuotationCategoryLabel(sale.client)}`, x + 78, y + 13);

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(9.5)
    .text("Cotización de productos", x + 79, y + 41);

  doc
    .fillColor(C.black)
    .font("Helvetica")
    .fontSize(10)
    .text(dateText(sale.createdAt), 415, y + 12, {
      width: 92,
      align: "right",
      lineGap: 1,
    });

  const contactY = y + 82;

  doc
    .fillColor(C.text)
    .font("Helvetica")
    .fontSize(10.5)
    .text("Paso de los Andes 893", x, contactY)
    .text("03513790057", x + 172, contactY)
    .text("Grupo-VJ@hotmail.com", x + 300, contactY);

  doc
    .moveTo(x, contactY + 23)
    .lineTo(PAGE.width - x, contactY + 23)
    .strokeColor(C.line)
    .lineWidth(1)
    .stroke();
}

export function drawInfo(doc: PDFKit.PDFDocument, sale: CotizacionPDFSale) {
  const x = PAGE.marginX;
  const y = 162;

  const clientDetails = getClientDetails(sale.client);

  const rows = [
    {
      label: "Nombre del cliente",
      value: getClientName(sale.client),
      detail: clientDetails,
    },
    {
      label: "Fecha de expiración",
      value: dateText(sale.quotationExpiresAt),
      detail: "",
    },
    {
      label: "Vendedor",
      value: safe(sale.user?.name),
      detail: "",
    },
  ];

  rows.forEach((row, index) => {
    const rowY = y + index * 34;

    doc
      .fillColor(C.text)
      .font("Helvetica")
      .fontSize(11)
      .text(row.label, x, rowY);

    doc
      .fillColor(C.black)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(row.value, 292, rowY, {
        width: 216,
        align: "right",
      });

    if (row.detail) {
      doc
        .fillColor(C.muted)
        .font("Helvetica")
        .fontSize(9.2)
        .text(row.detail, 292, rowY + 14, {
          width: 216,
          align: "right",
          lineGap: 1,
        });
    }
  });

  doc
    .moveTo(x, y + 105)
    .lineTo(PAGE.width - x, y + 105)
    .strokeColor(C.line)
    .lineWidth(1)
    .stroke();
}

export function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  const x = PAGE.marginX;

  doc
    .roundedRect(x, y - 8, PAGE.width - x * 2, 34, 8)
    .fill(C.headerSoft);

  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text("Producto", x + 12, y + 3)
    .text("Código", 272, y + 3)
    .text("Cant.", 364, y + 3, { width: 45, align: "right" })
    .text("Precio unit.", 425, y + 3, { width: 70, align: "right" })
    .text("Subtotal", 502, y + 3, { width: 48, align: "right" });

  return y + 45;
}

export function drawNoImage(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc
    .roundedRect(x, y, 52, 52, 7)
    .fillAndStroke(C.soft, C.lightLine);

  doc
    .fillColor(C.lightMuted)
    .font("Helvetica-Bold")
    .fontSize(7)
    .text("SIN", x, y + 16, { width: 52, align: "center" })
    .text("FOTO", x, y + 27, { width: 52, align: "center" });
}

export async function drawProductRow(
  doc: PDFKit.PDFDocument,
  sale: CotizacionPDFSale,
  item: CotizacionPDFSale["items"][number],
  y: number,
  index: number
) {
  const x = PAGE.marginX;
  const rowHeight = 76;

  if (y + rowHeight > 704) {
    y = addPage(doc, sale);
  }

  const isEven = index % 2 === 0;

  doc
    .roundedRect(x, y - 8, PAGE.width - x * 2, rowHeight - 4, 10)
    .fill(isEven ? C.white : C.rowSoft);

  doc
    .moveTo(x + 12, y + rowHeight - 12)
    .lineTo(PAGE.width - x - 12, y + rowHeight - 12)
    .strokeColor("#EEF1F4")
    .lineWidth(0.8)
    .stroke();

  const imgX = x + 12;
  const imgY = y;
  const imageBuffer = await getImageBuffer(item.product?.imageUrl);

  if (imageBuffer) {
    try {
      doc
        .roundedRect(imgX, imgY, 58, 58, 8)
        .fill(C.white);

      doc.image(imageBuffer, imgX + 3, imgY + 3, {
        fit: [52, 52],
        align: "center",
        valign: "center",
      });
    } catch {
      drawNoImage(doc, imgX, imgY);
    }
  } else {
    drawNoImage(doc, imgX, imgY);
  }

  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(getProductName(item), x + 84, y + 13, {
      width: 160,
      height: 30,
      ellipsis: true,
    });

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(8.5)
    .text("Producto cotizado", x + 84, y + 34, {
      width: 160,
      ellipsis: true,
    });

  doc
    .fillColor(C.text)
    .font("Helvetica")
    .fontSize(10)
    .text(getProductSku(item), 272, y + 21, {
      width: 74,
      align: "left",
      ellipsis: true,
    });

  doc
    .fillColor(C.black)
    .font("Helvetica")
    .fontSize(10.5)
    .text(String(getProductQty(item)), 364, y + 21, {
      width: 45,
      align: "right",
    });

  doc.text(money(item.price), 425, y + 21, {
    width: 70,
    align: "right",
  });

  doc
    .font("Helvetica-Bold")
    .text(money(item.subtotal), 502, y + 21, {
      width: 48,
      align: "right",
    });

  return y + rowHeight;
}

export function addPage(doc: PDFKit.PDFDocument, sale: CotizacionPDFSale) {
  doc.addPage({ size: "A4", margin: 0 });
  drawPageBackground(doc);

  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(`Grupo VJ - ${getQuotationCategoryLabel(sale.client)}`, PAGE.marginX, 42);

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(`Continuación - ${dateText(sale.createdAt)}`, PAGE.marginX, 61);

  doc
    .moveTo(PAGE.marginX, 84)
    .lineTo(PAGE.width - PAGE.marginX, 84)
    .strokeColor(C.line)
    .lineWidth(1)
    .stroke();

  return drawTableHeader(doc, 105);
}

export function drawTotals(doc: PDFKit.PDFDocument, sale: CotizacionPDFSale, y: number) {
  const x = PAGE.marginX;

  if (y + 120 > PAGE.bottom) {
    doc.addPage({ size: "A4", margin: 0 });
    drawPageBackground(doc);
    y = 620;
  }

  doc
    .moveTo(x, y)
    .lineTo(PAGE.width - x, y)
    .strokeColor(C.line)
    .lineWidth(1)
    .stroke();

  const boxW = 240;
  const boxX = PAGE.width - x - boxW;
  const boxY = y + 24;

  doc
    .fillColor(C.muted)
    .font("Helvetica")
    .fontSize(10.5)
    .text("Subtotal", boxX, boxY, {
      width: 100,
      align: "left",
    });

  doc
    .fillColor(C.black)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(money(sale.subtotal), boxX + 120, boxY, {
      width: 120,
      align: "right",
    });

  const hasDiscount =
    sale.discountValue !== null &&
    sale.discountValue !== undefined &&
    Number(sale.discountValue) > 0;

  let totalBoxY = boxY + 26;

  if (hasDiscount) {
    const discountAmount = Number(sale.subtotal || 0) - Number(sale.total || 0);

    doc
      .fillColor(C.muted)
      .font("Helvetica")
      .fontSize(10.5)
      .text("Descuento", boxX, boxY + 22, {
        width: 100,
        align: "left",
      });

    doc
      .fillColor(C.black)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(`- ${money(discountAmount)}`, boxX + 120, boxY + 22, {
        width: 120,
        align: "right",
      });

    totalBoxY = boxY + 48;
  }

  doc
    .roundedRect(boxX - 4, totalBoxY, boxW + 4, 42, 10)
    .fill(C.black);

  doc
    .fillColor(C.white)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("Total", boxX + 14, totalBoxY + 13);

  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(money(sale.total), boxX + 92, totalBoxY + 13, {
      width: 134,
      align: "right",
    });
}

export function drawFooter(doc: PDFKit.PDFDocument, page: number, totalPages: number) {
  doc
    .fillColor(C.lightMuted)
    .font("Helvetica")
    .fontSize(7.5)
    .text(`Página ${page} de ${totalPages}`, PAGE.marginX, 820, {
      width: PAGE.width - PAGE.marginX * 2,
      align: "center",
    });
}
