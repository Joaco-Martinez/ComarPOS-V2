/**
 * Rankings de productos (top/peor, por rango de fechas, por mes).
 * Extraido de productStats.service.ts (doc seccion 4 - modularizacion).
 */
import { buildProductReport } from "./productStats.report";
import type { ReportGroupBy } from "../reports/variantGrouping";

export async function getTopProducts(limit: number, unit?: "UNIT" | "KG", groupBy?: ReportGroupBy) {
  const data = await buildProductReport({ unit, groupBy });

  return data.sort((a, b) => b.rankValue - a.rankValue).slice(0, limit);
}

export async function getWorstProducts(limit: number, unit?: "UNIT" | "KG", groupBy?: ReportGroupBy) {
  const data = await buildProductReport({ unit, groupBy });

  return data
    .filter((p) => p.rankValue > 0)
    .sort((a, b) => a.rankValue - b.rankValue)
    .slice(0, limit);
}

export async function getTopProductsByRange(
  startDate: Date,
  endDate: Date,
  limit: number,
  unit?: "UNIT" | "KG",
  groupBy?: ReportGroupBy
) {
  const data = await buildProductReport({
    startDate,
    endDate,
    unit,
    groupBy,
  });

  return data.sort((a, b) => b.rankValue - a.rankValue).slice(0, limit);
}

export async function getWorstProductsByRange(
  startDate: Date,
  endDate: Date,
  limit: number,
  unit?: "UNIT" | "KG",
  groupBy?: ReportGroupBy
) {
  const data = await buildProductReport({
    startDate,
    endDate,
    unit,
    groupBy,
  });

  return data
    .filter((p) => p.rankValue > 0)
    .sort((a, b) => a.rankValue - b.rankValue)
    .slice(0, limit);
}

export async function getBestProductByMonth(year: number, month: number, unit?: "UNIT" | "KG", groupBy?: ReportGroupBy) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const data = await buildProductReport({
    startDate,
    endDate,
    unit,
    groupBy,
  });

  return data.sort((a, b) => b.rankValue - a.rankValue)[0] || null;
}

export async function getWorstProductByMonth(year: number, month: number, unit?: "UNIT" | "KG", groupBy?: ReportGroupBy) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const data = await buildProductReport({
    startDate,
    endDate,
    unit,
    groupBy,
  });

  return (
    data
      .filter((p) => p.rankValue > 0)
      .sort((a, b) => a.rankValue - b.rankValue)[0] || null
  );
}
