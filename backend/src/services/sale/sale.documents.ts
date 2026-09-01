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
import { currentTenantId } from "../../context/tenantContext";

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

  const tenantId = currentTenantId();
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, ticketBusinessName: true, ticketAddress: true, ticketCuit: true },
      })
    : null;

  await generarTicketPedidoPDF({
    saleId: sale.id,
    products,
    total: sale.total,
    metodoPago,
    nombreCliente: sale.client
      ? `${sale.client.nombre} ${sale.client.apellido}`
      : "A CONSUMIDOR FINAL",
    razonSocial: tenant?.ticketBusinessName || tenant?.name || undefined,
    direccion: tenant?.ticketAddress || undefined,
    cuit: tenant?.ticketCuit || undefined,
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
      user: { select: { id: true, name: true, email: true, role: true } },
      client: true,
      discounts: { orderBy: { order: "asc" } },
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
        user: { select: { id: true, name: true, email: true, role: true } },
        client: true,
        discounts: { orderBy: { order: "asc" } },
      },
    });
  }

  const tenant = sale.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: sale.tenantId },
        select: {
          logoUrl: true,
          name: true,
          ticketBusinessName: true,
          ticketCuit: true,
          ticketAddress: true,
          ticketPhone: true,
          ticketEmail: true,
        },
      })
    : null;

  // Datos fiscales reales del negocio (CUIT, condicion IVA, ingresos
  // brutos, domicilio fiscal) - vive en ArcaConfig, no en Tenant (que solo
  // tiene los campos "ticket*" para imprimir tickets). Si el tenant no
  // configuro ARCA/AFIP todavia, esto queda null y se usan los campos
  // "ticket*" como fallback (mismo criterio que ya usaba este archivo).
  const arcaConfig = sale.tenantId
    ? await prisma.arcaConfig.findFirst({
        where: { tenantId: sale.tenantId },
        select: { businessName: true, cuit: true, ivaCondition: true, fiscalAddress: true, iibb: true },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const pdfBuffer = await generarCotizacionPDF({
    ...sale,
    logoUrl: tenant?.logoUrl ?? null,
    businessName: arcaConfig?.businessName || tenant?.ticketBusinessName || tenant?.name || null,
    businessCuit: arcaConfig?.cuit || tenant?.ticketCuit || null,
    businessAddress: arcaConfig?.fiscalAddress || tenant?.ticketAddress || null,
    businessIvaCondition: arcaConfig?.ivaCondition ?? null,
    businessIibb: arcaConfig?.iibb ?? null,
    businessPhone: tenant?.ticketPhone ?? null,
    businessEmail: tenant?.ticketEmail ?? null,
  });

  return {
    filename: `cotizacion-${sale.id}.pdf`,
    buffer: pdfBuffer,
  };
}
