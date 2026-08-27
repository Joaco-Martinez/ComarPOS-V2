import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

type Granularity = "day" | "week" | "month";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function safeMargin(revenue: number, cost: number): number {
  if (revenue <= 0) return 0;
  return round2(((revenue - cost) / revenue) * 100);
}

function getGroupKey(date: Date, granularity: Granularity): string {
  const d = new Date(date);
  // Agrupar por día/mes calendario de Argentina, no UTC (toISOString desfasa
  // ventas de la noche AR al día/mes siguiente cuando el server corre en UTC).
  const arDateStr = d.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  if (granularity === "month") return arDateStr.slice(0, 7);
  if (granularity === "day") return arDateStr;
  // week: ISO week
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function todayRangeAR() {
  const now = new Date();
  const str = now.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  return {
    start: new Date(`${str}T00:00:00.000-03:00`),
    end: new Date(`${str}T23:59:59.999-03:00`),
  };
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ─── GROUP 1: DASHBOARD ────────────────────────────────────────────────────────

async function getDashboard() {
  const scope = tenantScope();
  const { start: todayStart, end: todayEnd } = todayRangeAR();

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd = new Date(todayEnd);
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

  const weekStart = daysAgo(7);
  const lastWeekStart = daysAgo(14);

  const now = new Date();
  const monthStartStr = now
    .toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
    .slice(0, 7);
  const monthStart = new Date(`${monthStartStr}-01T00:00:00.000-03:00`);

  const [todaySales, yesterdaySales, weekSales, lastWeekSales, monthSales, receivables, activeAlerts, todayPayments, todayExpenses] =
    await Promise.all([
      prisma.sale.findMany({
        where: { status: "COMPLETED", createdAt: { gte: todayStart, lte: todayEnd }, ...scope },
        select: { total: true, grossProfit: true, subtotal: true, discountValue: true, discountType: true },
      }),
      prisma.sale.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: yesterdayStart, lte: yesterdayEnd }, ...scope },
        _sum: { total: true, grossProfit: true },
        _count: { id: true },
      }),
      prisma.sale.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: weekStart }, ...scope },
        _sum: { total: true, grossProfit: true },
        _count: { id: true },
      }),
      prisma.sale.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: lastWeekStart, lte: weekStart }, ...scope },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.sale.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: monthStart }, ...scope },
        _sum: { total: true, grossProfit: true },
        _count: { id: true },
      }),
      prisma.client.aggregate({
        where: { currentBalance: { gt: 0 }, ...scope },
        _sum: { currentBalance: true },
        _count: { id: true },
      }),
      prisma.alert.count({ where: { resolved: false, product: { tenantId: currentTenantId() ?? undefined } } }),
      prisma.salePayment.findMany({
        where: { sale: { status: "COMPLETED", createdAt: { gte: todayStart, lte: todayEnd }, ...scope } },
        select: { method: true, amount: true },
      }),
      prisma.finance.aggregate({
        where: { type: "EGRESO", date: { gte: todayStart, lte: todayEnd }, ...scope },
        _sum: { amount: true },
      }),
    ]);

  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0);
  const todayProfit = todaySales.reduce((s, x) => s + x.grossProfit, 0);
  const todayCount = todaySales.length;
  const todayExpensesAmt = todayExpenses._sum.amount ?? 0;

  const paymentByMethod: Record<string, number> = {};
  for (const p of todayPayments) {
    paymentByMethod[p.method] = (paymentByMethod[p.method] ?? 0) + p.amount;
  }

  const yRevenue = yesterdaySales._sum.total ?? 0;
  const yProfit = yesterdaySales._sum.grossProfit ?? 0;

  return {
    today: {
      revenue: round2(todayRevenue),
      grossProfit: round2(todayProfit),
      netProfit: round2(todayProfit - todayExpensesAmt),
      grossMarginPercent: safeMargin(todayRevenue, todayRevenue - todayProfit),
      salesCount: todayCount,
      avgTicket: todayCount > 0 ? round2(todayRevenue / todayCount) : 0,
      expenses: round2(todayExpensesAmt),
      paymentByMethod,
      vsYesterday: {
        revenue: round2(todayRevenue - yRevenue),
        revenuePercent: yRevenue > 0 ? round2(((todayRevenue - yRevenue) / yRevenue) * 100) : null,
        salesCount: todayCount - (yesterdaySales._count.id ?? 0),
        grossProfit: round2(todayProfit - yProfit),
      },
    },
    thisWeek: {
      revenue: round2(weekSales._sum.total ?? 0),
      grossProfit: round2(weekSales._sum.grossProfit ?? 0),
      salesCount: weekSales._count.id,
      vsLastWeek: {
        revenue: round2((weekSales._sum.total ?? 0) - (lastWeekSales._sum.total ?? 0)),
        revenuePercent:
          (lastWeekSales._sum.total ?? 0) > 0
            ? round2((((weekSales._sum.total ?? 0) - (lastWeekSales._sum.total ?? 0)) / (lastWeekSales._sum.total ?? 1)) * 100)
            : null,
        salesCount: weekSales._count.id - lastWeekSales._count.id,
      },
    },
    thisMonth: {
      revenue: round2(monthSales._sum.total ?? 0),
      grossProfit: round2(monthSales._sum.grossProfit ?? 0),
      salesCount: monthSales._count.id,
      avgTicket: monthSales._count.id > 0 ? round2((monthSales._sum.total ?? 0) / monthSales._count.id) : 0,
    },
    receivables: {
      totalPending: round2(receivables._sum.currentBalance ?? 0),
      clientsWithDebt: receivables._count.id,
    },
    activeAlerts,
  };
}

// ─── GROUP 2: SALES ────────────────────────────────────────────────────────────

async function getSalesSummary(from: Date, to: Date) {
  const scope = tenantScope();
  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope },
      select: {
        total: true, subtotal: true, grossProfit: true,
        discountType: true, discountValue: true,
        deliveryCost: true, isAccountSale: true, paymentMethod: true,
      },
    }),
    prisma.salePayment.findMany({
      where: { sale: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope } },
      select: { method: true, amount: true },
    }),
  ]);

  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const grossProfit = sales.reduce((s, x) => s + x.grossProfit, 0);
  const deliveryRevenue = sales.reduce((s, x) => s + (x.deliveryCost ?? 0), 0);

  // discountValue negativo = recargo (ver POS), no un descuento -- se excluye
  // acá para no restarle a totalDiscountGiven.
  let totalDiscount = 0;
  for (const s of sales) {
    if (!s.discountValue || s.discountValue <= 0) continue;
    totalDiscount +=
      s.discountType === "PERCENTAGE"
        ? s.subtotal * (s.discountValue / 100)
        : s.discountValue;
  }

  const paymentBreakdown: Record<string, number> = {};
  for (const p of payments) {
    paymentBreakdown[p.method] = (paymentBreakdown[p.method] ?? 0) + p.amount;
  }

  return {
    period: { from, to },
    salesCount: sales.length,
    revenue: round2(revenue),
    grossProfit: round2(grossProfit),
    grossMarginPercent: safeMargin(revenue, revenue - grossProfit),
    avgTicket: sales.length > 0 ? round2(revenue / sales.length) : 0,
    deliveryRevenue: round2(deliveryRevenue),
    totalDiscountGiven: round2(totalDiscount),
    salesWithDiscount: sales.filter((s) => s.discountValue && s.discountValue > 0).length,
    accountSales: sales.filter((s) => s.isAccountSale).length,
    paymentBreakdown,
  };
}

async function getSalesTrend(from: Date, to: Date, granularity: Granularity = "day") {
  const scope = tenantScope();
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope },
    select: { total: true, grossProfit: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const grouped = new Map<string, { revenue: number; profit: number; count: number }>();
  for (const s of sales) {
    const key = getGroupKey(s.createdAt, granularity);
    const cur = grouped.get(key) ?? { revenue: 0, profit: 0, count: 0 };
    cur.revenue += s.total;
    cur.profit += s.grossProfit;
    cur.count++;
    grouped.set(key, cur);
  }

  return Array.from(grouped.entries()).map(([period, d]) => ({
    period,
    revenue: round2(d.revenue),
    grossProfit: round2(d.profit),
    grossMarginPercent: safeMargin(d.revenue, d.revenue - d.profit),
    salesCount: d.count,
    avgTicket: d.count > 0 ? round2(d.revenue / d.count) : 0,
  }));
}

