/**
 * Transiciones de estado de la venta (confirmar/cancelar) y expiracion de cotizaciones.
 * Extraido de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { ProductType, SaleStatus, SaleItemPriceType, SaleUnit } from "@prisma/client";
import { financeService } from "../finance.service";
import { productStatsService } from "../productStats.service";
import { ResolvedSaleItem, StockLine } from "./sale.types";
import { buildStockLines, requireStockLocationId, restoreStockLines, queueStockAlerts } from "./sale.stock";
import { reverseAccountDebtFromSale } from "./sale.payment";
import { tenantScope } from "../../utils/tenantScope";
import { runWithTenant } from "../../context/tenantContext";
import { loyaltyService } from "../loyalty.service";
import { auditLogService } from "../auditLog.service";

export async function updateStatus(id: string, status: SaleStatus) {
  const sale = await prisma.sale.findFirst({
    where: {
      id,
      ...tenantScope(),
    },
    include: {
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
    },
  });

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  if (sale.status === status) {
    return prisma.sale.findUnique({
      where: {
        id,
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
      },
    });
  }

  if (sale.status === SaleStatus.CANCELLED && status !== SaleStatus.CANCELLED) {
    throw new Error("No se puede cambiar el estado de una venta cancelada");
  }

  const restoredStockLines: StockLine[] = [];
  const pendingAlerts: string[] = [];
  let stockLocationId: string | null = null;

  if (status === SaleStatus.CANCELLED) {
    stockLocationId = await requireStockLocationId(sale.stockLocationId);

    const resolvedItems: ResolvedSaleItem[] = sale.items.map((item) => ({
      productId: item.productId,
      productName: item.product?.name ?? "Producto",
      productSku: item.product?.sku ?? null,
      productType: item.product?.type as ProductType,
      saleUnit: item.product?.saleUnit as SaleUnit,
      isService: Boolean((item.product as any)?.isService),
      unlimitedStock: Boolean((item.product as any)?.unlimitedStock),
      quantity: item.quantity,
      quantityKg: item.quantityKg ?? null,
      price: item.price,
      ivaRate: (item as any).ivaRate ?? item.product?.ivaRate ?? 21,
      priceType: (item as any).priceType ?? SaleItemPriceType.PRICE,
      subtotal: (item as any).subtotal ?? item.price * (item.quantityKg ?? item.quantity),
      purchasePriceSnapshot: (item as any).purchasePriceSnapshot ?? 0,
      costTotal:
        ((item as any).purchasePriceSnapshot ?? 0) *
        (item.quantityKg ?? item.quantity),
      profit: (item as any).profit ?? 0,
      components:
        item.boxContents?.map((box) => ({
          productId: box.productId,
          quantity: box.quantity ?? null,
          quantityKg: (box as any).quantityKg ?? null,
        })) ?? [],
    }));

    restoredStockLines.push(...buildStockLines(resolvedItems));
  }

  const updated = await prisma.$transaction(
    async (tx) => {
      if (status === SaleStatus.CANCELLED) {
        await restoreStockLines(
          tx,
          restoredStockLines,
          sale.userId ?? undefined,
          sale.id,
          stockLocationId as string,
          pendingAlerts
        );

        await reverseAccountDebtFromSale(tx, sale);
      }

      return tx.sale.update({
        where: {
          id,
        },
        data: {
          status,
          ...(status === SaleStatus.CANCELLED
            ? { quotationExpiredAt: sale.quotationExpiredAt ?? new Date() }
            : {}),
          ...(status === SaleStatus.COMPLETED
            ? { quotationExpiredAt: null }
            : {}),
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
        },
      });
    },
    {
      timeout: 20000,
      maxWait: 20000,
    }
  );

  queueStockAlerts(pendingAlerts);

  // Audit log de cambio de estado
  if (sale.userId) {
    void auditLogService
      .log({ userId: sale.userId, action: `STATUS_${status}`, entity: "Sale", entityId: id })
      .catch(() => {});
  }

  if (status === SaleStatus.COMPLETED) {
    await financeService.registerIncomeFromSale(id);

    // Puntos de fidelización para clientes con cuenta
    if (sale.clientId) {
      void loyaltyService
        .earnPoints({ clientId: sale.clientId, saleId: sale.id, totalAmount: sale.total })
        .catch((err) => console.error("loyalty.earnPoints error:", err));
    }

    await productStatsService.createStatsFromSale(
      sale.items
        .filter((item) => !item.product?.isService)
        .map((item) => {
          const saleUnit = item.product?.saleUnit as SaleUnit;

          return {
            productId: item.productId,
            quantity: saleUnit === SaleUnit.KG ? 0 : item.quantity,
            quantityKg: saleUnit === SaleUnit.KG ? item.quantityKg ?? 0 : undefined,
          };
        })
    );
  }

  return updated;
}

export async function expirePendingQuotations(limit = 100) {
  const now = new Date();

  const expiredSales = await prisma.sale.findMany({
    where: {
      status: SaleStatus.PENDING,
      quotationExpiresAt: {
        lte: now,
      },
      quotationExpiredAt: null,
    },
    select: {
      id: true,
      quotationExpiresAt: true,
      tenantId: true,
    },
    take: limit,
    orderBy: {
      quotationExpiresAt: "asc",
    },
  });

  const results = [];

  for (const sale of expiredSales) {
    try {
      // doc seccion 6 - multi-tenant: este job corre fuera de un request
      // (cron), por eso se reestablece el tenant de la venta antes de tocarla.
      const updated = await runWithTenant(sale.tenantId, () =>
        updateStatus(sale.id, SaleStatus.CANCELLED)
      );

      results.push({
        id: sale.id,
        ok: true,
        status: updated?.status ?? SaleStatus.CANCELLED,
      });
    } catch (error: any) {
      results.push({
        id: sale.id,
        ok: false,
        error: error?.message ?? "Error desconocido",
      });
    }
  }

  return {
    checkedAt: now,
    expiredCount: expiredSales.length,
    results,
  };
}
