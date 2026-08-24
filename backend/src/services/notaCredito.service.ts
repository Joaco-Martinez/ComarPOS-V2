/**
 * Orquesta la emision de una Nota de Credito para una venta ya facturada,
 * desde el Historial de Ventas. emitirNotaCreditoAFIP (ver
 * afip/wsfe/wsfe.notaCredito.ts) es codigo WSFE legacy que espera un
 * saleId PROPIO para la nota de credito (InvoiceAfip.saleId es @unique, y
 * la venta original ya tiene su propia InvoiceAfip de la factura) -- este
 * service arma esa venta "espejo" (mismos items/cliente, sin tocar stock:
 * la reversion de stock es responsabilidad de Devoluciones, algo aparte)
 * antes de llamar al emisor real.
 */
import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { emitirNotaCreditoAFIP } from "../afip/wsfe.service";
import { AppError } from "../utils/asyncHandler";

export const notaCreditoService = {
  async generarParaVenta(saleId: string, opts?: { motivo?: string; importe?: number }) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, ...tenantScope() },
      include: {
        invoiceAfip: { include: { creditNotes: true } },
        items: true,
      },
    });

    if (!sale) throw new AppError("SALE_NOT_FOUND", "Venta no encontrada", 404);

    if (!sale.invoiceAfip?.cae) {
      throw new AppError(
        "SALE_NOT_INVOICED",
        "Esta venta no tiene una factura AFIP aprobada -- no se le puede hacer una nota de crédito.",
        400
      );
    }

    const yaTieneNC = sale.invoiceAfip.creditNotes.some((nc) => nc.resultado === "A" && nc.cae);
    if (yaTieneNC) {
      throw new AppError("ALREADY_CREDITED", "Esta venta ya tiene una nota de crédito aprobada.", 400);
    }

    const importe = opts?.importe && opts.importe > 0 ? opts.importe : sale.total;
    const motivo = opts?.motivo?.trim() || "Devolución de productos";

    // Venta espejo: solo para que la NC tenga su propio comprobante y
    // muestre los mismos items en el PDF/impresion -- no genera movimiento
    // de stock ni de cuenta corriente (eso es lo que hace Devoluciones).
    const ncSale = await prisma.sale.create({
      data: {
        tenantId: currentTenantId(),
        clientId: sale.clientId,
        userId: sale.userId,
        paymentMethod: sale.paymentMethod,
        receiptType: sale.receiptType,
        businessLocationId: sale.businessLocationId,
        status: "COMPLETED",
        subtotal: importe,
        total: importe,
        returnReason: motivo,
        items: {
          create: sale.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            quantityKg: item.quantityKg,
            price: item.price,
            subtotal: item.subtotal,
            ivaRate: item.ivaRate,
            productNameSnapshot: item.productNameSnapshot,
            productSkuSnapshot: item.productSkuSnapshot,
          })),
        },
      },
    });

    const notaCredito = await emitirNotaCreditoAFIP({
      saleId: ncSale.id,
      facturaOriginalId: sale.invoiceAfip.id,
      motivo,
      importe,
    });

    return { notaCredito, ncSaleId: ncSale.id };
  },
};
