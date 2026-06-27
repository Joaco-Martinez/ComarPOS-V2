/**
 * Renderizado del header y la seccion de datos del receptor del PDF de factura.
 * Extraidos de facturaPdfGenerator.service.ts (modularizacion, doc seccion 4).
 */
import fs from "fs";
import { COLORS, FacturaPDFData } from "./types";
import { formatDateAR, formatTimeAR } from "./format";
import {
  getEmpresa,
  getLetraComprobante,
  getTipoComprobanteLabel,
  getCondicionIVAEmisor,
  getClienteLabel,
  getCondicionIVAReceptorLabel,
} from "./labels";

export function drawBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  fillColor?: string,
  strokeColor = COLORS.gray300
) {
  if (fillColor) {
    doc.save();
    doc.fillColor(fillColor).rect(x, y, w, h).fill();
    doc.restore();
  }

  doc.save();
  doc.lineWidth(0.7).strokeColor(strokeColor).rect(x, y, w, h).stroke();
  doc.restore();
}

export function renderPageHeader(
  doc: PDFKit.PDFDocument,
  data: FacturaPDFData,
  logoPath?: string
) {
  const factura = data.factura;
  const empresa = getEmpresa(data);

  const pageWidth = doc.page.width;
  const left = 40;
  const right = pageWidth - 40;
  const width = right - left;
  const top = 30;

  const headerH = 132;
  const emisorW = width * 0.6;
  const letterW = 72;
  const metaW = width - emisorW - letterW;

  drawBox(doc, left, top, emisorW, headerH, COLORS.white);
  drawBox(doc, left + emisorW, top, letterW, headerH, COLORS.white);
  drawBox(doc, left + emisorW + letterW, top, metaW, headerH, COLORS.white);

  doc.save();
  doc.fillColor(COLORS.red).rect(left, top, width, 5).fill();
  doc.restore();

  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, left + 14, top + 14, {
        fit: [82, 42],
      });
    } catch {}
  }

  doc
    .font("Helvetica-Bold")
    .fillColor(COLORS.black)
    .fontSize(18)
    .text(empresa.name, left + 14, top + 60, {
      width: emisorW - 28,
      align: "left",
      lineBreak: false,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.redDark)
    .text(empresa.subtitle, left + 14, top + 82, {
      width: emisorW - 28,
      align: "left",
      lineBreak: false,
    });

  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.gray700);

  doc.text(empresa.address, left + 14, top + 99, {
    width: emisorW - 28,
    lineBreak: false,
  });

  doc.text(`CUIT: ${empresa.cuit}`, left + 14, top + 112, {
    width: emisorW - 28,
    lineBreak: false,
  });

  doc.text(
    getCondicionIVAEmisor(factura.tipoComprobante, empresa.ivaCondition),
    left + 14,
    top + 124,
    {
      width: emisorW - 28,
      lineBreak: false,
    }
  );

  const letra = getLetraComprobante(factura.tipoComprobante);

  doc
    .font("Helvetica-Bold")
    .fontSize(38)
    .fillColor(COLORS.black)
    .text(letra, left + emisorW, top + 18, {
      width: letterW,
      align: "center",
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.gray900)
    .text(
      `COD. ${String(factura.tipoComprobante).padStart(3, "0")}`,
      left + emisorW,
      top + 82,
      {
        width: letterW,
        align: "center",
      }
    );

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.gray500)
    .text("ORIGINAL", left + emisorW, top + 104, {
      width: letterW,
      align: "center",
    });

  const metaX = left + emisorW + letterW + 12;
  const metaWInner = metaW - 24;

  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(COLORS.black)
    .text(getTipoComprobanteLabel(factura.tipoComprobante), metaX, top + 16, {
      width: metaWInner,
      align: "left",
      lineBreak: false,
    });

  doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray700);

  doc.text(
    `Punto de Venta: ${String(factura.puntoVenta).padStart(4, "0")}`,
    metaX,
    top + 44,
    {
      width: metaWInner,
      lineBreak: false,
    }
  );

  doc.text(
    `Comp. Nro: ${String(factura.numero).padStart(8, "0")}`,
    metaX,
    top + 62,
    {
      width: metaWInner,
      lineBreak: false,
    }
  );

  doc.text(`Fecha: ${formatDateAR(factura.fechaEmision)}`, metaX, top + 80, {
    width: metaWInner,
    lineBreak: false,
  });

  doc.text(`Hora: ${formatTimeAR(factura.fechaEmision)}`, metaX, top + 98, {
    width: metaWInner,
    lineBreak: false,
  });

  doc.text(`Tel: ${empresa.phone}`, metaX, top + 116, {
    width: metaWInner,
    lineBreak: false,
  });

  doc.y = top + headerH + 14;
}

export function renderClienteSection(
  doc: PDFKit.PDFDocument,
  factura: FacturaPDFData["factura"],
  cliente: FacturaPDFData["cliente"]
) {
  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const top = doc.y;

  const sectionH = 82;

  drawBox(doc, left, top, width, sectionH, COLORS.white);

  doc
    .font("Helvetica-Bold")
    .fillColor(COLORS.redDark)
    .fontSize(10.5)
    .text("DATOS DEL RECEPTOR", left + 12, top + 9, {
      width: width - 24,
    });

  const fullName = `${cliente.nombre || ""} ${cliente.apellido || ""}`.trim();

  const col1X = left + 12;
  const col2X = left + width / 2 + 6;
  const line1Y = top + 30;
  const line2Y = top + 48;
  const line3Y = top + 65;

  doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray900);

  doc.text(`Razón social: ${fullName || "Consumidor Final"}`, col1X, line1Y, {
    width: width / 2 - 18,
  });

  doc.text(`CUIT / Doc: ${cliente.dni || "-"}`, col2X, line1Y, {
    width: width / 2 - 18,
  });

  doc.text(`Tipo cliente: ${getClienteLabel(cliente.category)}`, col1X, line2Y, {
    width: width / 2 - 18,
  });

  doc.text(
    `Condición IVA: ${getCondicionIVAReceptorLabel(
      factura.condicionIVAReceptor
    )}`,
    col2X,
    line2Y,
    {
      width: width / 2 - 18,
    }
  );

  doc.text(`Teléfono: ${cliente.telefono || "-"}`, col1X, line3Y, {
    width: width / 2 - 18,
  });

  doc.text(`Email: ${cliente.gmail || "-"}`, col2X, line3Y, {
    width: width / 2 - 18,
  });

  doc.y = top + sectionH + 12;
}
