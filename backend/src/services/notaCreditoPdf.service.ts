import prisma from "../prisma";
import fs from "fs";
import path from "path";
import {
  generarFacturaPDF,
  FacturaPDFData,
  TipoCliente,
} from "./facturaPdfGenerator.service";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { arcaConfigService } from "./arcaConfig.service";

function isNotaCreditoTipo(tipoComprobante?: number | null) {
  return [3, 8, 13].includes(Number(tipoComprobante));
}

function isNotaCreditoAprobada(invoice: any) {
  return Boolean(
    invoice &&
      isNotaCreditoTipo(invoice.tipoComprobante) &&
      invoice.resultado === "A" &&
      invoice.cae
  );
}

export async function regenerarNotaCreditoPDFService(
  saleId: string,
  uploadToCloudinary = false
) {
  /**
   * Caso A:
   * El saleId recibido pertenece directamente a una venta que ya es nota de crédito.
   */
  const saleDirecta = await prisma.sale.findFirst({
    where: { id: saleId, ...tenantScope() },
    include: {
      client: true,
      invoiceAfip: {
        include: {
          relatedInvoice: true,
        },
      },
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  let sale: any = saleDirecta;
  let notaCredito: any = saleDirecta?.invoiceAfip ?? null;

  const notaDirectaValida = isNotaCreditoAprobada(notaCredito);

  /**
   * Caso B:
   * El saleId recibido pertenece a la venta/factura original.
   * Entonces buscamos su factura y luego buscamos una nota de crédito aprobada
   * vinculada a esa factura por relatedInvoiceId.
   */
  if (!notaDirectaValida) {
    const facturaOriginal = await prisma.invoiceAfip.findFirst({
      where: { saleId, ...tenantScope() },
      include: {
        sale: {
          include: {
            client: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!facturaOriginal) {
      throw new Error("Factura original no encontrada para buscar la nota de crédito");
    }

    const notaRelacionada = await prisma.invoiceAfip.findFirst({
      where: {
        relatedInvoiceId: facturaOriginal.id,
        tipoComprobante: {
          in: [3, 8, 13],
        },
        resultado: "A",
        cae: {
          not: null,
        },
        ...tenantScope(),
      },
      include: {
        relatedInvoice: true,
        sale: {
          include: {
            client: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!notaRelacionada) {
      throw new Error("Nota de crédito aprobada no encontrada");
    }

    notaCredito = notaRelacionada;

    /**
     * Para datos de cliente/productos:
     * - usamos la venta de la NC si existe
     * - si no, usamos la venta original
     */
    sale = notaRelacionada.sale ?? facturaOriginal.sale;
  }

  if (!sale) {
    throw new Error("Venta asociada a la nota de crédito no encontrada");
  }

  if (!notaCredito) {
    throw new Error("Nota de crédito no encontrada");
  }

  const esNotaCredito =
    isNotaCreditoTipo(notaCredito.tipoComprobante) ||
    Boolean(notaCredito.relatedInvoiceId);

  if (!esNotaCredito) {
    throw new Error("El comprobante encontrado no es una nota de crédito");
  }

  if (notaCredito.resultado !== "A" || !notaCredito.cae) {
    throw new Error("La nota de crédito no está aprobada por AFIP");
  }

  const [arcaConfig, tenant] = await Promise.all([
    arcaConfigService.getConfig().catch(() => null),
    currentTenantId()
      ? prisma.tenant.findUnique({
          where: { id: currentTenantId()! },
          select: { name: true, ticketPhone: true, ticketAddress: true },
        })
      : null,
  ]);

  const pdfData: FacturaPDFData = {
    factura: {
      cuit: notaCredito.cuit,
      puntoVenta: notaCredito.puntoVenta,
      tipoComprobante: notaCredito.tipoComprobante,
      tipoDoc: notaCredito.tipoDoc,
      nroDoc: Number(notaCredito.nroDoc),
      numero: notaCredito.numero,
      fechaEmision: new Date(notaCredito.fechaEmision),
      resultado: notaCredito.resultado,
      cae: notaCredito.cae || "",
      caeVto: notaCredito.caeVto ? new Date(notaCredito.caeVto) : new Date(),
      total: Number(notaCredito.total),
      neto: Number(notaCredito.neto),
      iva: Number(notaCredito.iva),
      condicionIVAReceptor: notaCredito.condicionIVAReceptor,
      moneda: notaCredito.moneda,
      urlQR: notaCredito.urlQR || undefined,
      saleId: sale.id,
    },

    empresa: {
      name: arcaConfig?.businessName || tenant?.name || process.env.BUSINESS_NAME || "Mi Negocio",
      subtitle: process.env.BUSINESS_SUBTITLE || "ComarPOS",
      cuit: notaCredito.cuit || arcaConfig?.cuit || process.env.BUSINESS_CUIT || "",
      address:
        arcaConfig?.fiscalAddress ||
        tenant?.ticketAddress ||
        process.env.BUSINESS_ADDRESS ||
        "",
      phone: tenant?.ticketPhone || process.env.BUSINESS_PHONE || "",
      ivaCondition: arcaConfig?.ivaCondition || process.env.BUSINESS_IVA_CONDITION || undefined,
    },

    cliente: {
      nombre: sale.client?.nombre || "Consumidor Final",
      apellido: sale.client?.apellido || "",
      dni: sale.client?.dni || "",
      telefono: sale.client?.telefono || "",
      gmail: sale.client?.gmail || sale.gmailSend || "",
      category:
        (sale.client?.category as TipoCliente | undefined) || "Consumidor Final",
    },

    products: sale.items.map((item: any) => {
      const quantity = Number(item.quantity || 0);

      const quantityKg =
        item.quantityKg !== null && item.quantityKg !== undefined
          ? Number(item.quantityKg)
          : undefined;

      const price = Number(item.price || 0);

      const subtotal =
        item.subtotal !== null && item.subtotal !== undefined
          ? Number(item.subtotal)
          : quantityKg !== undefined && quantityKg > 0
          ? quantityKg * price
          : quantity * price;

      return {
        name: item.product?.name || item.productNameSnapshot || "Producto",
        quantity,
        quantityKg,
        price,
        subtotal,
      };
    }),

  };

  const result = await generarFacturaPDF(pdfData, uploadToCloudinary);

  if ("cloudinaryUrl" in result && result.cloudinaryUrl) {
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        pdfUrl: result.cloudinaryUrl,
      },
    });
  }

  return result;
}

export async function obtenerNotaCreditoPDFPathService(saleId: string) {
  const result = await regenerarNotaCreditoPDFService(saleId, false);

  if (!result.filePath || !fs.existsSync(result.filePath)) {
    throw new Error("No se pudo generar el archivo PDF de la nota de crédito");
  }

  return {
    filePath: result.filePath,
    fileName: path.basename(result.filePath),
  };
}