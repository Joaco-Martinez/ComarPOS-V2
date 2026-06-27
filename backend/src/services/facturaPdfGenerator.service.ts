/**
 * Generador de PDF de factura AFIP.
 * La logica fue extraida a sub-modulos para reducir la superficie de cambio:
 *   - facturaPdfGenerator/types.ts    → tipos e interfaces + colores
 *   - facturaPdfGenerator/format.ts   → formato de moneda/fecha/comprobante
 *   - facturaPdfGenerator/labels.ts   → etiquetas fiscales (letra, condicion IVA, datos empresa)
 *   - facturaPdfGenerator/io.ts       → filesystem, QR y Cloudinary
 *   - facturaPdfGenerator/sections.header.ts → header + datos del receptor
 *   - facturaPdfGenerator/sections.table.ts  → tabla de productos
 *   - facturaPdfGenerator/sections.totals.ts → totales, datos fiscales (QR/CAE) y footer
 *
 * Este archivo es el unico punto de entrada al exterior (doc seccion 4).
 */
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import { FacturaPDFData } from "./facturaPdfGenerator/types";
import { ensureDir, uploadPDFtoCloudinary, generarQRPNGDesdeURL, getDefaultLogoPath } from "./facturaPdfGenerator/io";
import { renderPageHeader, renderClienteSection } from "./facturaPdfGenerator/sections.header";
import { renderProductsTable } from "./facturaPdfGenerator/sections.table";
import { renderTotals, renderFiscalSection, renderFooter } from "./facturaPdfGenerator/sections.totals";

export type { Product, TipoCliente, FacturaPDFData } from "./facturaPdfGenerator/types";

export async function generarFacturaPDF(
  data: FacturaPDFData,
  uploadToCloudinary = false
) {
  const basePath = path.resolve("./");
  const outputDir = path.join(basePath, "tmp");

  ensureDir(outputDir);

  const filePath = path.join(
    outputDir,
    `factura-${data.factura.puntoVenta}-${data.factura.numero}.pdf`
  );

  const qrPath = path.join(
    outputDir,
    `qr-${data.factura.puntoVenta}-${data.factura.numero}.png`
  );

  const logoPath = getDefaultLogoPath(basePath, data.logoPath);

  try {
    let qrDisponible = false;

    if (data.factura.urlQR) {
      try {
        await generarQRPNGDesdeURL(data.factura.urlQR, qrPath);
        qrDisponible = true;
      } catch (err: any) {
        console.warn("⚠️ No se pudo generar QR para factura PDF:", err?.message);
        qrDisponible = false;
      }
    }

    await new Promise<void>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          margin: 0,
          bufferPages: true,
        });

        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        renderPageHeader(doc, data, logoPath);
        renderClienteSection(doc, data.factura, data.cliente);
        renderProductsTable(doc, data.products);
        renderTotals(doc, data.factura);
        renderFiscalSection(
          doc,
          data.factura,
          qrDisponible && fs.existsSync(qrPath) ? qrPath : undefined
        );
        renderFooter(doc, data);

        doc.end();

        stream.on("finish", () => resolve());
        stream.on("error", reject);
      } catch (error) {
        reject(error);
      }
    });

    if (fs.existsSync(qrPath)) {
      fs.unlinkSync(qrPath);
    }

    if (!uploadToCloudinary) {
      return { filePath };
    }

    const cloudinaryUrl = await uploadPDFtoCloudinary(
      filePath,
      data.factura.numero
    );

    return {
      filePath,
      cloudinaryUrl,
    };
  } catch (error) {
    if (fs.existsSync(qrPath)) {
      fs.unlinkSync(qrPath);
    }

    throw error;
  }
}
