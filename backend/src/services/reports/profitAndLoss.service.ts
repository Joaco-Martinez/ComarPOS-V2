import { CategoryFinance } from "@prisma/client";
import prisma from "../../prisma";
import { tenantScope } from "../../utils/tenantScope";
import { monthRangeAR } from "../../utils/dateAR";

// ─── Helpers numéricos (mismo criterio que analytics.service.ts) ──────────────

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function safeMargin(revenue: number, amount: number): number {
  if (revenue <= 0) return 0;
  return round2((amount / revenue) * 100);
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface CategoryAmount {
  category: string;
  amount: number;
}

/**
 * Números ya agregados (desde Sale/SaleItem/Finance) que el service async
 * junta antes de armar el resultado final. Separado así para poder testear
 * la lógica de armado sin pegarle a Prisma (ver __tests__).
 */
export interface ProfitAndLossInput {
  /** Total facturado del período (suma de Sale.total de ventas COMPLETED). */
  revenue: number;
  /** Costo de mercadería vendida (suma de SaleItem.purchasePriceSnapshot * cantidad). */
  cogs: number;
  /** Finance type=EGRESO del período, agrupados por category (montos en positivo). */
  expensesByCategory: CategoryAmount[];
  /** Finance type=INGRESO del período con category distinta de VENTA/COBRANZA,
   *  agrupados por category (montos en positivo). */
  otherIncomeByCategory: CategoryAmount[];
}

export interface ProfitAndLossResult {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  otherIncome: number;
  otherIncomeByCategory: Array<CategoryAmount & { percentOfRevenue: number }>;
  operatingExpenses: number;
  expensesByCategory: Array<CategoryAmount & { percentOfRevenue: number }>;
  netProfit: number;
  netMarginPercent: number;
}

// ─── Función pura (testeada en __tests__/profitAndLoss.test.ts) ───────────────

/**
 * Arma el Estado de Resultados a partir de números ya agregados.
 *
 * Fórmulas:
 *   grossProfit      = revenue - cogs
 *   operatingExpenses = suma de expensesByCategory
 *   otherIncome       = suma de otherIncomeByCategory
 *   netProfit         = grossProfit + otherIncome - operatingExpenses
 */
export function buildProfitAndLoss(input: ProfitAndLossInput): ProfitAndLossResult {
  const revenue = round2(input.revenue);
  const cogs = round2(input.cogs);
  const grossProfit = round2(revenue - cogs);

  const operatingExpenses = round2(
    input.expensesByCategory.reduce((acc, e) => acc + Math.abs(e.amount), 0)
  );
  const otherIncome = round2(
    input.otherIncomeByCategory.reduce((acc, e) => acc + Math.abs(e.amount), 0)
  );

  const netProfit = round2(grossProfit + otherIncome - operatingExpenses);

  return {
    revenue,
    cogs,
    grossProfit,
    grossMarginPercent: safeMargin(revenue, grossProfit),
    otherIncome,
    otherIncomeByCategory: input.otherIncomeByCategory
      .map((e) => ({
        category: e.category,
        amount: round2(Math.abs(e.amount)),
        percentOfRevenue: safeMargin(revenue, Math.abs(e.amount)),
      }))
      .sort((a, b) => b.amount - a.amount),
    operatingExpenses,
    expensesByCategory: input.expensesByCategory
      .map((e) => ({
        category: e.category,
        amount: round2(Math.abs(e.amount)),
        percentOfRevenue: safeMargin(revenue, Math.abs(e.amount)),
      }))
      .sort((a, b) => b.amount - a.amount),
    netProfit,
    netMarginPercent: safeMargin(revenue, netProfit),
  };
}

function groupByCategory(rows: { amount: number; category: string }[]): CategoryAmount[] {
  const byCategory: Record<string, number> = {};
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + Math.abs(r.amount);
  }
  return Object.entries(byCategory).map(([category, amount]) => ({ category, amount }));
}

// ─── Service async (Prisma) ────────────────────────────────────────────────

/**
 * Estado de Resultados mensual: cruza Sale (facturación + COGS via
 * SaleItem.purchasePriceSnapshot) con Finance (gastos e ingresos no
 * relacionados a ventas) para el período {year, month}.
 *
 * Criterio de "venta del período": igual que el resto de analytics.service.ts
 * (getProfitabilitySummary, getProfitabilityTrend, etc.) -- status COMPLETED
 * y createdAt dentro del rango. Esto excluye ventas canceladas/devueltas
 * (una devolución cancela la Sale subyacente, ver backend/CLAUDE.md) y
 * ventas todavía PENDING (cotizaciones no confirmadas).
 *
 * Posible mejora futura (no implementada ahora, no es trivial): persistir/
 * cachear el cierre de un período ya transcurrido para no tener que
 * recalcularlo cada vez que se abre el reporte -- hoy es 100% on-the-fly.
 */
async function getMonthly(year: number, month: number) {
  const { start, end } = monthRangeAR(year, month);
  const scope = tenantScope();

  const [sales, expenseRows, otherIncomeRows] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: start, lte: end }, ...scope },
      select: {
        total: true,
        items: {
          select: { purchasePriceSnapshot: true, quantity: true, quantityKg: true },
        },
      },
    }),
    prisma.finance.findMany({
      where: { type: "EGRESO", date: { gte: start, lte: end }, ...scope },
      select: { amount: true, category: true },
    }),
    prisma.finance.findMany({
      where: {
        type: "INGRESO",
        date: { gte: start, lte: end },
        category: { notIn: [CategoryFinance.VENTA, CategoryFinance.COBRANZA] },
        ...scope,
      },
      select: { amount: true, category: true },
    }),
  ]);

  const revenue = sales.reduce((acc, s) => acc + s.total, 0);
  const cogs = sales.reduce(
    (acc, s) =>
      acc +
      s.items.reduce(
        (itemAcc, i) => itemAcc + i.purchasePriceSnapshot * (i.quantityKg ?? i.quantity),
        0
      ),
    0
  );

  const result = buildProfitAndLoss({
    revenue,
    cogs,
    expensesByCategory: groupByCategory(expenseRows),
    otherIncomeByCategory: groupByCategory(otherIncomeRows),
  });

  return {
    period: { year, month, from: start, to: end },
    ...result,
  };
}

export const profitAndLossService = {
  buildProfitAndLoss,
  getMonthly,
};
