/**
 * PDF descargable de una orden de compra (modulo Ordenes de Compra) -- para
 * mandarle al proveedor por mail/WhatsApp. Mismo estilo visual que
 * generarPresupuestoReparacionPDF (logo del tenant via getImageBuffer,
 * footer de marca, desglose Neto/IVA/Total) pero con el proveedor como
 * destinatario en vez del cliente, y una tabla de productos pedidos en vez
 * de un carrito.
 */
import PDFDocument from "pdfkit";
import { getImageBuffer } from "./generarCotizacionPDF/assets";
import { COMARPOS_FOOTER_TEXT } from "./comarposBranding";

export type OrdenCompraPDFData = {
  id: string;
  createdAt: Date | string;
  status: string;
  expectedDate?: Date | string | null;
  notes?: string | null;
  totalAmount: number;
  supplier: {
    name: string;
    cuit?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
  items: {
    productName: string;
    sku?: string | null;
    quantity?: number | null;
    quantityKg?: number | null;
    unitCost: number;
    subtotal: number;
    ivaRate: number;
  }[];
  business: {
    name: string;
    cuit?: string | null;
    address?: string | null;
    phone?: string | null;
    logoUrl?: string | null;
  };
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador", SENT: "Enviada", PARTIAL: "Parcial", RECEIVED: "Recibida", CANCELLED: "Cancelada",
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

function fmtIvaRate(rate: number) {
  return rate <= 0 ? "Exento" : `${rate % 1 === 0 ? rate.toFixed(0) : rate}%`;
}

function fmtQty(quantity?: number | null, quantityKg?: number | null) {
  if (quantityKg != null) return `${quantityKg} kg`;
  return String(quantity ?? 0);
}

// El costo unitario ya incluye IVA (precio final) -- mismo criterio que
// generarPresupuestoReparacionPDF/ticket.service.ts#buildIvaBreakdown:
// "destapa" el neto de cada item con su propia alicuota y agrupa el IVA por
// tasa, para que el desglose Subtotal/IVA/Total sea el mismo en todos los
// documentos del sistema.
function buildIvaBreakdown(items: { subtotal: number; ivaRate: number }[]) {
  const ivaByRate: Record<number, number> = {};
  let netoSum = 0;
  for (const item of items) {
    const rate = item.ivaRate ?? 21;
    const neto = (item.subtotal || 0) / (1 + rate / 100);
    const iva = (item.subtotal || 0) - neto;
    ivaByRate[rate] = (ivaByRate[rate] ?? 0) + iva;
    netoSum += neto;
  }
  const breakdown = Object.entries(ivaByRate)
    .filter(([, amount]) => amount > 0.01)
    .map(([rate, amount]) => ({ rate: Number(rate), amount }))
    .sort((a, b) => b.rate - a.rate);
  return { netoSum, breakdown };
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number) {
  if (y + needed <= PAGE.bottom) return y;
  doc.addPage();
  return 50;
}

export async function generarOrdenCompraPDF(data: OrdenCompraPDFData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: "A4",
        margin: 0,
        bufferPages: true,
        info: {
          Title: `Orden de compra ${data.id}`,
          Author: data.business.name || "ComarPOS",
          Subject: "Orden de compra",
        },
      });

      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = PAGE.marginX;
      const width = PAGE.width - PAGE.marginX * 2;
      let y = 40;

      // --- Header: logo + datos del negocio que compra ---
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

      doc.font("Helvetica-Bold").fontSize(16).fillColor(C.accent).text("ORDEN DE COMPRA", left, y, { width, align: "right" });
      y += 20;
      doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(
        `N° ${data.id.slice(-8).toUpperCase()}  ·  ${fmtDate(data.createdAt)}  ·  ${STATUS_LABEL[data.status] ?? data.status}`,
        left, y, { width, align: "right" }
      );
      y += 26;

      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.7).strokeColor(C.line).stroke();
      y += 16;

      // --- Proveedor / Entrega ---
      const colW = width / 2 - 10;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.muted).text("PROVEEDOR", left, y);
      doc.font("Helvetica").fontSize(10).fillColor(C.text).text(data.supplier?.name || "Sin proveedor", left, y + 13, { width: colW });
      const supplierExtra = [
        data.supplier?.cuit ? `CUIT ${data.supplier.cuit}` : null,
        data.supplier?.contactName,
      ].filter(Boolean).join(" · ");
      if (supplierExtra) doc.fontSize(8.5).fillColor(C.muted).text(supplierExtra, left, y + 28, { width: colW });
      const supplierContact = [data.supplier?.phone, data.supplier?.email].filter(Boolean).join(" · ");
      if (supplierContact) doc.fontSize(8.5).fillColor(C.muted).text(supplierContact, left, y + 40, { width: colW });
      if (data.supplier?.address) doc.fontSize(8.5).fillColor(C.muted).text(data.supplier.address, left, y + 52, { width: colW });

      const rightCol = left + colW + 20;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.muted).text("ENTREGA", rightCol, y);
      doc.font("Helvetica").fontSize(10).fillColor(C.text).text(
        data.expectedDate ? `Esperada: ${fmtDate(data.expectedDate)}` : "Sin fecha esperada",
        rightCol, y + 13, { width: colW }
      );

      y += 72;

      // --- Notas ---
      if (data.notes) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.muted).text("NOTAS", left, y);
        const notesHeight = doc.font("Helvetica").fontSize(9.5).fillColor(C.text).heightOfString(data.notes, { width });
        doc.text(data.notes, left, y + 13, { width });
        y += 13 + notesHeight + 14;
      }

      // --- Items ---
      const cDesc = width * 0.4, cQty = width * 0.12, cIva = width * 0.12, cUnit = width * 0.18, cSub = width * 0.18 - 8;
      const xDesc = left, xQty = left + cDesc, xIva = xQty + cQty, xUnit = xIva + cIva, xSub = xUnit + cUnit;

      y = ensureSpace(doc, y, 30);
      doc.rect(left, y, width, 20).fill(C.soft);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.muted);
      doc.text("PRODUCTO", xDesc + 8, y + 6, { width: cDesc - 8 });
      doc.text("CANT.", xQty, y + 6, { width: cQty, align: "right" });
      doc.text("IVA", xIva, y + 6, { width: cIva, align: "right" });
      doc.text("COSTO UNIT.", xUnit, y + 6, { width: cUnit, align: "right" });
      doc.text("SUBTOTAL", xSub, y + 6, { width: cSub, align: "right" });
      y += 20;

      for (const item of data.items) {
        const label = item.sku ? `${item.productName}  (SKU: ${item.sku})` : item.productName;
        const rowHeight = Math.max(20, doc.font("Helvetica").fontSize(9.5).heightOfString(label, { width: cDesc - 8 }) + 8);
        y = ensureSpace(doc, y, rowHeight);
        doc.font("Helvetica").fontSize(9.5).fillColor(C.text);
        doc.text(label, xDesc + 8, y + 5, { width: cDesc - 8 });
        doc.text(fmtQty(item.quantity, item.quantityKg), xQty, y + 5, { width: cQty, align: "right" });
        doc.fontSize(8.5).fillColor(C.muted).text(fmtIvaRate(item.ivaRate ?? 21), xIva, y + 6, { width: cIva, align: "right" });
        doc.fontSize(9.5).fillColor(C.text).text(fmtMoney(item.unitCost), xUnit, y + 5, { width: cUnit, align: "right" });
        doc.text(fmtMoney(item.subtotal), xSub, y + 5, { width: cSub, align: "right" });
        doc.moveTo(left, y + rowHeight).lineTo(left + width, y + rowHeight).lineWidth(0.5).strokeColor(C.line).stroke();
        y += rowHeight;
      }

      // --- Totales: Subtotal (sin IVA) -> IVA por alicuota -> Total ---
      const { netoSum, breakdown } = buildIvaBreakdown(data.items);
      const totalsLines = 1 + breakdown.length + 1;
      y = ensureSpace(doc, y, 16 * totalsLines + 16);
      y += 12;

      const labelX = xUnit, labelW = cUnit, valueX = xSub, valueW = cSub;

      doc.font("Helvetica").fontSize(9.5).fillColor(C.muted).text("Subtotal (sin IVA)", labelX, y, { width: labelW, align: "right" });
      doc.fillColor(C.text).text(fmtMoney(netoSum), valueX, y, { width: valueW, align: "right" });
      y += 16;

      for (const line of breakdown) {
        doc.font("Helvetica").fontSize(9.5).fillColor(C.muted).text(`IVA ${fmtIvaRate(line.rate)}`, labelX, y, { width: labelW, align: "right" });
        doc.fillColor(C.text).text(fmtMoney(line.amount), valueX, y, { width: valueW, align: "right" });
        y += 16;
      }

      doc.font("Helvetica-Bold").fontSize(11).fillColor(C.text).text("TOTAL ESTIMADO", labelX, y, { width: labelW, align: "right" });
      doc.font("Helvetica-Bold").fontSize(13).fillColor(C.accent).text(fmtMoney(data.totalAmount), valueX, y - 1, { width: valueW, align: "right" });

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
