import { Request, Response, NextFunction } from "express";
import { analyticsService } from "../services/analytics.service";
import { rangeAR, optionalRangeAR } from "../utils/dateAR";

function parseRange(req: Request) {
  const { from, to } = req.query;
  return rangeAR(from as string, to as string);
}

function parseOptionalRange(req: Request) {
  const { from, to } = req.query;
  return optionalRangeAR(from as string | undefined, to as string | undefined);
}

function granularity(req: Request): "day" | "week" | "month" {
  const g = req.query.granularity as string;
  if (g === "day" || g === "week" || g === "month") return g;
  return "month";
}

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await fn(req, res));
    } catch (err) {
      next(err);
    }
  };
}

export const analyticsController = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  getDashboard: wrap(async () => analyticsService.getDashboard()),

  // ── Sales ──────────────────────────────────────────────────────────────────
  getSalesSummary: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getSalesSummary(start, end);
  }),

  getSalesTrend: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getSalesTrend(start, end, granularity(req));
  }),

  getSalesByPaymentMethod: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getSalesByPaymentMethod(start, end);
  }),

  getSalesByHour: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getSalesByHour(start, end);
  }),

  getSalesByWeekday: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getSalesByWeekday(start, end);
  }),

  getSalesByEmployee: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getSalesByEmployee(start, end);
  }),

  getSalesByLocation: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getSalesByLocation(start, end);
  }),

  getSalesByPriceType: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getSalesByPriceType(start, end);
  }),

  getSalesDiscounts: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getSalesDiscounts(start, end);
  }),

  getSalesDelivery: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getSalesDelivery(start, end);
  }),

  // ── Profitability ──────────────────────────────────────────────────────────
  getProfitabilitySummary: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getProfitabilitySummary(start, end);
  }),

  getProfitabilityByProduct: wrap(async (req) => {
    const { start, end } = parseRange(req);
    const limit = Number(req.query.limit) || 20;
    return analyticsService.getProfitabilityByProduct(start, end, limit);
  }),

  getProfitabilityByCategory: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getProfitabilityByCategory(start, end);
  }),

  getProfitabilityTrend: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getProfitabilityTrend(start, end, granularity(req));
  }),

  getExpensesBreakdown: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getExpensesBreakdown(start, end);
  }),

  getLowMarginProducts: wrap(async (req) => {
    const threshold = Number(req.query.threshold) || 20;
    return analyticsService.getLowMarginProducts(threshold);
  }),

  // ── Clients ────────────────────────────────────────────────────────────────
  getTopClients: wrap(async (req) => {
    const { start, end } = parseRange(req);
    const limit = Number(req.query.limit) || 10;
    return analyticsService.getTopClients(start, end, limit);
  }),

  getNewVsReturningClients: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getNewVsReturningClients(start, end);
  }),

  getInactiveClients: wrap(async (req) => {
    const days = Number(req.query.days) || 60;
    return analyticsService.getInactiveClients(days);
  }),

  getClientLTV: wrap(async (req) => {
    const limit = Number(req.query.limit) || 20;
    return analyticsService.getClientLTV(limit);
  }),

  getClientPurchaseFrequency: wrap(async () => analyticsService.getClientPurchaseFrequency()),

  getClientsByCategory: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getClientsByCategory(start, end);
  }),

  getDebtAging: wrap(async () => analyticsService.getDebtAging()),

  getCollectionRate: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getCollectionRate(start, end);
  }),

  // ── Inventory ──────────────────────────────────────────────────────────────
  getInventoryValue: wrap(async () => analyticsService.getInventoryValue()),

  getDeadStock: wrap(async (req) => {
    const days = Number(req.query.days) || 45;
    return analyticsService.getDeadStock(days);
  }),

  getLowStock: wrap(async () => analyticsService.getLowStock()),

  getInventoryRotation: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getInventoryRotation(start, end);
  }),

  // ── Purchases ──────────────────────────────────────────────────────────────
  getPurchasesSummary: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getPurchasesSummary(start, end);
  }),

  getPurchasesVsSales: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getPurchasesVsSales(start, end, granularity(req));
  }),

  getProductPriceEvolution: wrap(async (req) => {
    const productId = req.params.productId as string;
    return analyticsService.getProductPriceEvolution(productId);
  }),

  getCostTrend: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getCostTrend(start, end, granularity(req));
  }),

  // ── Cashflow ───────────────────────────────────────────────────────────────
  getCashflowSummary: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getCashflowSummary(start, end);
  }),

  getCashflowTrend: wrap(async (req) => {
    const { start, end } = parseRange(req);
    return analyticsService.getCashflowTrend(start, end, granularity(req));
  }),

  getPendingReceivables: wrap(async () => analyticsService.getPendingReceivables()),

  getBurnRate: wrap(async () => analyticsService.getBurnRate()),

  // ── Insights ───────────────────────────────────────────────────────────────
  getInsights: wrap(async () => analyticsService.getInsights()),

  getGrowthOpportunities: wrap(async () => analyticsService.getGrowthOpportunities()),

  getRiskAlerts: wrap(async () => analyticsService.getRiskAlerts()),
};
