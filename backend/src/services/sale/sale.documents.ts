/**
 * Generacion de PDFs no fiscales asociados a una venta (nota de pedido, cotizacion).
 * Extraido de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { SaleStatus, SaleUnit } from "@prisma/client";
import { generarTicketPedidoPDF } from "../../utils/generarReciboPDF";
import { generarCotizacionPDF } from "../../utils/generarCotizacionPDF";
import { DEFAULT_QUOTATION_HOURS } from "./sale.types";
import { addHours } from "./sale.query";
import { tenantScope } from "../../utils/tenantScope";

export async function generarNotaPedido(saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      ...tenantScope(),
    },
    include: {
      payments: true,
      businessLocation: true,
      items: {
        include: {
          product: true,
          boxContents: {
            include: {
              product: true,
            },
          },
        },
      },
      client: true,
    },
  });

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  const products = sale.items.map((item) => {
    const saleUnit = item.product?.saleUnit as SaleUnit;
    const qty = saleUnit === SaleUnit.KG ? item.quantityKg ?? 0 : item.quantity;

    return {
      name:
        (item as any).productNameSnapshot ??
        item.product?.name ??
        "Producto",
      quantity: qty,
      price: item.price,
    };
  });

  const metodoPago = sale.payments?.length ? "MIXTO" : sale.paymentMethod;

  await generarTicketPedidoPDF({
    saleId: sale.id,
    products,
    total: sale.total,
    metodoPago,
    nombreCliente: sale.client
      ? `${sale.client.nombre} ${sale.client.apellido}`
      : "A CONSUMIDOR FINAL",
  });

  return {
    ok: true,
  };
}

export async function generarCotizacion(saleId: string) {
  let sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      ...tenantScope(),
    },
    include: {
      payments: true,
      businessLocation: true,
      items: {
        include: {
          product: true,
          boxContents: {
            include: {
              product: true,
            },
          },
        },
      },
      user: true,
      client: true,
    },
  });

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  if (sale.status !== SaleStatus.PENDING) {
    throw new Error("Solo se puede descargar cotización de una venta pendiente");
  }

  if (!sale.quotationExpiresAt) {
    sale = await prisma.sale.update({
      where: {
        id: sale.id,
      },
      data: {
        quotationExpiresAt: addHours(new Date(), DEFAULT_QUOTATION_HOURS),
      },
      include: {
        payments: true,
        businessLocation: true,
        items: {
          include: {
            product: true,
            boxContents: {
              include: {
                product: true,
              },
            },
          },
        },
        user: true,
        client: true,
      },
    });
  }

  const tenant = sale.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: sale.tenantId },
        select: { logoUrl: true },
      })
    : null;

  const pdfBuffer = await generarCotizacionPDF({ ...sale, logoUrl: tenant?.logoUrl ?? null });

  return {
    filename: `cotizacion-${sale.id}.pdf`,
    buffer: pdfBuffer,
  };
}
