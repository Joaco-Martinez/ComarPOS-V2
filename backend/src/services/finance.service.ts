import prisma from "../prisma";
import { CategoryFinance, FinanceType } from "@prisma/client";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Response } from "express";
import {
  formatDateAR,
  startOfDayAR,
  endOfDayAR,
  monthRangeAR,
  yearRangeAR,
  weekRangeAR,
} from "../utils/dateAR";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { cashSessionService } from "./cashSession.service";
import { COMARPOS_FOOTER_TEXT } from "../utils/comarposBranding";
function fmtKgAR(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
function pushQty(
  map: Map<string, { productId: string; product: any | null; qty: number }>,
  productId: string,
  qty: number,
  product?: any | null
) {
  if (!productId || !qty) return;
  const curr = map.get(productId);
  if (curr) {
    curr.qty += qty;
    if (!curr.product && product) curr.product = product;
  } else {
    map.set(productId, { productId, product: product ?? null, qty });
  }
}

export const financeService = {
  // --- CRUD ---
  async getAll() {
    return prisma.finance.findMany({
      where: { ...tenantScope() },
      orderBy: { createdAt: "desc" },
    });
  },

  async create(data: {
    type: FinanceType;
    amount: number;
    category: CategoryFinance;
    description?: string;
    date?: Date;
    paymentMethod?: string;
  }, userId?: string) {
    const finance = await prisma.finance.create({
      data: {
        type: data.type,
        amount: data.amount,
        category: data.category,
        description: data.description,
        date: data.date ?? new Date(),
        paymentMethod: data.paymentMethod as any,
        tenantId: currentTenantId(),
      },
    });

    // Un egreso pagado en EFECTIVO sale del cajon fisico -> se descuenta de la
    // caja abierta del usuario que lo cargo (si tiene una). Si se pago por
    // transferencia/tarjeta/etc, nunca toca la caja (ej: alquiler).
    if (finance.type === "EGRESO") {
      await cashSessionService.maybeLinkExpense({
        userId,
        paymentMethod: finance.paymentMethod,
        amount: finance.amount,
        description: finance.description ?? "Egreso",
        reference: `finance:${finance.id}`,
      }).catch(() => null);
    }

    return finance;
  },

async registerIncomeFromSale(saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, ...tenantScope() },
    include: {
      payments: true,
      items: {
        include: {
          product: true,
          boxContents: { include: { product: true } },
        },
      },
    },
  });

  if (!sale) throw new Error("Venta no encontrada");
  if (sale.status !== "COMPLETED") return null;

  const marker = `[sale:${sale.id}]`;

  const existing = await prisma.finance.findFirst({
    where: {
      type: "INGRESO",
      category: "VENTA",
      description: { contains: marker },
      ...tenantScope(),
    },
  });

  const paidAmount = sale.payments?.length
    ? sale.payments
        .filter((payment) => payment.method !== "CUENTA_CORRIENTE")
        .reduce((acc, payment) => acc + Number(payment.amount || 0), 0)
    : sale.paymentMethod === "CUENTA_CORRIENTE"
      ? 0
      : Number(sale.total || 0);

  const amount = Number(paidAmount.toFixed(2));

  // Si ya existía un ingreso de esta venta, lo sincronizamos.
  // Esto evita que quede mal si después cambian los pagos.
  if (existing) {
    if (amount <= 0) {
      return prisma.finance.delete({
        where: { id: existing.id },
      });
    }

    return prisma.finance.update({
      where: { id: existing.id },
      data: {
        amount,
        paymentMethod: sale.payments?.length ? sale.payments[0].method : sale.paymentMethod,
        date: existing.date,
      },
    });
  }

  // Venta 100% cuenta corriente: no genera ingreso hasta que se cobre.
  if (amount <= 0) return null;

  const itemsDesc = sale.items.map((i) => {
    const saleUnit = (i.product as any)?.saleUnit;

    if (i.product) {
      if (saleUnit === "KG") {
        const kg = (i as any).quantityKg ?? 0;
        return `${i.product.name} x${fmtKgAR(kg)} kg`;
      }

      return `${i.product.name} x${i.quantity}`;
    }

    if (i.boxContents && i.boxContents.length > 0) {
      const boxItems = i.boxContents
        .map((b) => `${b.product.name} x${b.quantity ?? b.quantityKg ?? 0}`)
        .join(", ");

      return `Caja (${boxItems}) x${i.quantity}`;
    }

    return "Item desconocido";
  });

  const description = `${marker} Venta de ${itemsDesc.join(", ")}`;

  return prisma.finance.create({
    data: {
      type: "INGRESO",
      amount,
      category: "VENTA",
      description,
      date: new Date(),
      paymentMethod: sale.payments?.length ? sale.payments[0].method : sale.paymentMethod,
      tenantId: currentTenantId(),
    },
  });
},

