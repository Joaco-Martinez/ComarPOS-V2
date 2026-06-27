/**
 * Construccion del reporte base de productos vendidos (agregacion por producto).
 * Extraido de productStats.service.ts (doc seccion 4 - modularizacion).
 */
import prisma from "../../prisma";
import { SaleStatus, SaleUnit } from "@prisma/client";
import { startOfDayAR, endOfDayAR } from "../../utils/dateAR";
import { tenantScope } from "../../utils/tenantScope";
import {
  n0,
  round2,
  toDateOnly,
  buildAccountDebtAllocationBySale,
  type SaleItemStatInput,
  type ProductLite,
  type GroupedRow,
  type ReportProductStat,
} from "./productStats.helpers";

export async function createStatsFromSale(items: SaleItemStatInput[]) {
  const dateOnly = toDateOnly(new Date());

  const products = await prisma.product.findMany({
    where: {
      id: {
        in: items.map((i) => i.productId),
      },
      ...tenantScope(),
    },
    select: {
      id: true,
      saleUnit: true,
    },
  });

  const unitMap = new Map(products.map((p) => [p.id, p.saleUnit]));

  // Se valida todo primero y se inserta con un solo createMany (antes era un
  // create por item, y ademas dejaba filas a medio insertar si fallaba un item
  // intermedio).
  const rows = items.map((item) => {
    const saleUnit = unitMap.get(item.productId);

    if (!saleUnit) {
      throw new Error(`Producto no encontrado: ${item.productId}`);
    }

    if (saleUnit === SaleUnit.KG) {
      const kg = n0(item.quantityKg);

      if (kg <= 0) {
        throw new Error(`quantityKg inválida para producto KG: ${item.productId}`);
      }

      return {
        productId: item.productId,
        quantity: 0,
        quantityKg: kg,
        date: dateOnly,
      };
    }

    const qty = n0(item.quantity);

    if (qty <= 0) {
      throw new Error(`quantity inválida para producto UNIT: ${item.productId}`);
    }

    return {
      productId: item.productId,
      quantity: qty,
      quantityKg: 0,
      date: dateOnly,
    };
  });

  await prisma.productStats.createMany({ data: rows });
}

export async function attachProducts(grouped: GroupedRow[]) {
  if (!grouped.length) return [];

  const products = await prisma.product.findMany({
    where: {
      id: {
        in: grouped.map((g) => g.productId),
      },
      ...tenantScope(),
    },
    select: {
      id: true,
      name: true,
      saleUnit: true,
    },
  });

  const productMap = new Map<string, ProductLite>(products.map((p) => [p.id, p]));

  return grouped.map((g) => {
    const product = productMap.get(g.productId) || null;

    const unitsSold = n0(g._sum.quantity);
    const kgSold = n0(g._sum.quantityKg);

    const saleUnit = product?.saleUnit ?? SaleUnit.UNIT;
    const rankValue = saleUnit === SaleUnit.KG ? kgSold : unitsSold;

    return {
      productId: g.productId,
      product,
      saleUnit,
      rankValue,
      unitsSold,
      kgSold,
    };
  });
}

export async function groupAll(where?: any) {
  return prisma.productStats.groupBy({
    by: ["productId"],
    where,
    _sum: {
      quantity: true,
      quantityKg: true,
    },
  });
}

export async function buildProductReport(params?: {
  startDate?: Date;
  endDate?: Date;
  unit?: "UNIT" | "KG";
}): Promise<ReportProductStat[]> {
  const where: any = {
    sale: {
      status: SaleStatus.COMPLETED,
      ...tenantScope(),
    },
  };

  if (params?.startDate || params?.endDate) {
    where.sale.createdAt = {};

    if (params.startDate) {
      where.sale.createdAt.gte = startOfDayAR(params.startDate);
    }

    if (params.endDate) {
      where.sale.createdAt.lte = endOfDayAR(params.endDate);
    }
  }

  if (params?.unit) {
    where.product = {
      saleUnit: params.unit,
    };
  }

  const items = await prisma.saleItem.findMany({
    where,
    select: {
      id: true,
      saleId: true,
      productId: true,
      quantity: true,
      quantityKg: true,
      price: true,
      product: {
        select: {
          id: true,
          name: true,
          saleUnit: true,
        },
      },
      sale: {
        select: {
          id: true,
          clientId: true,
          total: true,
          createdAt: true,
          status: true,
          isAccountSale: true,
          accountDebtAmount: true,
          payments: {
            select: {
              method: true,
              amount: true,
            },
          },
        },
      },
    },
  });

  const clientIds: string[] = Array.from(
    new Set(
      items
        .map((item: any) => item.sale.clientId)
        .filter((id: any): id is string => Boolean(id))
    )
  );

  const accountDebtBySale = await buildAccountDebtAllocationBySale(clientIds);

  const map = new Map<string, ReportProductStat>();

  for (const item of items) {
    const product = item.product;
    const sale = item.sale;
    const saleUnit = product.saleUnit;

    const unitsSold = saleUnit === SaleUnit.UNIT ? n0(item.quantity) : 0;
    const kgSold = saleUnit === SaleUnit.KG ? n0(item.quantityKg) : 0;
    const soldQty = saleUnit === SaleUnit.KG ? kgSold : unitsSold;

    const grossRevenue = round2(n0(item.price) * soldQty);

    const saleTotal = n0(sale.total);

    const directCollected = (sale.payments ?? [])
      .filter((payment) => payment.method !== "CUENTA_CORRIENTE")
      .reduce((acc, payment) => acc + n0(payment.amount), 0);

    const accountAllocation = accountDebtBySale.get(sale.id);

    const accountCollected = accountAllocation?.accountPaid ?? 0;

    const saleCollected = round2(directCollected + accountCollected);

    const collectedRatio = saleTotal > 0 ? Math.min(saleCollected / saleTotal, 1) : 0;

    const collectedRevenue = round2(grossRevenue * collectedRatio);
    const pendingRevenue = round2(Math.max(grossRevenue - collectedRevenue, 0));

    const current = map.get(item.productId);

    if (!current) {
      map.set(item.productId, {
        productId: item.productId,
        name: product.name,
        saleUnit,
        unitsSold,
        kgSold,
        totalSold: soldQty,
        totalSoldLabel: saleUnit === SaleUnit.KG ? `${kgSold} kg` : `${unitsSold} u.`,

        totalRevenue: grossRevenue,
        grossRevenue,
        collectedRevenue,
        pendingRevenue,

        rankValue: soldQty,
        product,
      });
    } else {
      current.unitsSold = round2(current.unitsSold + unitsSold);
      current.kgSold = round2(current.kgSold + kgSold);
      current.totalSold = round2(current.totalSold + soldQty);

      current.totalRevenue = round2(current.totalRevenue + grossRevenue);
      current.grossRevenue = round2(current.grossRevenue + grossRevenue);
      current.collectedRevenue = round2(current.collectedRevenue + collectedRevenue);
      current.pendingRevenue = round2(current.pendingRevenue + pendingRevenue);

      current.rankValue = current.totalSold;

      current.totalSoldLabel =
        current.saleUnit === SaleUnit.KG
          ? `${current.kgSold} kg`
          : `${current.unitsSold} u.`;
    }
  }

  return Array.from(map.values());
}
