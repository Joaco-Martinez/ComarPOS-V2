/**
 * PDF descargable del presupuesto de una reparacion (modulo Servicios) --
 * lo puede pedir tanto el panel (autenticado) como la pagina publica de
 * aprobacion (por token, ver repairOrder.controller.ts#getPublicPdf). Sigue
 * el mismo estilo visual que generarCotizacionPDF (logo del tenant via
 * getImageBuffer, footer de marca) pero con contenido propio de una
 * reparacion en vez de un carrito de productos.
 */
import PDFDocument from "pdfkit";
import { getImageBuffer } from "./generarCotizacionPDF/assets";
import { COMARPOS_FOOTER_TEXT } from "./comarposBranding";

export type PresupuestoReparacionPDFData = {
  id: string;
  createdAt: Date | string;
  status: string;
  deviceType: string;
  deviceBrand?: string | null;
  deviceModel?: string | null;
  deviceSerial?: string | null;
  deviceAccessories?: string | null;
  reportedIssue: string;
  diagnosis?: string | null;
  totalAmount: number;
  client?: { nombre?: string | null; apellido?: string | null; dni?: string | null; telefono?: string | null } | null;
  items: { description: string; quantity: number; unitPrice: number; subtotal: number }[];
  business: {
    name: string;
    cuit?: string | null;
    address?: string | null;
    phone?: string | null;
    logoUrl?: string | null;
  };
};

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Recibido", BUDGETED: "Pendiente de aprobación", APPROVED: "Aprobado", REJECTED: "Rechazado",
  IN_PROGRESS: "En reparación", READY: "Listo para retirar", DELIVERED: "Entregado", CANCELLED: "Cancelado",
};

const PAGE = { width: 595.28, height: 841.89, marginX: 46, bottom: 780 };
const C = { text: "#172033", muted: "#667085", line: "#D0D5DD", soft: "#F8FAFC", accent: "#0D59E7" };

function fmtDate(v?: Date | string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function fmtMoney(v?: number | null) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(Number(v ?? 0));
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number) {
  if (y + needed <= PAGE.bottom) return y;
  doc.addPage();
  return 50;
}

