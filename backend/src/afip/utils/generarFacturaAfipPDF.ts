/**
 * Generador de PDF/ticket de factura AFIP + impresion en POS local.
 * La logica fue extraida a sub-modulos para reducir la superficie de cambio:
 *   - generarFacturaAfipPDF/types.ts   → tipos + constantes (POS_LOCAL_URL/TOKEN, PAGE_WIDTH)
 *   - generarFacturaAfipPDF/labels.ts  → etiquetas fiscales (letra, condicion IVA, cliente)
 *   - generarFacturaAfipPDF/format.ts  → formato de moneda/fecha/numeracion
 *   - generarFacturaAfipPDF/ticket.ts  → payload de ticket + envio al POS local
 *
 * Este archivo es el unico punto de entrada al exterior (doc seccion 4.3).
 */
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { uploadPDFtoCloudinary } from "../utils/uploadPDFtoCloudinary";
import prisma from "../../prisma";
import { Product, TipoCliente, PAGE_WIDTH } from "./generarFacturaAfipPDF/types";
import {
  getLetraComprobante,
  getCondicionIVAEmisor,
  getClienteLabel,
  getCondicionIVAReceptorLabel,
} from "./generarFacturaAfipPDF/labels";
import { formatCurrency, formatDateAR, formatTimeAR, formatCaeDate } from "./generarFacturaAfipPDF/format";
import { buildTicketPayload, enviarTicketAlPOSLocal } from "./generarFacturaAfipPDF/ticket";
import { COMARPOS_FOOTER_TEXT_SHORT } from "../../utils/comarposBranding";

