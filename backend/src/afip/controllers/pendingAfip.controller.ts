/**
 * Handler de consulta de ventas pendientes de facturar en AFIP.
 * Extraido de afip.controller.ts (doc seccion 4.3 - modularizacion).
 */
import { Request, Response } from "express";
import prisma from "../../prisma";
import { tenantScope } from "../../utils/tenantScope";

export async function pendingAfipController(_req: Request, res: Response) {
  try {
    const pendingSales = await prisma.sale.findMany({
      where: {
        invoiceStatus: "PENDING_AFIP",
        isInvoiced: false,
        ...tenantScope(),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      include: {
        client: true,
        items: {
          include: {
            product: true,
          },
        },
        payments: true,
      },
    });

    const count = pendingSales.length;

    return res.status(200).json({
      ok: true,
      hasPendingAfip: count > 0,
      count,
      message:
        count > 0
          ? `Hay ${count} venta${count === 1 ? "" : "s"} pendiente${count === 1 ? "" : "s"} de facturar en AFIP.`
          : "No hay ventas pendientes de AFIP.",
      sales: pendingSales.map((sale: any) => ({
        id: sale.id,
        total: sale.total,
        subtotal: sale.subtotal,
        discount: sale.discount,
        status: sale.status,
        isInvoiced: sale.isInvoiced,
        invoiceStatus: sale.invoiceStatus,
        afipLastError: sale.afipLastError,
        nextRetryAt: sale.nextRetryAt,
        retryCount: sale.retryCount,
        createdAt: sale.createdAt,
        client: sale.client
          ? {
              id: sale.client.id,
              nombre: sale.client.nombre,
              apellido: sale.client.apellido,
              dni: sale.client.dni,
              telefono: sale.client.telefono,
              gmail: sale.client.gmail,
              category: sale.client.category,
            }
          : null,
        items: sale.items.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product?.name ?? "Producto",
          sku: item.product?.sku ?? null,
          quantity: item.quantity,
          quantityKg: item.quantityKg,
          price: item.price,
          subtotal: item.subtotal,
        })),
        payments: sale.payments.map((payment: any) => ({
          id: payment.id,
          method: payment.method,
          amount: payment.amount,
        })),
      })),
    });
  } catch (err: any) {
    console.error("❌ Error en GET /afip/pending-afip:", err);

    return res.status(500).json({
      ok: false,
      error: err?.message ?? "Error al buscar ventas pendientes de AFIP",
    });
  }
}