export async function generarPresupuestoReparacionPDF(data: PresupuestoReparacionPDFData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: "A4",
        margin: 0,
        bufferPages: true,
        info: {
          Title: `Presupuesto de reparación ${data.id}`,
          Author: data.business.name || "ComarPOS",
          Subject: "Presupuesto de reparación",
        },
      });

      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = PAGE.marginX;
      const width = PAGE.width - PAGE.marginX * 2;
      let y = 40;

      // --- Header: logo + datos del negocio ---
      const logoBuffer = await getImageBuffer(data.business.logoUrl);
      let textLeft = left;
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, left, y, { fit: [70, 44] });
          textLeft = left + 84;
        } catch { /* logo corrupto/no soportado -- seguimos sin el */ }
      }

      doc.font("Helvetica-Bold").fontSize(13).fillColor(C.text).text(data.business.name || "Mi Negocio", textLeft, y, { width: width - (textLeft - left) });
      let infoY = y + 17;
      const businessLine = [data.business.cuit ? `CUIT ${data.business.cuit}` : null, data.business.address, data.business.phone].filter(Boolean).join(" · ");
      if (businessLine) {
        doc.font("Helvetica").fontSize(8.5).fillColor(C.muted).text(businessLine, textLeft, infoY, { width: width - (textLeft - left) });
        infoY += 12;
      }

      y = Math.max(y + 54, infoY + 8);

      doc.font("Helvetica-Bold").fontSize(16).fillColor(C.accent).text("PRESUPUESTO DE REPARACIÓN", left, y, { width, align: "right" });
      y += 20;
      doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(`N° ${data.id.slice(-8).toUpperCase()}  ·  ${fmtDate(data.createdAt)}  ·  ${STATUS_LABEL[data.status] ?? data.status}`, left, y, { width, align: "right" });
      y += 26;

      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.7).strokeColor(C.line).stroke();
      y += 16;

      // --- Cliente / Equipo ---
      const colW = width / 2 - 10;
      const clientName = data.client ? `${data.client.nombre ?? ""} ${data.client.apellido ?? ""}`.trim() : "";
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.muted).text("CLIENTE", left, y);
      doc.font("Helvetica").fontSize(10).fillColor(C.text).text(clientName || "Consumidor final", left, y + 13, { width: colW });
      if (data.client?.dni) doc.fontSize(8.5).fillColor(C.muted).text(`DNI ${data.client.dni}${data.client.telefono ? ` · ${data.client.telefono}` : ""}`, left, y + 28, { width: colW });

      const rightCol = left + colW + 20;
      const deviceLine = [data.deviceBrand, data.deviceModel].filter(Boolean).join(" ") || data.deviceType;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.muted).text("EQUIPO", rightCol, y);
      doc.font("Helvetica").fontSize(10).fillColor(C.text).text(`${data.deviceType} — ${deviceLine}`, rightCol, y + 13, { width: colW });
      const deviceExtra = [data.deviceSerial ? `Serie: ${data.deviceSerial}` : null, data.deviceAccessories ? `Accesorios: ${data.deviceAccessories}` : null].filter(Boolean).join(" · ");
      if (deviceExtra) doc.fontSize(8.5).fillColor(C.muted).text(deviceExtra, rightCol, y + 28, { width: colW });

      y += 52;

      // --- Falla / diagnostico ---
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.muted).text("FALLA REPORTADA", left, y);
      const issueHeight = doc.font("Helvetica").fontSize(9.5).fillColor(C.text).heightOfString(data.reportedIssue, { width });
      doc.text(data.reportedIssue, left, y + 13, { width });
      y += 13 + issueHeight + 14;

      if (data.diagnosis) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.muted).text("DIAGNÓSTICO", left, y);
        const diagHeight = doc.font("Helvetica").fontSize(9.5).fillColor(C.text).heightOfString(data.diagnosis, { width });
        doc.text(data.diagnosis, left, y + 13, { width });
        y += 13 + diagHeight + 14;
      }

      // --- Items ---
      y = ensureSpace(doc, y, 30);
      doc.rect(left, y, width, 20).fill(C.soft);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.muted);
      doc.text("DESCRIPCIÓN", left + 8, y + 6, { width: width * 0.55 });
      doc.text("CANT.", left + width * 0.58, y + 6, { width: width * 0.12, align: "right" });
      doc.text("PRECIO UNIT.", left + width * 0.68, y + 6, { width: width * 0.16, align: "right" });
      doc.text("SUBTOTAL", left + width * 0.84, y + 6, { width: width * 0.16 - 8, align: "right" });
      y += 20;

      for (const item of data.items) {
        const rowHeight = Math.max(20, doc.font("Helvetica").fontSize(9.5).heightOfString(item.description, { width: width * 0.55 - 8 }) + 8);
        y = ensureSpace(doc, y, rowHeight);
        doc.font("Helvetica").fontSize(9.5).fillColor(C.text);
        doc.text(item.description, left + 8, y + 5, { width: width * 0.55 - 8 });
        doc.text(String(item.quantity), left + width * 0.58, y + 5, { width: width * 0.12, align: "right" });
        doc.text(fmtMoney(item.unitPrice), left + width * 0.68, y + 5, { width: width * 0.16, align: "right" });
        doc.text(fmtMoney(item.subtotal), left + width * 0.84, y + 5, { width: width * 0.16 - 8, align: "right" });
        doc.moveTo(left, y + rowHeight).lineTo(left + width, y + rowHeight).lineWidth(0.5).strokeColor(C.line).stroke();
        y += rowHeight;
      }

      y = ensureSpace(doc, y, 40);
      y += 12;
      doc.font("Helvetica-Bold").fontSize(11).fillColor(C.text).text("TOTAL", left + width * 0.68, y, { width: width * 0.16, align: "right" });
      doc.font("Helvetica-Bold").fontSize(13).fillColor(C.accent).text(fmtMoney(data.totalAmount), left + width * 0.84, y - 1, { width: width * 0.16 - 8, align: "right" });

      // --- Footer (todas las paginas) ---
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(
          `${COMARPOS_FOOTER_TEXT}  ·  Generado ${fmtDate(new Date())}  ·  Página ${i + 1} de ${pages.count}`,
          left, PAGE.height - 30, { width, align: "center" }
        );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