async function getSalesByPaymentMethod(from: Date, to: Date) {
  const scope = tenantScope();
  const payments = await prisma.salePayment.findMany({
    where: { sale: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope } },
    select: { method: true, amount: true },
  });

  const grouped: Record<string, { totalAmount: number; count: number }> = {};
  for (const p of payments) {
    if (!grouped[p.method]) grouped[p.method] = { totalAmount: 0, count: 0 };
    grouped[p.method].totalAmount += p.amount;
    grouped[p.method].count++;
  }

  const total = Object.values(grouped).reduce((s, x) => s + x.totalAmount, 0);

  return Object.entries(grouped)
    .map(([method, d]) => ({
      method,
      totalAmount: round2(d.totalAmount),
      transactionCount: d.count,
      percentOfTotal: total > 0 ? round2((d.totalAmount / total) * 100) : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

async function getSalesByHour(from: Date, to: Date) {
  const scope = tenantScope();
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope },
    select: { total: true, createdAt: true },
  });

  const byHour: Record<number, { revenue: number; count: number }> = {};
  for (let h = 0; h < 24; h++) byHour[h] = { revenue: 0, count: 0 };

  for (const s of sales) {
    const hourStr = new Date(s.createdAt).toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "numeric",
      hour12: false,
    });
    const h = parseInt(hourStr) % 24;
    byHour[h].revenue += s.total;
    byHour[h].count++;
  }

  return Object.entries(byHour).map(([hour, d]) => ({
    hour: parseInt(hour),
    revenue: round2(d.revenue),
    salesCount: d.count,
    avgTicket: d.count > 0 ? round2(d.revenue / d.count) : 0,
  }));
}

async function getSalesByWeekday(from: Date, to: Date) {
  const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const scope = tenantScope();
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope },
    select: { total: true, createdAt: true },
  });

  const byDay: Record<number, { revenue: number; count: number }> = {};
  for (let d = 0; d < 7; d++) byDay[d] = { revenue: 0, count: 0 };

  for (const s of sales) {
    const dayStr = new Date(s.createdAt).toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "short",
    });
    const idx = DAY_ABBR.indexOf(dayStr.slice(0, 3));
    if (idx >= 0) {
      byDay[idx].revenue += s.total;
      byDay[idx].count++;
    }
  }

  return Object.entries(byDay).map(([i, d]) => ({
    dayIndex: parseInt(i),
    dayName: DAYS[parseInt(i)],
    revenue: round2(d.revenue),
    salesCount: d.count,
    avgTicket: d.count > 0 ? round2(d.revenue / d.count) : 0,
  }));
}