export async function generarFacturaAfipPDF({
  tipoComprobante,
  puntoVenta,
  saleId,
  numero,
  fechaEmision,
  nombreCliente = "A CONSUMIDOR FINAL ***********",
  domicilioCliente = "",
  total,
  metodoPago = "EFECTIVO",
  cae,
  caeVto,
  products,
  cuit,
  razonSocial = "Mi Negocio",
  direccion = "",
  telefonoNegocio = "",
  qrBase64,
  qrUrl,

  tipoCliente = "Consumidor Final",
  documentoCliente,
  telefonoCliente,
}: {
  tipoComprobante: number;
  puntoVenta: number;
  saleId: string;
  numero: number;
  fechaEmision: Date;
  nombreCliente?: string;
  domicilioCliente?: string;
  total: number;
  metodoPago?: string;
  cae: string;
  caeVto: Date;
  cuit: string;
  razonSocial?: string;
  direccion?: string;
  telefonoNegocio?: string;
  qrBase64?: string | null;
  qrUrl?: string | null;
  products?: Product[];

  tipoCliente?: TipoCliente;
  documentoCliente?: string | number;
  telefonoCliente?: string;
}) {
  return new Promise<void>((resolve, reject) => {
    let filePath = "";

    try {
      const basePath = path.resolve("./");
      filePath = path.join(basePath, `factura-${numero}.pdf`);
      const logoPath = path.join(basePath, "assets/logo-von-konig-png-1.png");

      const letraComprobante = getLetraComprobante(tipoComprobante);
      const condicionIVAEmisor = getCondicionIVAEmisor(tipoComprobante);
      const clienteLabel = getClienteLabel(tipoCliente);
      const condicionIVAReceptor = getCondicionIVAReceptorLabel(
        tipoComprobante,
        tipoCliente
      );

      const doc = new PDFDocument({
        size: [PAGE_WIDTH, 1000],
        margin: 10,
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      if (fs.existsSync(logoPath)) {
        const imgWidth = 80;
        const x = (PAGE_WIDTH - imgWidth) / 2;
        doc.image(logoPath, x, 8, { width: imgWidth });
        doc.moveDown(4.8);
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(`FACTURA ${letraComprobante}`, { align: "center" });

      doc
        .font("Helvetica")
        .fontSize(9)
        .text(
          `NRO: ${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(
            8,
            "0"
          )}`,
          { align: "center" }
        )
        .text(`${formatDateAR(fechaEmision)} ${formatTimeAR(fechaEmision)}`, {
          align: "center",
        })
        .moveDown(0.8);

      doc.fontSize(9).text(razonSocial, { align: "center" });

      doc
        .fontSize(8)
        .text(direccion, { align: "center" })
        .text(`CUIT: ${cuit}`, { align: "center" })
        .text(condicionIVAEmisor, { align: "center" })
        .moveDown(0.8);

      const yCliente = doc.y;
      doc.rect(5, yCliente, 216, 70).stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(clienteLabel, 0, yCliente + 6, {
          align: "center",
          width: PAGE_WIDTH,
        });

      doc
        .font("Helvetica")
        .fontSize(8)
        .text(nombreCliente || "-", {
          align: "center",
          width: PAGE_WIDTH,
        });

      if (documentoCliente) {
        doc.text(`DOC: ${documentoCliente}`, {
          align: "center",
          width: PAGE_WIDTH,
        });
      }

      if (telefonoCliente) {
        doc.text(`TEL: ${telefonoCliente}`, {
          align: "center",
          width: PAGE_WIDTH,
        });
      }

      if (domicilioCliente) {
        doc.text(domicilioCliente, {
          align: "center",
          width: PAGE_WIDTH,
        });
      }

      doc.text(condicionIVAReceptor, {
        align: "center",
        width: PAGE_WIDTH,
      });

      doc.moveDown(1.2);

      doc.font("Helvetica-Bold").fontSize(10).text("DETALLE", {
        align: "center",
      });
      doc.moveDown(0.5);

      if (products && products.length > 0) {
        doc.font("Helvetica").fontSize(8);

        const tableWidth = 195;
        const tableLeft = (PAGE_WIDTH - tableWidth) / 2;
        const tableTop = doc.y;

        products.forEach((prod, index) => {
          const quantityForImporte =
            prod.quantityKg !== null && prod.quantityKg !== undefined
              ? Number(prod.quantityKg)
              : Number(prod.quantity);

          const importe =
            prod.subtotal !== undefined && prod.subtotal !== null
              ? Number(prod.subtotal)
              : quantityForImporte * Number(prod.price);

          const tableRowTop = tableTop + index * 10;

          doc.text(`${quantityForImporte}`, tableLeft, tableRowTop, {
            width: 25,
            align: "left",
          });

          doc.text(
            prod.name.length > 18 ? `${prod.name.slice(0, 18)}…` : prod.name,
            tableLeft + 25,
            tableRowTop,
            {
              width: 100,
              align: "left",
            }
          );

          doc.text(formatCurrency(importe), tableLeft + 125, tableRowTop, {
            width: 60,
            align: "right",
          });
        });

        doc.y = tableTop + products.length * 10 + 10;
      } else {
        doc.fontSize(8).text("(sin productos)", { align: "center" });
      }

      doc.moveDown(1);

      const yTotal = doc.y;
      doc.rect(5, yTotal, 216, 25).stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(`TOTAL ${formatCurrency(total)}`, 0, yTotal + 6, {
          align: "center",
          width: PAGE_WIDTH,
        });

      doc.y = yTotal + 35;

      const yDatos = doc.y;
      doc.rect(5, yDatos, 216, 70).stroke();

      doc.font("Helvetica").fontSize(8);
      doc.text(`FORMA DE PAGO: ${metodoPago}`, 0, yDatos + 5, {
        align: "center",
        width: PAGE_WIDTH,
      });
      doc.text("FACTURA ELECTRÓNICA AUTORIZADA", {
        align: "center",
        width: PAGE_WIDTH,
      });
      doc.text(`CAE: ${cae}`, { align: "center", width: PAGE_WIDTH });
      doc.text(`FV: ${formatCaeDate(caeVto)}`, {
        align: "center",
        width: PAGE_WIDTH,
      });
      doc.text("CÓDIGO QR ARCA R.G. 4892/2020", {
        align: "center",
        width: PAGE_WIDTH,
      });

      doc.y = yDatos + 85;

      if (qrBase64) {
        const qrPath = path.join(basePath, `qr-${numero}.png`);
        const base64Data = qrBase64.replace(/^data:image\/png;base64,/, "");

        fs.writeFileSync(qrPath, base64Data, "base64");

        const xQR = (PAGE_WIDTH - 110) / 2;
        const yQR = doc.y;

        doc.rect(5, yQR - 3, 216, 125).stroke();
        doc.image(qrPath, xQR, yQR + 5, { width: 110 });

        fs.unlinkSync(qrPath);
        doc.y = yQR + 135;
      } else {
        doc
          .font("Helvetica")
          .fontSize(7)
          .text("QR no disponible en PDF", {
            align: "center",
            width: PAGE_WIDTH,
          });

        doc.moveDown(1);
      }

      const yPie = doc.y;
      doc.rect(5, yPie, 216, 60).stroke();

      doc
        .fontSize(7)
        .text("PARA ACCEDER A ESTE COMPROBANTE", 0, yPie + 5, {
          align: "center",
          width: PAGE_WIDTH,
        })
        .text("comprobante.afip.gob.ar", {
          align: "center",
          width: PAGE_WIDTH,
        })
        .moveDown(0.5)
        .text(
          "Este comprobante fue emitido conforme a las disposiciones de AFIP. Gracias por su compra.",
          {
            align: "center",
            width: 216,
            indent: 5,
          }
        );

      doc
        .moveDown(0.8)
        .fontSize(6.5)
        .fillColor("#888888")
        .text(COMARPOS_FOOTER_TEXT_SHORT, { align: "center", width: PAGE_WIDTH });

      doc.end();

      stream.on("finish", async () => {
        try {
          console.log("🧾 PDF generado correctamente:", filePath);

          const pdfUrl = await uploadPDFtoCloudinary(filePath);

          await prisma.sale.update({
            where: { id: saleId },
            data: { pdfUrl },
          });

          console.log("✅ Factura subida y asociada correctamente");

          const ticketPayload = buildTicketPayload({
            tipoComprobante,
            puntoVenta,
            numero,
            fechaEmision,
            nombreCliente,
            total,
            metodoPago,
            cae,
            caeVto,
            products,
            cuit,
            razonSocial,
            direccion,
            telefonoNegocio,
            documentoCliente,
            telefonoCliente,
            qrUrl,
          });

          await enviarTicketAlPOSLocal(ticketPayload);

          resolve();
        } catch (err: any) {
          console.error("⚠️ Error al procesar factura:", err.message);
          reject(err);
        } finally {
          if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log("🧹 Archivo temporal eliminado:", filePath);
          }
        }
      });

      stream.on("error", (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}
