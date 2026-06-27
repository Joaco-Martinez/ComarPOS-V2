import prisma from "../prisma";
import { CategoryFinance } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

export const recurringExpenseService = {
  async getAll() {
    return prisma.recurringExpense.findMany({
      where: { ...tenantScope() },
      orderBy: { name: "asc" },
    });
  },

  async create(data: {
    name: string;
    amount: number;
    category: CategoryFinance;
    dayOfMonth: number;
    notes?: string;
  }) {
    if (data.dayOfMonth < 1 || data.dayOfMonth > 31) throw new Error("Día del mes inválido (1-31).");
    return prisma.recurringExpense.create({
      data: { ...data, tenantId: currentTenantId() },
    });
  },

  async update(id: string, data: {
    name?: string;
    amount?: number;
    category?: CategoryFinance;
    dayOfMonth?: number;
    notes?: string;
    isActive?: boolean;
  }) {
    const existing = await prisma.recurringExpense.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Gasto recurrente no encontrado.");
    if (data.dayOfMonth && (data.dayOfMonth < 1 || data.dayOfMonth > 31))
      throw new Error("Día del mes inválido (1-31).");
    return prisma.recurringExpense.update({ where: { id }, data });
  },

  async remove(id: string) {
    const existing = await prisma.recurringExpense.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Gasto recurrente no encontrado.");
    return prisma.recurringExpense.update({ where: { id }, data: { isActive: false } });
  },

  // Called by cron/manual trigger — creates Finance entries for expenses due today
  async processForTenant(tenantId: string) {
    const today = new Date();
    const todayDay = today.getDate();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const pending = await prisma.recurringExpense.findMany({
      where: {
        tenantId,
        isActive: true,
        dayOfMonth: todayDay,
        OR: [
          { lastCreated: null },
          { lastCreated: { lt: startOfMonth } },
        ],
      },
    });

    const created = [];
    for (const exp of pending) {
      const finance = await prisma.finance.create({
        data: {
          type: "EGRESO",
          amount: exp.amount,
          category: exp.category,
          description: `[Recurrente] ${exp.name}`,
          date: today,
          tenantId,
        },
      });
      await prisma.recurringExpense.update({
        where: { id: exp.id },
        data: { lastCreated: today },
      });
      created.push({ expense: exp, finance });
    }

    return { processed: created.length, created };
  },

  async processDueNow() {
    const tenants = await prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } });
    const results = [];
    for (const t of tenants) {
      const r = await recurringExpenseService.processForTenant(t.id);
      if (r.processed > 0) results.push({ tenantId: t.id, ...r });
    }
    return results;
  },
};
