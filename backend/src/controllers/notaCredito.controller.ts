import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { getParamAsString } from "../utils/params";
import { notaCreditoService } from "../services/notaCredito.service";

export const notaCreditoController = {
  generar: asyncHandler(async (req: Request, res: Response) => {
    const saleId = getParamAsString(req.params.saleId, "saleId");
    const { motivo, importe } = (req.body ?? {}) as { motivo?: string; importe?: number };

    const { notaCredito, ncSaleId } = await notaCreditoService.generarParaVenta(saleId, {
      motivo,
      importe: importe !== undefined ? Number(importe) : undefined,
    });

    const aprobada = notaCredito.resultado === "A" && Boolean(notaCredito.cae);

    res.status(aprobada ? 200 : 422).json({
      ok: aprobada,
      message: aprobada
        ? "Nota de crédito aprobada por AFIP."
        : "AFIP no aprobó la nota de crédito.",
      content: {
        id: notaCredito.id,
        ncSaleId,
        resultado: notaCredito.resultado,
        cae: notaCredito.cae,
        numero: notaCredito.numero,
        puntoVenta: notaCredito.puntoVenta,
        tipoComprobante: notaCredito.tipoComprobante,
        total: notaCredito.total,
      },
    });
  }),
};
