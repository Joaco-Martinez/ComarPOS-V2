import { Router } from "express";
import { analyticsController as ac } from "../controllers/analytics.controller";
import { authMiddleware } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

const router = Router();

router.use(authMiddleware);

// Dashboard -- va antes del gate de "reportes" y con su propio gate, asi
// queda independiente: un plan puede tener Dashboard sin Reportes o
// viceversa. Como ya respondio la request, el router.use(...) de abajo no
// llega a correr para /dashboard.
router.get("/dashboard", requirePlanFeature("dashboard"), ac.getDashboard);

router.use(requirePlanFeature("reportes"));

// Sales
router.get("/sales/summary", ac.getSalesSummary);
router.get("/sales/trend", ac.getSalesTrend);
router.get("/sales/by-payment-method", ac.getSalesByPaymentMethod);
router.get("/sales/by-hour", ac.getSalesByHour);
router.get("/sales/by-weekday", ac.getSalesByWeekday);
router.get("/sales/by-employee", ac.getSalesByEmployee);
router.get("/sales/by-location", ac.getSalesByLocation);
router.get("/sales/by-price-type", ac.getSalesByPriceType);
router.get("/sales/discounts", ac.getSalesDiscounts);
router.get("/sales/delivery", ac.getSalesDelivery);

// Profitability
router.get("/profitability/summary", ac.getProfitabilitySummary);
router.get("/profitability/by-product", ac.getProfitabilityByProduct);
router.get("/profitability/by-category", ac.getProfitabilityByCategory);
router.get("/profitability/trend", ac.getProfitabilityTrend);
router.get("/profitability/expenses-breakdown", ac.getExpensesBreakdown);
router.get("/profitability/low-margin-products", ac.getLowMarginProducts);

// Clients
router.get("/clients/top", ac.getTopClients);
router.get("/clients/new-vs-returning", ac.getNewVsReturningClients);
router.get("/clients/inactive", ac.getInactiveClients);
router.get("/clients/ltv", ac.getClientLTV);
router.get("/clients/purchase-frequency", ac.getClientPurchaseFrequency);
router.get("/clients/by-category", ac.getClientsByCategory);
router.get("/clients/debt-aging", ac.getDebtAging);
router.get("/clients/collection-rate", ac.getCollectionRate);

// Inventory
router.get("/inventory/value", ac.getInventoryValue);
router.get("/inventory/dead-stock", ac.getDeadStock);
router.get("/inventory/low-stock", ac.getLowStock);
router.get("/inventory/rotation", ac.getInventoryRotation);

// Purchases
router.get("/purchases/summary", ac.getPurchasesSummary);
router.get("/purchases/vs-sales", ac.getPurchasesVsSales);
router.get("/purchases/cost-trend", ac.getCostTrend);
router.get("/purchases/price-evolution/:productId", ac.getProductPriceEvolution);

// Cashflow
router.get("/cashflow/summary", ac.getCashflowSummary);
router.get("/cashflow/trend", ac.getCashflowTrend);
router.get("/cashflow/pending-receivables", ac.getPendingReceivables);
router.get("/cashflow/burn-rate", ac.getBurnRate);

// Insights / BI
router.get("/insights", ac.getInsights);
router.get("/growth-opportunities", ac.getGrowthOpportunities);
router.get("/risk-alerts", ac.getRiskAlerts);

export default router;
