/**
 * Renderizado de totales, datos fiscales (QR/CAE) y footer del PDF de factura.
 * Extraidos de facturaPdfGenerator.service.ts (modularizacion, doc seccion 4).
 */
import fs from "fs";
import { COLORS, FacturaPDFData } from "./types";
import { formatCurrency, formatDateAR, buildNumeroComprobante } from "./format";
import { getEmpresa } from "./labels";
import { drawBox } from "./sections.header";
import { COMARPOS_FOOTER_TEXT } from "../../utils/comarposBranding";

export function renderTotals(doc: PDFKit.PDFDocument, factura: FacturaPDFData["factura"]) {
  const boxW = 230;
  const boxH = 68;
  const x = doc.page.width - 40 - boxW;
  const y = doc.y;

  drawBox(doc, x, y, boxW, boxH, COLORS.white);

  const labelX = x + 14;
  const valueX = x + 115;

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.gray900)
    .text("Subtotal:", labelX, y + 10, { width: 90 })
    .text(formatCurrency(factura.neto), valueX, y + 10, {
      width: 98,
      align: "right",
    });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.gray900)
    .text("IVA:", labelX, y + 28, { width: 90 })
    .text(formatCurrency(factura.iva), valueX, y + 28, {
      width: 98,
      align: "right",
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.redDark)
    .text("TOTAL:", labelX, y + 47, { width: 90 })
    .text(formatCurrency(factura.total), valueX, y + 47, {
      width: 98,
      align: "right",
    });

  doc.y = y + boxH + 10;
}

export function renderFiscalSection(
  doc: PDFKit.PDFDocument,
  factura: FacturaPDFData["factura"],
  qrPath?: string
) {
  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const top = doc.y;

  const sectionH = 126;

  drawBox(doc, left, top, width, sectionH, COLORS.white);

  doc.save();
  doc.fillColor(COLORS.red).rect(left, top, width, 4).fill();
  doc.restore();

  const qrW = 86;
  const qrX = right - qrW - 14;
  const qrY = top + 18;

  const infoX = left + 14;
  const infoW = width - qrW - 42;

  doc
    .font("Helvetica-Bold")
    .fontSize(10.2)
    .fillColor(COLORS.redDark)
    .text("DATOS FISCALES", infoX, top + 13, { width: infoW });

  let textY = top + 35;

  doc
    .font("Helvetica")
    .fontSize(8.8)
    .fillColor(COLORS.gray900)
    .text("Comprobante autorizado electrónicamente.", infoX, textY, {
      width: infoW,
    });

  textY += 17;

  doc.text(`CAE: ${factura.cae || "-"}`, infoX, textY, { width: infoW });

  textY += 17;

  doc.text(`Vencimiento CAE: ${formatDateAR(factura.caeVto)}`, infoX, textY, {
    width: infoW,
  });

  textY += 17;

  doc.text(
    `Comprobante: ${buildNumeroComprobante(
      factura.puntoVenta,
      factura.numero
    )}`,
    infoX,
    textY,
    { width: infoW }
  );

  textY += 18;

  doc
    .fontSize(7.6)
    .fillColor(COLORS.gray700)
    .text("Verificación: comprobante.afip.gob.ar", infoX, textY, {
      width: infoW,
    });

  if (qrPath && fs.existsSync(qrPath)) {
    try {
      doc.image(qrPath, qrX, qrY, { fit: [qrW, qrW] });
    } catch {
      drawBox(doc, qrX, qrY, qrW, qrW, COLORS.gray100);

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLORS.gray700)
        .text("QR no disponible", qrX, qrY + 36, {
          width: qrW,
          align: "center",
        });
    }
  } else {
    drawBox(doc, qrX, qrY, qrW, qrW, COLORS.gray100);

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.gray700)
      .text("QR no disponible", qrX, qrY + 36, {
        width: qrW,
        align: "center",
      });
  }

  doc.y = top + sectionH + 6;
}

export function renderFooter(doc: PDFKit.PDFDocument, data: FacturaPDFData) {
  const empresa = getEmpresa(data);
  const left = 40;
  const y = doc.page.height - 46;
  const width = doc.page.width - 80;

  doc
    .font("Helvetica")
    .fontSize(7.4)
    .fillColor(COLORS.gray500)
    .text(
      `${empresa.name} - ${empresa.subtitle} - CUIT ${empresa.cuit}`,
      left,
      y,
      { width, align: "center" }
    )
    .text(
      "Este documento representa un comprobante electrónico autorizado por ARCA/AFIP.",
      left,
      y + 10,
      { width, align: "center" }
    )
    .text("Verificación: comprobante.afip.gob.ar", left, y + 20, {
      width,
      align: "center",
    })
    .text(COMARPOS_FOOTER_TEXT, left, y + 32, {
      width,
      align: "center",
    });
}
