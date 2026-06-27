import prisma from "../prisma";
import { GoalMetric } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const salesGoalService = {
  async getAll() {
    return prisma.salesGoal.findMany({
      where: { ...tenantScope() },
      orderBy: { periodStart: "desc" },
    });
  },

  async getById(id: string) {
    return prisma.salesGoal.findFirst({ where: { id, ...tenantScope() } });
  },

  async create(data: {
    title: string;
    description?: string;
    metric: GoalMetric;
    targetAmount: number;
    periodStart: Date;
    periodEnd: Date;
  }) {
    if (data.periodStart >= data.periodEnd) throw new Error("periodStart debe ser anterior a periodEnd.");
    if (data.targetAmount <= 0) throw new Error("El objetivo debe ser mayor a 0.");
    return prisma.salesGoal.create({
      data: { ...data, tenantId: currentTenantId() },
    });
  },

  async update(id: string, data: {
    title?: string;
    description?: string;
    metric?: GoalMetric;
    targetAmount?: number;
    periodStart?: Date;
    periodEnd?: Date;
    isActive?: boolean;
  }) {
    const existing = await prisma.salesGoal.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Meta no encontrada.");
    return prisma.salesGoal.update({ where: { id }, data });
  },

  async remove(id: string) {
    const existing = await prisma.salesGoal.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Meta no encontrada.");
    return prisma.salesGoal.update({ where: { id }, data: { isActive: false } });
  },

  async getProgress(id: string) {
    const scope = tenantScope();
    const goal = await prisma.salesGoal.findFirst({ where: { id, ...scope } });
    if (!goal) throw new Error("Meta no encontrada.");

    const salesAgg = await prisma.sale.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: { gte: goal.periodStart, lte: goal.periodEnd },
        ...scope,
      },
      _sum: { total: true, grossProfit: true },
      _count: { id: true },
    });

    const itemsAgg = await prisma.saleItem.aggregate({
      where: {
        sale: {
          status: "COMPLETED",
          createdAt: { gte: goal.periodStart, lte: goal.periodEnd },
          ...scope,
        },
      },
      _sum: { quantity: true },
    });

    let currentValue = 0;
    switch (goal.metric) {
      case "REVENUE":
        currentValue = salesAgg._sum.total ?? 0;
        break;
      case "GROSS_PROFIT":
        currentValue = salesAgg._sum.grossProfit ?? 0;
        break;
      case "SALES_COUNT":
        currentValue = salesAgg._count.id ?? 0;
        break;
      case "UNITS_SOLD":
        currentValue = itemsAgg._sum.quantity ?? 0;
        break;
    }

    const progressPercent = goal.targetAmount > 0 ? round2((currentValue / goal.targetAmount) * 100) : 0;
    const now = new Date();
    const totalDays = (goal.periodEnd.getTime() - goal.periodStart.getTime()) / 86400000;
    const elapsedDays = Math.max(0, (now.getTime() - goal.periodStart.getTime()) / 86400000);
    const timeProgressPercent = totalDays > 0 ? round2((elapsedDays / totalDays) * 100) : 0;

    return {
      goal,
      currentValue: round2(currentValue),
      progressPercent,
      remaining: round2(Math.max(0, goal.targetAmount - currentValue)),
      timeProgressPercent,
      onTrack: progressPercent >= timeProgressPercent,
      projectedFinal:
        elapsedDays > 0 ? round2((currentValue / elapsedDays) * totalDays) : 0,
    };
  },

  async getAllWithProgress() {
    const goals = await salesGoalService.getAll();
    return Promise.all(goals.map((g) => salesGoalService.getProgress(g.id)));
  },
};
