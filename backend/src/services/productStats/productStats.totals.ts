/**
 * Totales agregados (ventas, recaudado/pendiente, top 10) globales y por rango.
 * Extraido de productStats.service.ts (doc seccion 4 - modularizacion).
 */
import prisma from "../../prisma";
import { CategoryFinance, FinanceType, SaleStatus } from "@prisma/client";
import { startOfDayAR, endOfDayAR } from "../../utils/dateAR";
import { n0, round2 } from "./productStats.helpers";
import { buildProductReport } from "./productStats.report";
import { tenantScope } from "../../utils/tenantScope";

export async function getTotals(unit?: "UNIT" | "KG") {
  const products = await buildProductReport({ unit });

  const salesWhere: any = {
    status: SaleStatus.COMPLETED,
    ...tenantScope(),
  };

  const totalSales = await prisma.sale.count({
    where: salesWhere,
  });

  const totalRevenueAgg = await prisma.sale.aggregate({
    where: salesWhere,
    _sum: {
      total: true,
    },
  });

  const financeIncomeAgg = await prisma.finance.aggregate({
    where: {
      type: FinanceType.INGRESO,
      category: {
        in: [CategoryFinance.VENTA, CategoryFinance.COBRANZA],
      },
      ...tenantScope(),
    },
    _sum: {
      amount: true,
    },
  });

  const currentDebtAgg = await prisma.client.aggregate({
    where: { ...tenantScope() },
    _sum: {
      currentBalance: true,
    },
  });

  const grossRevenue = round2(n0(totalRevenueAgg._sum.total));
  const collectedRevenue = round2(n0(financeIncomeAgg._sum.amount));
  const pendingRevenue = round2(n0(currentDebtAgg._sum.currentBalance));

  const totalUnits = round2(products.reduce((acc, p) => acc + p.unitsSold, 0));
  const totalKg = round2(products.reduce((acc, p) => acc + p.kgSold, 0));
  const totalItems = round2(products.reduce((acc, p) => acc + p.totalSold, 0));

  return {
    totalRevenue: grossRevenue,

    grossRevenue,
    collectedRevenue,
    pendingRevenue,

    totalSales,
    totalItems,
    totalUnits,
    totalKg,
    productsCount: products.length,
    topProducts: products.sort((a, b) => b.rankValue - a.rankValue).slice(0, 10),
  };
}

export async function getTotalsByRange(startDate: Date, endDate: Date, unit?: "UNIT" | "KG") {
  const products = await buildProductReport({
    startDate,
    endDate,
    unit,
  });

  const salesWhere: any = {
    status: SaleStatus.COMPLETED,
    createdAt: {
      gte: startOfDayAR(startDate),
      lte: endOfDayAR(endDate),
    },
    ...tenantScope(),
  };

  const totalSales = await prisma.sale.count({
    where: salesWhere,
  });

  const totalRevenueAgg = await prisma.sale.aggregate({
    where: salesWhere,
    _sum: {
      total: true,
    },
  });

  const financeIncomeAgg = await prisma.finance.aggregate({
    where: {
      type: FinanceType.INGRESO,
      category: {
        in: [CategoryFinance.VENTA, CategoryFinance.COBRANZA],
      },
      date: {
        gte: startOfDayAR(startDate),
        lte: endOfDayAR(endDate),
      },
      ...tenantScope(),
    },
    _sum: {
      amount: true,
    },
  });

  const grossRevenue = round2(n0(totalRevenueAgg._sum.total));
  const collectedRevenue = round2(n0(financeIncomeAgg._sum.amount));
  const pendingRevenue = round2(products.reduce((acc, p) => acc + n0(p.pendingRevenue), 0));

  const totalUnits = round2(products.reduce((acc, p) => acc + p.unitsSold, 0));
  const totalKg = round2(products.reduce((acc, p) => acc + p.kgSold, 0));
  const totalItems = round2(products.reduce((acc, p) => acc + p.totalSold, 0));

  return {
    totalRevenue: grossRevenue,

    grossRevenue,
    collectedRevenue,
    pendingRevenue,

    totalSales,
    totalItems,
    totalUnits,
    totalKg,
    productsCount: products.length,
    topProducts: products.sort((a, b) => b.rankValue - a.rankValue).slice(0, 10),
  };
}
