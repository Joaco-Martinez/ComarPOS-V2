/**
 * Handler de consulta de factura AFIP por venta.
 * Extraido de afip.controller.ts (doc seccion 4.3 - modularizacion).
 */
import { Request, Response } from "express";
import prisma from "../../prisma";
import { tenantScope } from "../../utils/tenantScope";

export async function facturaBySaleController(req: Request, res: Response) {
  try {
    const { saleId } = req.params;

    const factura = await prisma.invoiceAfip.findFirst({
      where: { saleId: String(saleId), ...tenantScope() },
    });

    if (!factura) {
      return res.status(404).json({ ok: false, error: "Factura no encontrada" });
    }

    const safeFactura = JSON.parse(
      JSON.stringify(factura, (_, v) => (typeof v === "bigint" ? v.toString() : v))
    );

    res.status(200).json(safeFactura);
  } catch (err: any) {
    console.error("❌ Error en /factura-by-sale:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
