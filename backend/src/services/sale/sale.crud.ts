/**
 * Lectura y listado de ventas (paginado, filtros, stats) + accion masiva sobre pendientes.
 * Extraido de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { SaleStatus } from "@prisma/client";
import { GetSalesParams } from "./sale.types";
import {
  normalizePositiveInt,
  buildSaleInclude,
  buildSalesWhere,
  buildSalesStats,
} from "./sale.query";
import { updateStatus } from "./sale.lifecycle";
import { tenantScope } from "../../utils/tenantScope";

export async function getAll(params: GetSalesParams = {}) {
  const page = normalizePositiveInt(params.page);
  const limit = normalizePositiveInt(params.limit);
  const where = buildSalesWhere(params);

  const mapSale = (sale: any) => ({
    ...sale,
    hasCreditNote: Boolean(sale.invoiceAfip?.creditNotes?.length),
  });

  // Compatibilidad: si no viene page/limit, devuelve todo como antes.
  if (!page || !limit) {
    const sales = await prisma.sale.findMany({
      where,
      include: buildSaleInclude(),
      orderBy: {
        createdAt: "desc",
      },
    });

    return sales.map(mapSale);
  }

  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;

  const [items, totalItems, stats] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: buildSaleInclude(),
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: safeLimit,
    }),
    prisma.sale.count({ where }),
    buildSalesStats(params),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / safeLimit));

  return {
    items: items.map(mapSale),
    meta: {
      page,
      limit: safeLimit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    stats,
  };
}

export async function getPending() {
  return prisma.sale.findMany({
    where: {
      status: SaleStatus.PENDING,
      ...tenantScope(),
    },
    include: {
      payments: true,
      businessLocation: true,
      items: {
        include: {
          product: {
            include: {
              category: true,
            },
          },
          boxContents: {
            include: {
              product: true,
            },
          },
        },
      },
      user: { select: { id: true, name: true, email: true, role: true } },
      client: true,
      priceList: true,
      discounts: { orderBy: { order: "asc" } },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getById(id: string) {
  return prisma.sale.findFirst({
    where: {
      id,
      ...tenantScope(),
    },
    include: buildSaleInclude(),
  });
}

export async function bulkUpdatePending(action: "COMPLETED" | "CANCELLED") {
  const pendingSales = await prisma.sale.findMany({
    where: {
      status: SaleStatus.PENDING,
      ...tenantScope(),
    },
    select: {
      id: true,
    },
  });

  const updatedSales = [];

  for (const sale of pendingSales) {
    const updated = await updateStatus(sale.id, action as SaleStatus);
    updatedSales.push(updated);
  }

  return updatedSales;
}