async function getSalesByEmployee(from: Date, to: Date) {
  const scope = tenantScope();
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, userId: { not: null }, ...scope },
    select: {
      total: true, grossProfit: true, userId: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  const byEmployee: Record<string, { user: any; revenue: number; profit: number; count: number }> = {};
  for (const s of sales) {
    if (!s.userId) continue;
    if (!byEmployee[s.userId]) byEmployee[s.userId] = { user: s.user, revenue: 0, profit: 0, count: 0 };
    byEmployee[s.userId].revenue += s.total;
    byEmployee[s.userId].profit += s.grossProfit;
    byEmployee[s.userId].count++;
  }

  return Object.values(byEmployee)
    .map((d) => ({
      user: d.user,
      revenue: round2(d.revenue),
      grossProfit: round2(d.profit),
      grossMarginPercent: safeMargin(d.revenue, d.revenue - d.profit),
      salesCount: d.count,
      avgTicket: d.count > 0 ? round2(d.revenue / d.count) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

async function getSalesByLocation(from: Date, to: Date) {
  const scope = tenantScope();
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope },
    select: {
      total: true, grossProfit: true, businessLocationId: true, stockLocationId: true,
      businessLocation: { select: { id: true, name: true, type: true } },
      stockLocationRef: { select: { id: true, name: true, type: true } },
    },
  });

  const byLocation: Record<string, { location: any; revenue: number; profit: number; count: number }> = {};
  for (const s of sales) {
    const key = s.businessLocationId ?? s.stockLocationId ?? "SIN_LOCAL";
    if (!byLocation[key])
      byLocation[key] = {
        location: s.businessLocation ?? s.stockLocationRef ?? { id: null, name: "Sin ubicación", type: null },
        revenue: 0, profit: 0, count: 0,
      };
    byLocation[key].revenue += s.total;
    byLocation[key].profit += s.grossProfit;
    byLocation[key].count++;
  }

  return Object.values(byLocation)
    .map((d) => ({
      location: d.location,
      revenue: round2(d.revenue),
      grossProfit: round2(d.profit),
      grossMarginPercent: safeMargin(d.revenue, d.revenue - d.profit),
      salesCount: d.count,
      avgTicket: d.count > 0 ? round2(d.revenue / d.count) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

async function getSalesByPriceType(from: Date, to: Date) {
  const scope = tenantScope();
  const items = await prisma.saleItem.findMany({
    where: { sale: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope } },
    select: { priceType: true, quantity: true, subtotal: true, profit: true },
  });

  const byType: Record<string, { revenue: number; profit: number; units: number }> = {};
  for (const i of items) {
    if (!byType[i.priceType]) byType[i.priceType] = { revenue: 0, profit: 0, units: 0 };
    byType[i.priceType].revenue += i.subtotal;
    byType[i.priceType].profit += i.profit;
    byType[i.priceType].units += i.quantity;
  }

  const total = Object.values(byType).reduce((s, x) => s + x.revenue, 0);
  return Object.entries(byType).map(([priceType, d]) => ({
    priceType,
    revenue: round2(d.revenue),
    grossProfit: round2(d.profit),
    grossMarginPercent: safeMargin(d.revenue, d.revenue - d.profit),
    unitsSold: d.units,
    percentOfRevenue: total > 0 ? round2((d.revenue / total) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

async function getSalesDiscounts(from: Date, to: Date) {
  const scope = tenantScope();
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope },
    select: { total: true, subtotal: true, grossProfit: true, discountType: true, discountValue: true },
  });

  // discountValue negativo = recargo (ver POS), no un descuento -- cae en el
  // grupo "sin descuento" de más abajo, no en withDiscount. Se usa el
  // complemento exacto (en vez de === 0) para que revenueWith + revenueWithout
  // sigan sumando el total del período sin importar el signo.
  const withDiscount = sales.filter((s) => s.discountValue && s.discountValue > 0);
  let totalDiscountAmount = 0;
  for (const s of withDiscount) {
    if (!s.discountValue) continue;
    totalDiscountAmount +=
      s.discountType === "PERCENTAGE"
        ? s.subtotal * (s.discountValue / 100)
        : s.discountValue;
  }

  const revenueWith = withDiscount.reduce((s, x) => s + x.total, 0);
  const profitWith = withDiscount.reduce((s, x) => s + x.grossProfit, 0);
  const revenueWithout = sales
    .filter((s) => !(s.discountValue && s.discountValue > 0))
    .reduce((s, x) => s + x.total, 0);

  return {
    totalSales: sales.length,
    salesWithDiscount: withDiscount.length,
    discountRate: sales.length > 0 ? round2((withDiscount.length / sales.length) * 100) : 0,
    totalDiscountGiven: round2(totalDiscountAmount),
    revenueWithDiscount: round2(revenueWith),
    revenueWithoutDiscount: round2(revenueWithout),
    avgMarginWithDiscount: safeMargin(revenueWith, revenueWith - profitWith),
    byDiscountType: {
      PERCENTAGE: withDiscount.filter((s) => s.discountType === "PERCENTAGE").length,
      FIXED: withDiscount.filter((s) => s.discountType === "FIXED").length,
    },
  };
}

async function getSalesDelivery(from: Date, to: Date) {
  const scope = tenantScope();
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope },
    select: { total: true, deliveryCost: true, deliveryMethod: true, deliveryStatus: true, deliveryDistanceKm: true },
  });

  const byMethod: Record<string, { count: number; revenue: number; deliveryRevenue: number }> = {};
  for (const s of sales) {
    if (!byMethod[s.deliveryMethod]) byMethod[s.deliveryMethod] = { count: 0, revenue: 0, deliveryRevenue: 0 };
    byMethod[s.deliveryMethod].count++;
    byMethod[s.deliveryMethod].revenue += s.total;
    byMethod[s.deliveryMethod].deliveryRevenue += s.deliveryCost ?? 0;
  }

  const deliverySales = sales.filter((s) => s.deliveryMethod !== "PICKUP");
  const totalDeliveryRevenue = deliverySales.reduce((s, x) => s + (x.deliveryCost ?? 0), 0);
  const distanceSales = deliverySales.filter((s) => s.deliveryDistanceKm);
  const avgDistance = distanceSales.length > 0
    ? distanceSales.reduce((s, x) => s + (x.deliveryDistanceKm ?? 0), 0) / distanceSales.length
    : 0;

  return {
    totalSales: sales.length,
    deliverySales: deliverySales.length,
    pickupSales: sales.length - deliverySales.length,
    totalDeliveryRevenue: round2(totalDeliveryRevenue),
    avgDeliveryRevenue: deliverySales.length > 0 ? round2(totalDeliveryRevenue / deliverySales.length) : 0,
    avgDistanceKm: round2(avgDistance),
    byMethod: Object.entries(byMethod).map(([method, d]) => ({
      method,
      count: d.count,
      revenue: round2(d.revenue),
      deliveryRevenue: round2(d.deliveryRevenue),
    })),
  };
}

// ─── GROUP 3: PROFITABILITY ────────────────────────────────────────────────────

async function getProfitabilitySummary(from: Date, to: Date) {
  const scope = tenantScope();
  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope },
      select: { total: true, grossProfit: true },
    }),
    prisma.finance.findMany({
      where: { type: "EGRESO", date: { gte: from, lte: to }, ...scope },
      select: { amount: true, category: true },
    }),
  ]);

  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const grossProfit = sales.reduce((s, x) => s + x.grossProfit, 0);
  const totalExpenses = expenses.reduce((s, x) => s + Math.abs(x.amount), 0);
  const netProfit = grossProfit - totalExpenses;

  const expensesByCategory: Record<string, number> = {};
  for (const e of expenses) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + Math.abs(e.amount);
  }

  return {
    period: { from, to },
    revenue: round2(revenue),
    cogs: round2(revenue - grossProfit),
    grossProfit: round2(grossProfit),
    grossMarginPercent: safeMargin(revenue, revenue - grossProfit),
    totalExpenses: round2(totalExpenses),
    netProfit: round2(netProfit),
    netMarginPercent: revenue > 0 ? round2((netProfit / revenue) * 100) : 0,
    expensesByCategory: Object.entries(expensesByCategory)
      .map(([category, amount]) => ({
        category,
        amount: round2(amount),
        percentOfRevenue: revenue > 0 ? round2((amount / revenue) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}

async function getProfitabilityByProduct(from: Date, to: Date, limit = 20) {
  const scope = tenantScope();
  const items = await prisma.saleItem.findMany({
    where: { sale: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope } },
    select: {
      productId: true, quantity: true, quantityKg: true, subtotal: true, profit: true,
      product: {
        select: {
          id: true, name: true, sku: true, saleUnit: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  const byProduct: Record<string, { product: any; revenue: number; profit: number; qty: number; qtyKg: number }> = {};
  for (const i of items) {
    if (!byProduct[i.productId]) byProduct[i.productId] = { product: i.product, revenue: 0, profit: 0, qty: 0, qtyKg: 0 };
    byProduct[i.productId].revenue += i.subtotal;
    byProduct[i.productId].profit += i.profit;
    byProduct[i.productId].qty += i.quantity;
    byProduct[i.productId].qtyKg += i.quantityKg ?? 0;
  }

  return Object.values(byProduct)
    .map((d) => ({
      product: d.product,
      revenue: round2(d.revenue),
      profit: round2(d.profit),
      marginPercent: safeMargin(d.revenue, d.revenue - d.profit),
      quantitySold: d.qty,
      quantityKgSold: round2(d.qtyKg),
    }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit);
}

async function getProfitabilityByCategory(from: Date, to: Date) {
  const scope = tenantScope();
  const items = await prisma.saleItem.findMany({
    where: { sale: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope } },
    select: {
      subtotal: true, profit: true, quantity: true,
      product: { select: { category: { select: { id: true, name: true } } } },
    },
  });

  const byCategory: Record<string, { name: string; revenue: number; profit: number; qty: number }> = {};
  for (const i of items) {
    const cat = i.product?.category;
    const key = cat?.id ?? "SIN_CATEGORIA";
    if (!byCategory[key]) byCategory[key] = { name: cat?.name ?? "Sin categoría", revenue: 0, profit: 0, qty: 0 };
    byCategory[key].revenue += i.subtotal;
    byCategory[key].profit += i.profit;
    byCategory[key].qty += i.quantity;
  }

  return Object.entries(byCategory)
    .map(([id, d]) => ({
      categoryId: id,
      categoryName: d.name,
      revenue: round2(d.revenue),
      profit: round2(d.profit),
      marginPercent: safeMargin(d.revenue, d.revenue - d.profit),
      unitsSold: d.qty,
    }))
    .sort((a, b) => b.profit - a.profit);
}

async function getProfitabilityTrend(from: Date, to: Date, granularity: Granularity = "month") {
  const scope = tenantScope();
  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope },
      select: { total: true, grossProfit: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.finance.findMany({
      where: { type: "EGRESO", date: { gte: from, lte: to }, ...scope },
      select: { amount: true, date: true },
    }),
  ]);

  const grouped: Record<string, { revenue: number; grossProfit: number; expenses: number }> = {};
  for (const s of sales) {
    const k = getGroupKey(s.createdAt, granularity);
    if (!grouped[k]) grouped[k] = { revenue: 0, grossProfit: 0, expenses: 0 };
    grouped[k].revenue += s.total;
    grouped[k].grossProfit += s.grossProfit;
  }
  for (const e of expenses) {
    const k = getGroupKey(e.date, granularity);
    if (!grouped[k]) grouped[k] = { revenue: 0, grossProfit: 0, expenses: 0 };
    grouped[k].expenses += Math.abs(e.amount);
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, d]) => ({
      period,
      revenue: round2(d.revenue),
      grossProfit: round2(d.grossProfit),
      grossMarginPercent: safeMargin(d.revenue, d.revenue - d.grossProfit),
      expenses: round2(d.expenses),
      netProfit: round2(d.grossProfit - d.expenses),
    }));
}

async function getExpensesBreakdown(from: Date, to: Date) {
  const scope = tenantScope();
  const expenses = await prisma.finance.findMany({
    where: { type: "EGRESO", date: { gte: from, lte: to }, ...scope },
    select: { amount: true, category: true, description: true, date: true, paymentMethod: true },
    orderBy: { date: "desc" },
  });

  const total = expenses.reduce((s, x) => s + Math.abs(x.amount), 0);
  const byCategory: Record<string, { amount: number; count: number }> = {};
  for (const e of expenses) {
    if (!byCategory[e.category]) byCategory[e.category] = { amount: 0, count: 0 };
    byCategory[e.category].amount += Math.abs(e.amount);
    byCategory[e.category].count++;
  }

  return {
    total: round2(total),
    byCategory: Object.entries(byCategory)
      .map(([category, d]) => ({
        category,
        amount: round2(d.amount),
        count: d.count,
        percentOfTotal: total > 0 ? round2((d.amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount),
    entries: expenses.map((e) => ({ ...e, amount: round2(Math.abs(e.amount)) })),
  };
}

async function getLowMarginProducts(threshold = 20) {
  const scope = tenantScope();
  const items = await prisma.saleItem.findMany({
    where: { sale: { status: "COMPLETED", ...scope } },
    select: {
      productId: true, subtotal: true, profit: true, quantity: true,
      product: {
        select: {
          id: true, name: true, sku: true, price: true, purchasePrice: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  const byProduct: Record<string, { product: any; revenue: number; profit: number; qty: number }> = {};
  for (const i of items) {
    if (!byProduct[i.productId]) byProduct[i.productId] = { product: i.product, revenue: 0, profit: 0, qty: 0 };
    byProduct[i.productId].revenue += i.subtotal;
    byProduct[i.productId].profit += i.profit;
    byProduct[i.productId].qty += i.quantity;
  }

  return Object.values(byProduct)
    .filter((d) => d.revenue > 0)
    .map((d) => ({
      product: d.product,
      revenue: round2(d.revenue),
      profit: round2(d.profit),
      marginPercent: safeMargin(d.revenue, d.revenue - d.profit),
      unitsSold: d.qty,
      currentListMargin:
        d.product?.purchasePrice > 0 && d.product?.price > 0
          ? safeMargin(d.product.price, d.product.purchasePrice)
          : null,
    }))
    .filter((d) => d.marginPercent >= 0 && d.marginPercent < threshold)
    .sort((a, b) => a.marginPercent - b.marginPercent);
}

// ─── GROUP 4: CLIENTS ──────────────────────────────────────────────────────────

async function getTopClients(from: Date, to: Date, limit = 10) {
  const scope = tenantScope();
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, clientId: { not: null }, ...scope },
    select: {
      total: true, grossProfit: true, clientId: true,
      client: { select: { id: true, nombre: true, apellido: true, dni: true, category: true, currentBalance: true } },
    },
  });

  const byClient: Record<string, { client: any; revenue: number; profit: number; count: number }> = {};
  for (const s of sales) {
    if (!s.clientId) continue;
    if (!byClient[s.clientId]) byClient[s.clientId] = { client: s.client, revenue: 0, profit: 0, count: 0 };
    byClient[s.clientId].revenue += s.total;
    byClient[s.clientId].profit += s.grossProfit;
    byClient[s.clientId].count++;
  }

  return Object.values(byClient)
    .map((d) => ({
      client: d.client,
      revenue: round2(d.revenue),
      grossProfit: round2(d.profit),
      salesCount: d.count,
      avgTicket: d.count > 0 ? round2(d.revenue / d.count) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

async function getNewVsReturningClients(from: Date, to: Date) {
  const scope = tenantScope();
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, clientId: { not: null }, ...scope },
    select: { clientId: true, total: true, client: { select: { createdAt: true } } },
  });

  const newClientIds = new Set<string>();
  const returningClientIds = new Set<string>();
  let newRevenue = 0;
  let returningRevenue = 0;

  for (const s of sales) {
    if (!s.clientId || !s.client) continue;
    const isNew = s.client.createdAt >= from && s.client.createdAt <= to;
    if (isNew) {
      newClientIds.add(s.clientId);
      newRevenue += s.total;
    } else {
      returningClientIds.add(s.clientId);
      returningRevenue += s.total;
    }
  }

  const total = newClientIds.size + returningClientIds.size;
  return {
    newClients: newClientIds.size,
    returningClients: returningClientIds.size,
    newRevenue: round2(newRevenue),
    returningRevenue: round2(returningRevenue),
    newClientsPercent: total > 0 ? round2((newClientIds.size / total) * 100) : 0,
  };
}

async function getInactiveClients(days = 60) {
  const scope = tenantScope();
  const cutoff = daysAgo(days);

  const clients = await prisma.client.findMany({
    where: { ...scope },
    select: {
      id: true, nombre: true, apellido: true, dni: true, telefono: true, gmail: true,
      category: true, currentBalance: true,
      sales: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, total: true },
      },
    },
  });

  return clients
    .filter((c) => {
      const lastSale = c.sales[0]?.createdAt;
      return !lastSale || lastSale < cutoff;
    })
    .map((c) => ({
      client: {
        id: c.id, nombre: c.nombre, apellido: c.apellido, dni: c.dni,
        telefono: c.telefono, gmail: c.gmail, category: c.category, currentBalance: c.currentBalance,
      },
      lastSaleDate: c.sales[0]?.createdAt ?? null,
      lastSaleAmount: c.sales[0]?.total ?? null,
      daysSinceLastSale: c.sales[0]?.createdAt
        ? Math.floor((Date.now() - new Date(c.sales[0].createdAt).getTime()) / 86400000)
        : null,
      hasDebt: c.currentBalance > 0,
    }))
    .sort((a, b) => (b.daysSinceLastSale ?? 999999) - (a.daysSinceLastSale ?? 999999));
}

async function getClientLTV(limit = 20) {
  const scope = tenantScope();
  const clients = await prisma.client.findMany({
    where: { ...scope },
    select: {
      id: true, nombre: true, apellido: true, dni: true, category: true, currentBalance: true,
      sales: {
        where: { status: "COMPLETED" },
        select: { total: true, grossProfit: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return clients
    .filter((c) => c.sales.length > 0)
    .map((c) => {
      const totalRevenue = c.sales.reduce((s, x) => s + x.total, 0);
      const totalProfit = c.sales.reduce((s, x) => s + x.grossProfit, 0);
      const first = c.sales[0].createdAt;
      const last = c.sales[c.sales.length - 1].createdAt;
      const monthsActive = Math.max(
        1,
        (new Date(last).getTime() - new Date(first).getTime()) / (1000 * 60 * 60 * 24 * 30)
      );

      return {
        client: { id: c.id, nombre: c.nombre, apellido: c.apellido, dni: c.dni, category: c.category },
        totalRevenue: round2(totalRevenue),
        totalProfit: round2(totalProfit),
        salesCount: c.sales.length,
        avgTicket: round2(totalRevenue / c.sales.length),
        avgMonthlyRevenue: round2(totalRevenue / monthsActive),
        firstSaleDate: first,
        lastSaleDate: last,
        currentBalance: c.currentBalance,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);
}

async function getClientPurchaseFrequency() {
  const scope = tenantScope();
  const clients = await prisma.client.findMany({
    where: { ...scope },
    select: {
      id: true, nombre: true, apellido: true, category: true,
      sales: {
        where: { status: "COMPLETED" },
        select: { createdAt: true, total: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return clients
    .filter((c) => c.sales.length > 1)
    .map((c) => {
      const dates = c.sales.map((s) => new Date(s.createdAt).getTime());
      let totalGap = 0;
      for (let i = 1; i < dates.length; i++) totalGap += dates[i] - dates[i - 1];
      const avgGapDays = totalGap / (dates.length - 1) / 86400000;

      return {
        client: { id: c.id, nombre: c.nombre, apellido: c.apellido, category: c.category },
        salesCount: c.sales.length,
        avgDaysBetweenPurchases: round2(avgGapDays),
        firstSale: c.sales[0].createdAt,
        lastSale: c.sales[c.sales.length - 1].createdAt,
      };
    })
    .sort((a, b) => a.avgDaysBetweenPurchases - b.avgDaysBetweenPurchases);
}

async function getClientsByCategory(from: Date, to: Date) {
  const scope = tenantScope();
  const sales = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, clientId: { not: null }, ...scope },
    select: {
      total: true, grossProfit: true,
      client: { select: { category: true } },
    },
  });

  const byCategory: Record<string, { revenue: number; profit: number; count: number; clients: Set<string> }> = {};
  const salesWithClient = await prisma.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, clientId: { not: null }, ...scope },
    select: { total: true, grossProfit: true, clientId: true, client: { select: { category: true } } },
  });

  for (const s of salesWithClient) {
    const cat = s.client?.category ?? "SIN_CATEGORIA";
    if (!byCategory[cat]) byCategory[cat] = { revenue: 0, profit: 0, count: 0, clients: new Set() };
    byCategory[cat].revenue += s.total;
    byCategory[cat].profit += s.grossProfit;
    byCategory[cat].count++;
    if (s.clientId) byCategory[cat].clients.add(s.clientId);
  }

  return Object.entries(byCategory).map(([category, d]) => ({
    category,
    revenue: round2(d.revenue),
    grossProfit: round2(d.profit),
    grossMarginPercent: safeMargin(d.revenue, d.revenue - d.profit),
    salesCount: d.count,
    uniqueClients: d.clients.size,
    avgTicket: d.count > 0 ? round2(d.revenue / d.count) : 0,
  }));
}

async function getDebtAging() {
  const scope = tenantScope();
  const clients = await prisma.client.findMany({
    where: { currentBalance: { gt: 0 }, ...scope },
    select: {
      id: true, nombre: true, apellido: true, dni: true, telefono: true,
      currentBalance: true, creditLimit: true,
      accountMovements: {
        where: { type: "DEBT" },
        orderBy: { date: "desc" },
        take: 1,
        select: { date: true },
      },
    },
  });

  const now = Date.now();
  const buckets: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "+90": 0 };

  const details = clients.map((c) => {
    const lastDebt = c.accountMovements[0]?.date;
    const daysSince = lastDebt ? Math.floor((now - new Date(lastDebt).getTime()) / 86400000) : 999;

    let bucket: string;
    if (daysSince <= 30) bucket = "0-30";
    else if (daysSince <= 60) bucket = "31-60";
    else if (daysSince <= 90) bucket = "61-90";
    else bucket = "+90";

    buckets[bucket] += c.currentBalance;

    return {
      client: { id: c.id, nombre: c.nombre, apellido: c.apellido, dni: c.dni, telefono: c.telefono },
      balance: round2(c.currentBalance),
      creditLimit: c.creditLimit,
      overLimit: c.creditLimit ? c.currentBalance > c.creditLimit : false,
      daysSinceLastDebt: daysSince === 999 ? null : daysSince,
      agingBucket: bucket,
    };
  });

  const total = clients.reduce((s, c) => s + c.currentBalance, 0);

  return {
    totalDebt: round2(total),
    clientsWithDebt: clients.length,
    buckets: {
      "0-30": { amount: round2(buckets["0-30"]), label: "0-30 días (reciente)" },
      "31-60": { amount: round2(buckets["31-60"]), label: "31-60 días" },
      "61-90": { amount: round2(buckets["61-90"]), label: "61-90 días (riesgo medio)" },
      "+90": { amount: round2(buckets["+90"]), label: "+90 días (riesgo alto)" },
    },
    details: details.sort((a, b) => b.balance - a.balance),
  };
}

async function getCollectionRate(from: Date, to: Date) {
  const tenantId = currentTenantId();
  const [debt, payments] = await Promise.all([
    prisma.accountMovement.aggregate({
      where: { type: "DEBT", date: { gte: from, lte: to }, client: { tenantId: tenantId ?? undefined } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.accountMovement.aggregate({
      where: { type: "PAYMENT", date: { gte: from, lte: to }, client: { tenantId: tenantId ?? undefined } },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  const debtTotal = debt._sum.amount ?? 0;
  const collected = payments._sum.amount ?? 0;

  return {
    debtGenerated: round2(debtTotal),
    collected: round2(collected),
    collectionRate: debtTotal > 0 ? round2((collected / debtTotal) * 100) : 0,
    outstanding: round2(debtTotal - collected),
    debtTransactions: debt._count.id,
    paymentTransactions: payments._count.id,
  };
}

// ─── GROUP 5: INVENTORY ────────────────────────────────────────────────────────

// Suma el stock de un producto a traves de todas sus ubicaciones (ver doc
// de migracion "ubicaciones de stock dinamicas" - reemplaza
// stockLocal+stockDeposito, que ya no existen como columnas fijas).
function sumStock(stock: { quantity: number; quantityKg: number }[], isKg: boolean) {
  return stock.reduce((acc, row) => acc + (isKg ? row.quantityKg : row.quantity), 0);
}

async function getInventoryValue() {
  const scope = tenantScope();
  const products = await prisma.product.findMany({
    where: { isActive: true, isService: false, unlimitedStock: false, ...scope },
    select: {
      id: true, name: true, sku: true, saleUnit: true, purchasePrice: true, price: true,
      stock: { select: { quantity: true, quantityKg: true } },
      category: { select: { name: true } },
    },
  });

  let totalCostValue = 0;
  let totalSaleValue = 0;
  const byCategory: Record<string, { costValue: number; saleValue: number; items: number }> = {};

  const items = products.map((p) => {
    const isKg = p.saleUnit === "KG";
    const totalStock = sumStock(p.stock, isKg);
    const costValue = round2(totalStock * p.purchasePrice);
    const saleValue = round2(totalStock * p.price);

    totalCostValue += costValue;
    totalSaleValue += saleValue;

    const catName = p.category?.name ?? "Sin categoría";
    if (!byCategory[catName]) byCategory[catName] = { costValue: 0, saleValue: 0, items: 0 };
    byCategory[catName].costValue += costValue;
    byCategory[catName].saleValue += saleValue;
    byCategory[catName].items++;

    return {
      product: { id: p.id, name: p.name, sku: p.sku, saleUnit: p.saleUnit, category: p.category?.name },
      totalStock: round2(totalStock),
      purchasePrice: p.purchasePrice,
      salePrice: p.price,
      costValue,
      saleValue,
      potentialMarginPercent: saleValue > 0 ? safeMargin(saleValue, costValue) : 0,
    };
  });

  return {
    summary: {
      totalCostValue: round2(totalCostValue),
      totalSaleValue: round2(totalSaleValue),
      totalPotentialProfit: round2(totalSaleValue - totalCostValue),
      totalMarginPercent: safeMargin(totalSaleValue, totalCostValue),
      productCount: products.length,
    },
    byCategory: Object.entries(byCategory)
      .map(([name, d]) => ({
        category: name,
        costValue: round2(d.costValue),
        saleValue: round2(d.saleValue),
        items: d.items,
      }))
      .sort((a, b) => b.costValue - a.costValue),
    items: items.sort((a, b) => b.costValue - a.costValue),
  };
}

async function getDeadStock(days = 45) {
  const scope = tenantScope();
  const cutoff = daysAgo(days);
  const tenantId = currentTenantId();

  const products = await prisma.product.findMany({
    where: { isActive: true, isService: false, unlimitedStock: false, ...scope },
    select: {
      id: true, name: true, sku: true, saleUnit: true, purchasePrice: true,
      stock: { select: { quantity: true, quantityKg: true } },
      category: { select: { name: true } },
      StockMovement: {
        where: { type: "SALE", createdAt: { gte: cutoff }, tenantId: tenantId ?? undefined },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const dead = products.filter((p) => {
    const stock = sumStock(p.stock, p.saleUnit === "KG");
    return stock > 0 && p.StockMovement.length === 0;
  });

  const totalImmobilizedValue = dead.reduce((s, p) => {
    const stock = sumStock(p.stock, p.saleUnit === "KG");
    return s + stock * p.purchasePrice;
  }, 0);

  return {
    dayThreshold: days,
    deadStockCount: dead.length,
    totalImmobilizedValue: round2(totalImmobilizedValue),
    products: dead
      .map((p) => {
        const stock = sumStock(p.stock, p.saleUnit === "KG");
        return {
          product: { id: p.id, name: p.name, sku: p.sku, saleUnit: p.saleUnit, category: p.category?.name },
          totalStock: round2(stock),
          immobilizedValue: round2(stock * p.purchasePrice),
        };
      })
      .sort((a, b) => b.immobilizedValue - a.immobilizedValue),
  };
}

// Una fila por cada (producto, ubicacion) por debajo de su propio minimo -
// generalizado a N ubicaciones dinamicas, reemplaza el chequeo fijo
// LOCAL/DEPOSITO (ver doc de migracion "ubicaciones de stock dinamicas").
async function getLowStock() {
  const scope = tenantScope();
  const products = await prisma.product.findMany({
    where: { isActive: true, isService: false, unlimitedStock: false, ...scope },
    select: {
      id: true, name: true, sku: true, saleUnit: true, purchasePrice: true, price: true,
      category: { select: { name: true } },
      stock: { include: { businessLocation: { select: { id: true, name: true } } } },
    },
  });

  const rows: {
    product: { id: string; name: string; sku: string | null; saleUnit: string; category?: string };
    location: { id: string; name: string };
    stock: number;
    minStock: number;
    deficit: number;
    restockCost: number;
  }[] = [];

  for (const p of products) {
    const isKg = p.saleUnit === "KG";
    for (const s of p.stock) {
      const qty = isKg ? s.quantityKg : s.quantity;
      const min = isKg ? s.minQuantityKg : s.minQuantity;
      if (min == null || min <= 0 || qty >= min) continue;

      const deficit = Math.max(0, min - qty);
      rows.push({
        product: { id: p.id, name: p.name, sku: p.sku, saleUnit: p.saleUnit, category: p.category?.name },
        location: s.businessLocation,
        stock: round2(qty),
        minStock: min,
        deficit: round2(deficit),
        restockCost: round2(deficit * p.purchasePrice),
      });
    }
  }

  return rows.sort((a, b) => b.restockCost - a.restockCost);
}

async function getInventoryRotation(from: Date, to: Date) {
  const scope = tenantScope();
  const [items, products] = await Promise.all([
    prisma.saleItem.findMany({
      where: { sale: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope } },
      select: { productId: true, quantity: true, quantityKg: true, subtotal: true, profit: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, isService: false, unlimitedStock: false, ...scope },
      select: {
        id: true, name: true, sku: true, saleUnit: true, purchasePrice: true,
        stock: { select: { quantity: true, quantityKg: true } },
        category: { select: { name: true } },
      },
    }),
  ]);

  const salesMap: Record<string, { revenue: number; profit: number; qty: number; qtyKg: number }> = {};
  for (const i of items) {
    if (!salesMap[i.productId]) salesMap[i.productId] = { revenue: 0, profit: 0, qty: 0, qtyKg: 0 };
    salesMap[i.productId].revenue += i.subtotal;
    salesMap[i.productId].profit += i.profit;
    salesMap[i.productId].qty += i.quantity;
    salesMap[i.productId].qtyKg += i.quantityKg ?? 0;
  }

  const days = Math.max(1, (to.getTime() - from.getTime()) / 86400000);

  return products
    .map((p) => {
      const isKg = p.saleUnit === "KG";
      const currentStock = sumStock(p.stock, isKg);
      const s = salesMap[p.id];
      const qtySold = s ? (isKg ? s.qtyKg : s.qty) : 0;

      return {
        product: { id: p.id, name: p.name, sku: p.sku, saleUnit: p.saleUnit, category: p.category?.name },
        currentStock: round2(currentStock),
        qtySold: round2(qtySold),
        rotationIndex: currentStock > 0 ? round2(qtySold / currentStock) : null,
        turnoverDays: qtySold > 0 && currentStock > 0 ? round2((currentStock / qtySold) * days) : null,
        revenue: s ? round2(s.revenue) : 0,
        marginPercent: s ? safeMargin(s.revenue, s.revenue - s.profit) : 0,
      };
    })
    .sort((a, b) => (b.rotationIndex ?? -1) - (a.rotationIndex ?? -1));
}

// ─── GROUP 6: PURCHASES ────────────────────────────────────────────────────────

async function getPurchasesSummary(from: Date, to: Date) {
  const scope = tenantScope();
  const purchases = await prisma.purchase.findMany({
    where: { status: "COMPLETED", date: { gte: from, lte: to }, ...scope },
    select: { id: true, providerName: true, totalAmount: true, date: true, paymentMethod: true },
    orderBy: { date: "desc" },
  });

  const total = purchases.reduce((s, p) => s + p.totalAmount, 0);
  const byProvider: Record<string, { count: number; total: number }> = {};
  for (const p of purchases) {
    const key = p.providerName ?? "Sin proveedor";
    if (!byProvider[key]) byProvider[key] = { count: 0, total: 0 };
    byProvider[key].count++;
    byProvider[key].total += p.totalAmount;
  }

  return {
    period: { from, to },
    purchaseCount: purchases.length,
    totalSpent: round2(total),
    avgPurchaseAmount: purchases.length > 0 ? round2(total / purchases.length) : 0,
    byProvider: Object.entries(byProvider)
      .map(([name, d]) => ({
        provider: name,
        purchaseCount: d.count,
        totalSpent: round2(d.total),
        percentOfTotal: total > 0 ? round2((d.total / total) * 100) : 0,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent),
  };
}

async function getPurchasesVsSales(from: Date, to: Date, granularity: Granularity = "month") {
  const scope = tenantScope();
  const [purchases, sales] = await Promise.all([
    prisma.purchase.findMany({
      where: { status: "COMPLETED", date: { gte: from, lte: to }, ...scope },
      select: { totalAmount: true, date: true },
    }),
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, ...scope },
      select: { total: true, grossProfit: true, createdAt: true },
    }),
  ]);

  const grouped: Record<string, { purchases: number; salesRevenue: number; grossProfit: number }> = {};
  for (const p of purchases) {
    const k = getGroupKey(p.date, granularity);
    if (!grouped[k]) grouped[k] = { purchases: 0, salesRevenue: 0, grossProfit: 0 };
    grouped[k].purchases += p.totalAmount;
  }
  for (const s of sales) {
    const k = getGroupKey(s.createdAt, granularity);
    if (!grouped[k]) grouped[k] = { purchases: 0, salesRevenue: 0, grossProfit: 0 };
    grouped[k].salesRevenue += s.total;
    grouped[k].grossProfit += s.grossProfit;
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, d]) => ({
      period,
      purchases: round2(d.purchases),
      salesRevenue: round2(d.salesRevenue),
      grossProfit: round2(d.grossProfit),
      purchaseToSalesRatio: d.salesRevenue > 0 ? round2((d.purchases / d.salesRevenue) * 100) : null,
    }));
}

async function getProductPriceEvolution(productId: string) {
  const scope = tenantScope();
  const [product, items] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, ...scope },
      select: { id: true, name: true, sku: true, price: true, purchasePrice: true, saleUnit: true },
    }),
    prisma.purchaseItem.findMany({
      where: { productId, purchase: { ...scope } },
      select: {
        unitCost: true, quantity: true, quantityKg: true, createdAt: true,
        purchase: { select: { date: true, providerName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    product,
    priceHistory: items.map((i) => ({
      date: i.purchase.date,
      provider: i.purchase.providerName,
      unitCost: i.unitCost,
      quantity: i.quantity ?? i.quantityKg,
      impliedMargin: product?.price ? safeMargin(product.price, i.unitCost) : null,
    })),
  };
}

async function getCostTrend(from: Date, to: Date, granularity: Granularity = "month") {
  const scope = tenantScope();
  const [purchases, expenses] = await Promise.all([
    prisma.purchase.findMany({
      where: { status: "COMPLETED", date: { gte: from, lte: to }, ...scope },
      select: { totalAmount: true, date: true },
    }),
    prisma.finance.findMany({
      where: { type: "EGRESO", date: { gte: from, lte: to }, ...scope },
      select: { amount: true, category: true, date: true },
    }),
  ]);

  const grouped: Record<string, { purchases: number; operational: number }> = {};
  for (const p of purchases) {
    const k = getGroupKey(p.date, granularity);
    if (!grouped[k]) grouped[k] = { purchases: 0, operational: 0 };
    grouped[k].purchases += p.totalAmount;
  }
  for (const e of expenses) {
    if (e.category === "CompraMercaderia") continue;
    const k = getGroupKey(e.date, granularity);
    if (!grouped[k]) grouped[k] = { purchases: 0, operational: 0 };
    grouped[k].operational += Math.abs(e.amount);
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, d]) => ({
      period,
      purchases: round2(d.purchases),
      operationalExpenses: round2(d.operational),
      totalCosts: round2(d.purchases + d.operational),
    }));
}

// ─── GROUP 7: CASHFLOW ─────────────────────────────────────────────────────────

async function getCashflowSummary(from: Date, to: Date) {
  const scope = tenantScope();
  const tenantId = currentTenantId();

  const [revenues, expenses, accountPayments] = await Promise.all([
    prisma.finance.findMany({
      where: { type: "INGRESO", date: { gte: from, lte: to }, ...scope },
      select: { amount: true, category: true, paymentMethod: true },
    }),
    prisma.finance.findMany({
      where: { type: "EGRESO", date: { gte: from, lte: to }, ...scope },
      select: { amount: true, category: true },
    }),
    prisma.accountMovement.aggregate({
      where: { type: "PAYMENT", date: { gte: from, lte: to }, client: { tenantId: tenantId ?? undefined } },
      _sum: { amount: true },
    }),
  ]);

  const totalIn = revenues.reduce((s, x) => s + x.amount, 0);
  const totalOut = expenses.reduce((s, x) => s + Math.abs(x.amount), 0);
  const realCashIn = revenues
    .filter((r) => r.paymentMethod !== "CUENTA_CORRIENTE")
    .reduce((s, x) => s + x.amount, 0);

  const revenueByCategory: Record<string, number> = {};
  for (const r of revenues) revenueByCategory[r.category] = (revenueByCategory[r.category] ?? 0) + r.amount;

  const expenseByCategory: Record<string, number> = {};
  for (const e of expenses) expenseByCategory[e.category] = (expenseByCategory[e.category] ?? 0) + Math.abs(e.amount);

  return {
    period: { from, to },
    totalIncome: round2(totalIn),
    totalExpenses: round2(totalOut),
    netCashflow: round2(totalIn - totalOut),
    realCashIn: round2(realCashIn),
    accountsReceivableGenerated: round2(totalIn - realCashIn),
    accountsReceivableCollected: round2(accountPayments._sum.amount ?? 0),
    revenueByCategory: Object.entries(revenueByCategory)
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    expenseByCategory: Object.entries(expenseByCategory)
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
  };
}

async function getCashflowTrend(from: Date, to: Date, granularity: Granularity = "month") {
  const scope = tenantScope();
  const [revenues, expenses] = await Promise.all([
    prisma.finance.findMany({
      where: { type: "INGRESO", date: { gte: from, lte: to }, ...scope },
      select: { amount: true, date: true, paymentMethod: true },
    }),
    prisma.finance.findMany({
      where: { type: "EGRESO", date: { gte: from, lte: to }, ...scope },
      select: { amount: true, date: true },
    }),
  ]);

  const grouped: Record<string, { income: number; expenses: number; realCash: number }> = {};
  for (const r of revenues) {
    const k = getGroupKey(r.date, granularity);
    if (!grouped[k]) grouped[k] = { income: 0, expenses: 0, realCash: 0 };
    grouped[k].income += r.amount;
    if (r.paymentMethod !== "CUENTA_CORRIENTE") grouped[k].realCash += r.amount;
  }
  for (const e of expenses) {
    const k = getGroupKey(e.date, granularity);
    if (!grouped[k]) grouped[k] = { income: 0, expenses: 0, realCash: 0 };
    grouped[k].expenses += Math.abs(e.amount);
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, d]) => ({
      period,
      income: round2(d.income),
      expenses: round2(d.expenses),
      net: round2(d.income - d.expenses),
      realCashIn: round2(d.realCash),
    }));
}

async function getPendingReceivables() {
  const scope = tenantScope();
  const clients = await prisma.client.findMany({
    where: { currentBalance: { gt: 0 }, ...scope },
    select: {
      id: true, nombre: true, apellido: true, dni: true, telefono: true,
      currentBalance: true, creditLimit: true, category: true,
      accountMovements: {
        where: { type: "DEBT" },
        orderBy: { date: "desc" },
        take: 1,
        select: { date: true },
      },
    },
    orderBy: { currentBalance: "desc" },
  });

  const total = clients.reduce((s, c) => s + c.currentBalance, 0);

  return {
    totalPending: round2(total),
    clientCount: clients.length,
    clients: clients.map((c) => ({
      id: c.id, nombre: c.nombre, apellido: c.apellido, dni: c.dni, telefono: c.telefono,
      balance: round2(c.currentBalance), creditLimit: c.creditLimit, category: c.category,
      lastDebtDate: c.accountMovements[0]?.date ?? null,
    })),
  };
}

async function getBurnRate() {
  const scope = tenantScope();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const expenses = await prisma.finance.findMany({
    where: { type: "EGRESO", date: { gte: threeMonthsAgo }, ...scope },
    select: { amount: true, category: true },
  });

  const FIXED_CATEGORIES = ["AlquilerL1", "AlquilerF1", "Alarma", "Sueldos", "Contadora", "Arca"];
  const fixedTotal = expenses
    .filter((e) => FIXED_CATEGORIES.includes(e.category))
    .reduce((s, e) => s + Math.abs(e.amount), 0);
  const variableTotal = expenses
    .filter((e) => !FIXED_CATEGORIES.includes(e.category))
    .reduce((s, e) => s + Math.abs(e.amount), 0);

  const fixedBreakdown = expenses
    .filter((e) => FIXED_CATEGORIES.includes(e.category))
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + Math.abs(e.amount);
      return acc;
    }, {});

  return {
    basedOnLastMonths: 3,
    monthlyBurnRate: round2((fixedTotal + variableTotal) / 3),
    monthlyFixedCosts: round2(fixedTotal / 3),
    monthlyVariableCosts: round2(variableTotal / 3),
    fixedCostBreakdown: Object.fromEntries(
      Object.entries(fixedBreakdown).map(([k, v]) => [k, round2(v / 3)])
    ),
  };
}

// ─── GROUP 8: INSIGHTS ─────────────────────────────────────────────────────────

async function getInsights() {
  const scope = tenantScope();
  const thirtyDaysAgo = daysAgo(30);
  const insights: Array<{
    type: string;
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    data?: any;
  }> = [];

  // 1. High-volume products with low margin
  const recentItems = await prisma.saleItem.findMany({
    where: { sale: { status: "COMPLETED", createdAt: { gte: thirtyDaysAgo }, ...scope } },
    select: { productId: true, quantity: true, subtotal: true, profit: true, product: { select: { name: true } } },
  });
  const productMap: Record<string, { name: string; revenue: number; profit: number; qty: number }> = {};
  for (const i of recentItems) {
    if (!productMap[i.productId]) productMap[i.productId] = { name: i.product?.name ?? "", revenue: 0, profit: 0, qty: 0 };
    productMap[i.productId].revenue += i.subtotal;
    productMap[i.productId].profit += i.profit;
    productMap[i.productId].qty += i.quantity;
  }
  const lowMarginHighVol = Object.entries(productMap)
    .map(([id, d]) => ({ id, ...d, margin: safeMargin(d.revenue, d.revenue - d.profit) }))
    .filter((d) => d.margin < 15 && d.margin >= 0 && d.qty > 5)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  if (lowMarginHighVol.length > 0) {
    insights.push({
      type: "LOW_MARGIN_HIGH_VOLUME",
      severity: "high",
      title: "Productos populares con margen bajo",
      description: `${lowMarginHighVol.length} producto(s) entre los más vendidos tienen margen menor al 15%. Aumentar el precio o renegociar con el proveedor puede mejorar la rentabilidad.`,
      data: lowMarginHighVol,
    });
  }

  // 2. High-value clients inactive > 60 days
  const allClients = await prisma.client.findMany({
    where: { ...scope },
    select: {
      id: true, nombre: true, apellido: true, telefono: true,
      sales: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { total: true, createdAt: true },
      },
    },
  });
  const highValueInactive = allClients
    .filter((c) => {
      const last = c.sales[0];
      if (!last || c.sales.length < 2) return false;
      const daysSince = (Date.now() - new Date(last.createdAt).getTime()) / 86400000;
      const avg = c.sales.reduce((s, x) => s + x.total, 0) / c.sales.length;
      return daysSince > 60 && avg > 5000;
    })
    .slice(0, 5);

  if (highValueInactive.length > 0) {
    insights.push({
      type: "INACTIVE_HIGH_VALUE_CLIENTS",
      severity: "high",
      title: "Clientes de alto valor sin actividad reciente",
      description: `${highValueInactive.length} cliente(s) con ticket promedio alto no compraron en más de 60 días.`,
      data: highValueInactive.map((c) => ({
        id: c.id, nombre: c.nombre, apellido: c.apellido, telefono: c.telefono,
        lastSale: c.sales[0]?.createdAt,
      })),
    });
  }

  // 3. Dead stock with high value
  const deadProducts = await prisma.product.findMany({
    where: { isActive: true, isService: false, unlimitedStock: false, ...scope },
    select: {
      id: true, name: true, purchasePrice: true, saleUnit: true,
      stock: { select: { quantity: true, quantityKg: true } },
      StockMovement: {
        where: { type: "SALE", createdAt: { gte: daysAgo(60) } },
        take: 1,
        select: { id: true },
      },
    },
  });
  const deadHighValue = deadProducts
    .filter((p) => {
      const stock = sumStock(p.stock, p.saleUnit === "KG");
      return stock > 0 && p.StockMovement.length === 0 && stock * p.purchasePrice > 5000;
    })
    .map((p) => {
      const stock = sumStock(p.stock, p.saleUnit === "KG");
      return { id: p.id, name: p.name, stock: round2(stock), immobilizedValue: round2(stock * p.purchasePrice) };
    })
    .sort((a, b) => b.immobilizedValue - a.immobilizedValue)
    .slice(0, 5);

  if (deadHighValue.length > 0) {
    const totalVal = deadHighValue.reduce((s, x) => s + x.immobilizedValue, 0);
    insights.push({
      type: "DEAD_STOCK_HIGH_VALUE",
      severity: "medium",
      title: "Stock inmovilizado de alto valor",
      description: `$${round2(totalVal).toLocaleString("es-AR")} en mercadería sin movimiento hace más de 60 días.`,
      data: deadHighValue,
    });
  }

  // 4. Month-over-month revenue decline
  const now = new Date();
  const [lastMonth, prevMonth] = await Promise.all([
    prisma.sale.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          lte: new Date(now.getFullYear(), now.getMonth(), 0),
        },
        ...scope,
      },
      _sum: { total: true },
    }),
    prisma.sale.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth() - 2, 1),
          lte: new Date(now.getFullYear(), now.getMonth() - 1, 0),
        },
        ...scope,
      },
      _sum: { total: true },
    }),
  ]);

  const lastRev = lastMonth._sum.total ?? 0;
  const prevRev = prevMonth._sum.total ?? 0;
  if (prevRev > 0 && lastRev < prevRev * 0.85) {
    const drop = round2(((prevRev - lastRev) / prevRev) * 100);
    insights.push({
      type: "REVENUE_DECLINE",
      severity: "high",
      title: "Caída de ingresos mes a mes",
      description: `Los ingresos del mes pasado cayeron un ${drop}% respecto al mes anterior.`,
      data: { lastMonth: round2(lastRev), previousMonth: round2(prevRev), dropPercent: drop },
    });
  }

  return insights;
}

async function getGrowthOpportunities() {
  const scope = tenantScope();
  const thirtyDaysAgo = daysAgo(30);
  const opportunities: Array<{
    type: string;
    title: string;
    description: string;
    potentialImpact: string;
    data?: any;
  }> = [];

  // 1. High-demand products near min stock
  const topSoldIds = await prisma.saleItem.groupBy({
    by: ["productId"],
    _sum: { quantity: true },
    where: { sale: { status: "COMPLETED", createdAt: { gte: thirtyDaysAgo }, ...scope } },
    orderBy: { _sum: { quantity: "desc" } },
    take: 20,
  });

  const topProducts = await prisma.product.findMany({
    where: { id: { in: topSoldIds.map((i) => i.productId) }, ...scope },
    select: {
      id: true, name: true, price: true, purchasePrice: true, saleUnit: true,
      stock: { select: { quantity: true, minQuantity: true } },
    },
  });

  const highDemandLowStock = topProducts.filter((p) => {
    if (p.saleUnit === "KG") return false;
    const total = p.stock.reduce((acc, row) => acc + row.quantity, 0);
    const min = p.stock.reduce((acc, row) => acc + (row.minQuantity ?? 0), 0);
    return min > 0 && total <= min * 1.2;
  });

  if (highDemandLowStock.length > 0) {
    opportunities.push({
      type: "HIGH_DEMAND_LOW_STOCK",
      title: "Productos populares con stock bajo",
      description: `${highDemandLowStock.length} de tus productos más vendidos están cerca o por debajo del stock mínimo. Reaprovisionar evita perder ventas.`,
      potentialImpact: "alto",
      data: highDemandLowStock,
    });
  }

  // 2. High-margin products underperforming (low qty, high margin)
  const allItems = await prisma.saleItem.findMany({
    where: { sale: { status: "COMPLETED", createdAt: { gte: thirtyDaysAgo }, ...scope } },
    select: { productId: true, quantity: true, profit: true, subtotal: true },
  });

  const marginMap: Record<string, { revenue: number; profit: number; qty: number }> = {};
  for (const i of allItems) {
    if (!marginMap[i.productId]) marginMap[i.productId] = { revenue: 0, profit: 0, qty: 0 };
    marginMap[i.productId].revenue += i.subtotal;
    marginMap[i.productId].profit += i.profit;
    marginMap[i.productId].qty += i.quantity;
  }

  const underperforming = Object.entries(marginMap)
    .filter(([, d]) => {
      const margin = safeMargin(d.revenue, d.revenue - d.profit);
      return margin > 40 && d.qty < 5;
    })
    .slice(0, 5);

  if (underperforming.length > 0) {
    const ids = underperforming.map(([id]) => id);
    const prods = await prisma.product.findMany({
      where: { id: { in: ids }, ...scope },
      select: { id: true, name: true, price: true },
    });
    opportunities.push({
      type: "UNDERPERFORMING_HIGH_MARGIN",
      title: "Productos con alto margen y baja rotación",
      description: `${underperforming.length} productos con margen >40% vendieron menos de 5 unidades el último mes. Promocionarlos aumenta rentabilidad sin bajar precio.`,
      potentialImpact: "alto",
      data: prods.map((p) => ({
        ...p,
        margin: safeMargin(marginMap[p.id].revenue, marginMap[p.id].revenue - marginMap[p.id].profit),
        qtySold: marginMap[p.id].qty,
      })),
    });
  }

  // 3. Inactive wholesale clients
  const wholesaleClients = await prisma.client.findMany({
    where: { category: "Mayorista", ...scope },
    select: {
      id: true, nombre: true, apellido: true, telefono: true,
      sales: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, total: true },
      },
    },
  });

  const inactiveWholesale = wholesaleClients.filter((c) => {
    const last = c.sales[0];
    if (!last) return true;
    return (Date.now() - new Date(last.createdAt).getTime()) / 86400000 > 30;
  });

  if (inactiveWholesale.length > 0) {
    opportunities.push({
      type: "INACTIVE_WHOLESALE_CLIENTS",
      title: "Clientes mayoristas inactivos",
      description: `${inactiveWholesale.length} cliente(s) mayoristas no compraron en los últimos 30 días. Alto volumen potencial.`,
      potentialImpact: "alto",
      data: inactiveWholesale.map((c) => ({
        id: c.id, nombre: c.nombre, apellido: c.apellido, telefono: c.telefono,
        lastSale: c.sales[0]?.createdAt ?? null,
      })),
    });
  }

  return opportunities;
}

async function getRiskAlerts() {
  const scope = tenantScope();
  const tenantId = currentTenantId();
  const risks: Array<{
    type: string;
    severity: "critical" | "high" | "medium";
    title: string;
    description: string;
    data?: any;
  }> = [];

  // 1. Clients over credit limit
  const debtors = await prisma.client.findMany({
    where: { isAccountEnabled: true, creditLimit: { gt: 0 }, currentBalance: { gt: 0 }, ...scope },
    select: { id: true, nombre: true, apellido: true, currentBalance: true, creditLimit: true, telefono: true },
  });
  const overLimit = debtors.filter((c) => c.creditLimit !== null && c.currentBalance > (c.creditLimit ?? 0));
  if (overLimit.length > 0) {
    risks.push({
      type: "CLIENTS_OVER_CREDIT_LIMIT",
      severity: "critical",
      title: "Clientes por encima del límite de crédito",
      description: `${overLimit.length} cliente(s) tienen deuda que supera su límite de crédito autorizado.`,
      data: overLimit.map((c) => ({
        ...c,
        excessAmount: round2(c.currentBalance - (c.creditLimit ?? 0)),
      })),
    });
  }

  // 2. Old debt > 90 days
  const oldDebtMovements = await prisma.accountMovement.findMany({
    where: {
      type: "DEBT",
      date: { lte: daysAgo(90) },
      client: { currentBalance: { gt: 0 }, tenantId: tenantId ?? undefined },
    },
    select: {
      amount: true, date: true,
      client: { select: { id: true, nombre: true, apellido: true, telefono: true, currentBalance: true } },
    },
    orderBy: { date: "asc" },
    take: 10,
  });
  if (oldDebtMovements.length > 0) {
    risks.push({
      type: "OLD_OUTSTANDING_DEBT",
      severity: "high",
      title: "Deuda de cuenta corriente mayor a 90 días",
      description: `${oldDebtMovements.length} movimiento(s) de deuda sin cobrar con más de 90 días. Riesgo alto de incobrabilidad.`,
      data: oldDebtMovements,
    });
  }

  // 3. Margin declining 3 consecutive months
  const now = new Date();
  const monthlyMargins = await Promise.all(
    [2, 1, 0].map((offset) => {
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
      return prisma.sale
        .aggregate({ where: { status: "COMPLETED", createdAt: { gte: start, lte: end }, ...scope }, _sum: { total: true, grossProfit: true } })
        .then((r) => ({
          label: start.toISOString().slice(0, 7),
          margin: safeMargin(r._sum.total ?? 0, (r._sum.total ?? 0) - (r._sum.grossProfit ?? 0)),
        }));
    })
  );
  // monthlyMargins[0] = 2 months ago, [1] = last month, [2] = this month
  const declining =
    monthlyMargins[2].margin < monthlyMargins[1].margin &&
    monthlyMargins[1].margin < monthlyMargins[0].margin;
  if (declining) {
    risks.push({
      type: "MARGIN_DECLINING",
      severity: "high",
      title: "Margen bruto en caída consecutiva",
      description: `El margen bajó 3 meses consecutivos: ${monthlyMargins[0].label} ${monthlyMargins[0].margin}% → ${monthlyMargins[1].label} ${monthlyMargins[1].margin}% → ${monthlyMargins[2].label} ${monthlyMargins[2].margin}%.`,
      data: monthlyMargins,
    });
  }

  // 4. Products below min stock count
  const allProducts = await prisma.product.findMany({
    where: { isActive: true, isService: false, unlimitedStock: false, ...scope },
    select: {
      saleUnit: true,
      stock: { select: { quantity: true, quantityKg: true, minQuantity: true, minQuantityKg: true } },
    },
  });
  const belowMin = allProducts.filter((p) =>
    p.stock.some((s) =>
      p.saleUnit === "KG"
        ? (s.minQuantityKg ?? 0) > 0 && s.quantityKg < (s.minQuantityKg ?? 0)
        : (s.minQuantity ?? 0) > 0 && s.quantity < (s.minQuantity ?? 0)
    )
  ).length;

  if (belowMin > 0) {
    risks.push({
      type: "LOW_STOCK_PRODUCTS",
      severity: "medium",
      title: "Productos bajo stock mínimo",
      description: `${belowMin} producto(s) están por debajo del stock mínimo. Riesgo de perder ventas.`,
      data: { count: belowMin },
    });
  }

  return risks;
}

export const analyticsService = {
  getDashboard,
  getSalesSummary,
  getSalesTrend,
  getSalesByPaymentMethod,
  getSalesByHour,
  getSalesByWeekday,
  getSalesByEmployee,
  getSalesByLocation,
  getSalesByPriceType,
  getSalesDiscounts,
  getSalesDelivery,
  getProfitabilitySummary,
  getProfitabilityByProduct,
  getProfitabilityByCategory,
  getProfitabilityTrend,
  getExpensesBreakdown,
  getLowMarginProducts,
  getTopClients,
  getNewVsReturningClients,
  getInactiveClients,
  getClientLTV,
  getClientPurchaseFrequency,
  getClientsByCategory,
  getDebtAging,
  getCollectionRate,
  getInventoryValue,
  getDeadStock,
  getLowStock,
  getInventoryRotation,
  getPurchasesSummary,
  getPurchasesVsSales,
  getProductPriceEvolution,
  getCostTrend,
  getCashflowSummary,
  getCashflowTrend,
  getPendingReceivables,
  getBurnRate,
  getInsights,
  getGrowthOpportunities,
  getRiskAlerts,
};
