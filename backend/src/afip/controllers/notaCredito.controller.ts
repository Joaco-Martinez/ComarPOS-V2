/**
 * Handler de emision de nota de credito AFIP.
 * Extraido de afip.controller.ts (doc seccion 4.3 - modularizacion).
 */
import { Request, Response } from "express";
import { emitirNotaCreditoAFIP } from "../wsfe.service";
import { generarNotaCreditoAfipPDF } from "../utils/generarNotaCreditoAfipPDF";
import { financeService } from "../../services/finance.service";
import prisma from "../../prisma";
import { tenantScope } from "../../utils/tenantScope";
import { arcaConfigService } from "../../services/arcaConfig.service";

export async function notaCreditoController(req: Request, res: Response) {
  try {
    const {
      saleId,
      facturaOriginalId,
      motivo = "Devolución de productos",
      importe,
    } = req.body;

    const userId = (req as any).user?.id || "unknown";

    const facturaOriginal = await prisma.invoiceAfip.findFirst({
      where: { id: facturaOriginalId, ...tenantScope() },
      include: {
        sale: {
          include: {
            items: { include: { product: true } },
            client: true,
          },
        },
      },
    });

    if (!facturaOriginal) {
      return res.status(404).json({
        ok: false,
        error: "Factura original no encontrada",
      });
    }

    const notaCredito = await emitirNotaCreditoAFIP({
      saleId,
      facturaOriginalId,
      motivo,
      importe,
    });

    const safeNotaCredito = JSON.parse(
      JSON.stringify(notaCredito, (_, v) =>
        typeof v === "bigint" ? v.toString() : v
      )
    );

    let posDisconnected = false;
    let posErrorMessage: string | null = null;

    const arcaConfig = await arcaConfigService.getConfig().catch(() => null);

    try {
      await generarNotaCreditoAfipPDF({
        saleId,
        tipoComprobante: notaCredito.tipoComprobante,
        puntoVenta: notaCredito.puntoVenta,
        numero: notaCredito.numero,
        fechaEmision: notaCredito.fechaEmision,
        nombreCliente: facturaOriginal.sale?.client
          ? `${facturaOriginal.sale.client.nombre} ${facturaOriginal.sale.client.apellido}`
          : "A CONSUMIDOR FINAL ***********",
        domicilioCliente: "",
        total: notaCredito.total,
        metodoPago: facturaOriginal.sale?.paymentMethod || "EFECTIVO",
        cae: notaCredito.cae || "—",
        caeVto: notaCredito.caeVto || new Date(),
        cuit: notaCredito.cuit,
        razonSocial: arcaConfig?.businessName || undefined,
        direccion: arcaConfig?.fiscalAddress || undefined,
        qrBase64: notaCredito.qrBase64 || null,
        products: facturaOriginal.sale?.items.map((i: any) => ({
          name: i.product.name,
          quantity: i.quantity,
          quantityKg: i.quantityKg ?? undefined,
          price: i.price,
          subtotal: i.subtotal,
        })),
      });
    } catch (printErr: any) {
      posDisconnected = true;

      const status = printErr?.response?.status;
      const ngrokCode = printErr?.response?.headers?.["ngrok-error-code"];
      const url = printErr?.config?.url;

      posErrorMessage =
        ngrokCode === "ERR_NGROK_3200" || status === 404
          ? `AFIP aprobó y se generó la nota de crédito, pero el POS está desconectado. Endpoint: ${
              url ?? "desconocido"
            }`
          : `AFIP aprobó y se generó la nota de crédito, pero falló la impresión en el POS. ${
              printErr?.message ?? ""
            }`;

      console.warn("⚠️", posErrorMessage);
    }

    await financeService.registerCreditNote(
      importe,
      `Nota de crédito: ${motivo}`,
      userId
    );

    return res.status(200).json({
      ok: true,
      message: posDisconnected
        ? "Nota de crédito generada en AFIP y registrada en finanzas, pero el POS está desconectado."
        : "Nota de crédito generada en AFIP, impresa y registrada en finanzas.",
      notaCredito: safeNotaCredito,
      ...(posDisconnected
        ? {
            warning: "AFIP aprobó, pero no se pudo imprimir la nota de crédito.",
            posError: posErrorMessage,
          }
        : {}),
    });
  } catch (err: any) {
    console.error("❌ Error en /afip/nota-credito:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
