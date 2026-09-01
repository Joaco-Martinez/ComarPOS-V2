/**
 * Generador de PDF de cotizacion.
 * La logica fue extraida a sub-modulos para reducir la superficie de cambio:
 *   - generarCotizacionPDF/types.ts    → tipos e interfaces + constantes visuales
 *   - generarCotizacionPDF/format.ts   → formato de moneda/fecha/datos de cliente/producto
 *   - generarCotizacionPDF/assets.ts   → logo e imagenes de producto (con cache)
 *   - generarCotizacionPDF/sections.ts → renderizado de cada seccion del PDF
 *
 * Este archivo es el unico punto de entrada al exterior (doc seccion 4).
 */
import PDFDocument from "pdfkit";
import { CotizacionPDFSale } from "./generarCotizacionPDF/types";
import {
  drawHeader,
  drawInfo,
  drawTableHeader,
  drawProductRow,
  drawDiscountOptions,
  drawTotals,
  drawFooter,
} from "./generarCotizacionPDF/sections";

export type { CotizacionPDFSale } from "./generarCotizacionPDF/types";

export async function generarCotizacionPDF(
  sale: CotizacionPDFSale
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const chunks: Buffer[] = [];

      const doc = new PDFDocument({
        size: "A4",
        margin: 0,
        bufferPages: true,
        info: {
          Title: `Cotización ${sale.id}`,
          Author: sale.businessName?.trim() || "Mi Negocio",
          Subject: "Cotización de productos",
        },
      });

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const headerBottom = await drawHeader(doc, sale);
      const infoBottom = drawInfo(doc, sale, headerBottom);

      let y = drawTableHeader(doc, infoBottom, sale);

      for (let i = 0; i < sale.items.length; i++) {
        y = await drawProductRow(doc, sale, sale.items[i], y, i);
      }

      y = drawDiscountOptions(doc, sale, y + 6);

      drawTotals(doc, sale, y);

      const pages = doc.bufferedPageRange();

      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        drawFooter(doc, i + 1, pages.count);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