async registerCreditNote(amount: number, description: string, userId: string) {
  return await prisma.finance.create({
    data: {
      description: description || "Nota de crédito",
      amount: -Math.abs(amount),  // siempre negativo
      type: "EGRESO",
      category: "Otro",   // 👈 IMPORTANTE: categoría obligatoria
      date: new Date(),
      tenantId: currentTenantId(),
    },
  });
},
  // --- ESTADÍSTICAS ---
  async getIncomeByMonth(year: number, month: number) {
    const { start, end } = monthRangeAR(year, month);
    return prisma.finance.aggregate({
      where: { type: "INGRESO", date: { gte: start, lte: end }, ...tenantScope() },
      _sum: { amount: true },
    });
  },

  async getIncomeByYear(year: number) {
    const { start, end } = yearRangeAR(year);
    return prisma.finance.aggregate({
      where: { type: "INGRESO", date: { gte: start, lte: end }, ...tenantScope() },
      _sum: { amount: true },
    });
  },

  async getIncomeByWeek(year: number, month: number, day: number) {
    const { start, end } = weekRangeAR(year, month, day);
    return prisma.finance.aggregate({
      where: { type: "INGRESO", date: { gte: start, lte: end }, ...tenantScope() },
      _sum: { amount: true },
    });
  },

  async getTopProducts(limit = 5) {
    const saleWhere: any = { status: "COMPLETED", ...tenantScope() };

    const direct = await prisma.saleItem.findMany({
      where: { sale: saleWhere, productId: { not: undefined } },
      include: { product: true },
    });

    const boxItems = await prisma.saleItem.findMany({
      where: { sale: saleWhere, boxContents: { some: {} } },
      select: {
        quantity: true,
        boxContents: {
          select: { productId: true, quantity: true, product: true },
        },
      },
    });

    const usage = new Map<
      string,
      { productId: string; product: any | null; qty: number }
    >();

    for (const it of direct) {
      pushQty(usage, it.productId as string, it.quantity, it.product);
    }

    for (const it of boxItems) {
  for (const c of it.boxContents) {
    const componentQty = c.quantity ?? 0;

    if (componentQty > 0) {
      pushQty(usage, c.productId, it.quantity * componentQty, c.product);
    }
  }
}

    return Array.from(usage.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit)
      .map((r) => ({
        productId: r.productId,
        _sum: { quantity: r.qty },
        product: r.product,
      }));
  },

  async getWorstProducts(limit = 5) {
    const grouped = await prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      where: { sale: { ...tenantScope() } },
      orderBy: { _sum: { quantity: "asc" } },
      take: limit,
    });

    const products = await prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) }, ...tenantScope() },
    });

    return grouped.map((g) => ({
      productId: g.productId,
      _sum: { quantity: g._sum.quantity ?? 0 },
      product: products.find((p) => p.id === g.productId) || null,
    }));
  },

  async getProductsRange(startDate: Date, endDate: Date, order: "asc" | "desc") {
    const grouped = await prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      where: { sale: { createdAt: { gte: startDate, lte: endDate }, ...tenantScope() } },
      orderBy: { _sum: { quantity: order } },
      take: 1,
    });

    if (!grouped.length) return [];

    const product = await prisma.product.findFirst({
      where: { id: grouped[0].productId, ...tenantScope() },
    });

    return [
      {
        productId: grouped[0].productId,
        _sum: { quantity: grouped[0]._sum.quantity ?? 0 },
        product,
      },
    ];
  },

  async getIncomeByCategory(from: Date, to: Date) {
    return prisma.finance.groupBy({
      by: ["category"],
      where: {
        type: "INGRESO",
        date: { gte: startOfDayAR(from), lte: endOfDayAR(to) },
        ...tenantScope(),
      },
      _sum: { amount: true },
    });
  },

  async getTopProductsInRange(from?: Date, to?: Date, limit = 5) {
    const where: any = { sale: { status: "COMPLETED", ...tenantScope() } };

    if (from || to) {
      where.sale.createdAt = {};
      if (from) where.sale.createdAt.gte = startOfDayAR(from);
      if (to) where.sale.createdAt.lte = endOfDayAR(to);
    }

    const items = await prisma.saleItem.findMany({
      where,
      include: { product: true },
    });

    const map = new Map<
      string,
      { productId: string; product: any; qty: number }
    >();

    for (const item of items) {
      const curr = map.get(item.productId);
      if (curr) {
        curr.qty += item.quantity;
      } else {
        map.set(item.productId, {
          productId: item.productId,
          product: item.product,
          qty: item.quantity,
        });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit)
      .map((r) => ({
        productId: r.productId,
        _sum: { quantity: r.qty },
        product: r.product,
      }));
  },

  // --- EXPORTACIÓN EXCEL ---
  async exportFinanceReport(from: Date, to: Date) {
    const finances = await prisma.finance.findMany({
      where: { date: { gte: startOfDayAR(from), lte: endOfDayAR(to) }, ...tenantScope() },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Reporte Finanzas");

    sheet.addRow(["Fecha", "Tipo", "Categoría", "Descripción", "Monto"]);
    finances.forEach((f) => {
      sheet.addRow([
        formatDateAR(f.date),
        f.type,
        f.category,
        f.description ?? "",
        f.amount,
      ]);
    });

    return await workbook.xlsx.writeBuffer();
  },

  // --- EXPORTACIÓN PDF ---
  async exportFinanceReportPDF(res: Response, from: Date, to: Date) {
    const finances = await prisma.finance.findMany({
      where: { date: { gte: startOfDayAR(from), lte: endOfDayAR(to) }, ...tenantScope() },
    });

    const doc = new PDFDocument();
    res.setHeader("Content-Disposition", "attachment; filename=reporte.pdf");
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    doc.fontSize(18).text("Reporte Financiero", { align: "center" });
    doc.moveDown();

    finances.forEach((f) => {
      doc
        .fontSize(12)
        .text(
          `${formatDateAR(f.date)} - ${f.type} - ${f.category} - $${f.amount} - ${f.description ?? ""}`
        );
    });

    doc.moveDown(2);
    doc.fontSize(8).fillColor("gray").text(COMARPOS_FOOTER_TEXT, { align: "center" });

    doc.end();
  },

  async update(
    id: string,
    data: Partial<{
      type: FinanceType;
      amount: number;
      category: CategoryFinance;
      description?: string;
      date?: Date;
      paymentMethod?: string;
    }>
  ) {
    // opcional: si querés evitar romper con undefined
    const cleanData: any = {};
    if (data.type !== undefined) cleanData.type = data.type;
    if (data.amount !== undefined) cleanData.amount = data.amount;
    if (data.category !== undefined) cleanData.category = data.category;
    if (data.description !== undefined) cleanData.description = data.description;
    if (data.date !== undefined) cleanData.date = data.date;
    if (data.paymentMethod !== undefined) cleanData.paymentMethod = data.paymentMethod;

    const existing = await prisma.finance.findFirst({
      where: { id, ...tenantScope() },
      select: { id: true },
    });

    if (!existing) throw new Error("Movimiento financiero no encontrado");

    return prisma.finance.update({
      where: { id },
      data: cleanData,
    });
  },

  async remove(id: string) {
    const existing = await prisma.finance.findFirst({
      where: { id, ...tenantScope() },
      select: { id: true },
    });

    if (!existing) throw new Error("Movimiento financiero no encontrado");

    return prisma.finance.delete({
      where: { id },
    });
  },
};
