/**
 * Handler de emision de factura AFIP.
 * La logica (que se factura, validaciones, lock y emision) vive en
 * afip/facturacion.service.ts -- compartida con el reintento automatico.
 * Aca solo se arma la respuesta HTTP, la impresion y el pase a PENDING_AFIP.
 */
import { Request, Response } from "express";
import { isAfipUnavailable } from "../utils/isAfipUnavailable";
import prisma from "../../prisma";
import { facturarVenta, generarPdfFacturaVenta, FacturacionError } from "../facturacion.service";

export async function facturarController(req: Request, res: Response) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const { saleId, arcaConfigId, tipoComprobante, condicionIVAReceptor } = req.body ?? {};
  // El frontend historico manda "receiverDoc"; tambien se acepta "nroDoc".
  const nroDoc = req.body?.nroDoc !== undefined ? req.body.nroDoc : req.body?.receiverDoc;

  console.log(`🟦 [${requestId}] POST /afip/facturar`, { saleId, tipoComprobante, arcaConfigId: arcaConfigId ?? null });

  try {
    const { factura, sale, arcaConfig, nroDoc: docUsado } = await facturarVenta({
      saleId,
      tipoComprobante,
      nroDoc,
      condicionIVAReceptor,
      arcaConfigId,
    });

    const safeFactura = JSON.parse(
      JSON.stringify(factura, (_, v) => (typeof v === "bigint" ? v.toString() : v))
    );

    if (factura.resultado === "A" && factura.cae) {
      let posErrorMessage: string | null = null;

      try {
        await generarPdfFacturaVenta(factura, sale, arcaConfig, docUsado);
      } catch (printErr: any) {
        const status = printErr?.response?.status;
        const ngrokCode = printErr?.response?.headers?.["ngrok-error-code"];
        const url = printErr?.config?.url;

        posErrorMessage =
          ngrokCode === "ERR_NGROK_3200" || status === 404
            ? `AFIP aprobó y se facturó, pero el POS está desconectado. Endpoint: ${url ?? "desconocido"}`
            : `AFIP aprobó y se facturó, pero falló la impresión en el POS. ${printErr?.message ?? ""}`;

        console.warn(`⚠️ [${requestId}]`, posErrorMessage);
      }

      await prisma.sale.update({
        where: { id: saleId },
        data: {
          invoiceStatus: "INVOICED",
          afipLastError: posErrorMessage ? "POS_DISCONNECTED" : null,
          nextRetryAt: null,
          retryCount: 0,
        },
      });

      console.log(`🟩 [${requestId}] Factura aprobada en ${Date.now() - startedAt}ms`, {
        tipoComprobante: factura.tipoComprobante,
        puntoVenta: factura.puntoVenta,
        numero: factura.numero,
      });

      return res.status(200).json({
        ok: true,
        invoiceStatus: "INVOICED",
        factura: safeFactura,
        ...(posErrorMessage
          ? { warning: "AFIP aprobó y se facturó, pero el POS está desconectado.", posError: posErrorMessage }
          : {}),
      });
    }

    // emitirFacturaAFIPBase ya dejo la venta en ERROR con los mensajes de AFIP.
    console.warn(`🟥 [${requestId}] AFIP rechazó la factura`, { saleId, resultado: factura.resultado });

    return res.status(409).json({
      ok: false,
      invoiceStatus: "REJECTED",
      message: "AFIP rechazó la factura.",
      factura: safeFactura,
    });
  } catch (err: any) {
    if (err instanceof FacturacionError) {
      return res.status(err.status).json({ ok: false, error: err.message, message: err.message, code: err.code });
    }

    console.error(`❌ [${requestId}] Error en /afip/facturar:`, err?.message, err?.code ?? "");

    if (isAfipUnavailable(err)) {
      const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000);

      try {
        await prisma.sale.update({
          where: { id: saleId },
          data: {
            invoiceStatus: "PENDING_AFIP",
            afipLastError: "AFIP_UNAVAILABLE",
            nextRetryAt,
            retryCount: { increment: 1 },
          },
        });
      } catch (updateErr: any) {
        console.error(`❌ [${requestId}] No se pudo marcar PENDING_AFIP:`, updateErr?.message);
      }

      return res.status(202).json({
        ok: true,
        invoiceStatus: "PENDING_AFIP",
        nextRetryAt: nextRetryAt.toISOString(),
      });
    }

    return res.status(500).json({
      ok: false,
      error: err?.message || "Error interno al facturar",
      message: err?.message || "Error interno al facturar",
      code: err?.code ?? null,
    });
  }
}
