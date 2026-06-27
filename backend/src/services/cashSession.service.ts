import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { CashMovementType } from "@prisma/client";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const cashSessionService = {
  async openSession(data: {
    userId: string;
    openingBalance: number;
    businessLocationId?: string;
    notes?: string;
  }) {
    const scope = tenantScope();

    // Prevent duplicate open sessions for the same user/location
    const existing = await prisma.cashSession.findFirst({
      where: {
        userId: data.userId,
        status: "OPEN",
        businessLocationId: data.businessLocationId ?? null,
        ...scope,
      },
    });
    if (existing) throw new Error("Ya hay una caja abierta para este usuario/local.");

    const session = await prisma.cashSession.create({
      data: {
        userId: data.userId,
        openingBalance: data.openingBalance,
        expectedBalance: data.openingBalance,
        businessLocationId: data.businessLocationId ?? null,
        notes: data.notes ?? null,
        status: "OPEN",
        tenantId: currentTenantId(),
      },
    });

    await prisma.cashMovement.create({
      data: {
        sessionId: session.id,
        type: CashMovementType.OPENING,
        amount: data.openingBalance,
        description: "Apertura de caja",
      },
    });

    return session;
  },

  async getOpenSession(userId: string, businessLocationId?: string) {
    const scope = tenantScope();
    return prisma.cashSession.findFirst({
      where: {
        userId,
        status: "OPEN",
        businessLocationId: businessLocationId ?? undefined,
        ...scope,
      },
      include: { movements: { orderBy: { createdAt: "desc" } }, businessLocation: true },
    });
  },

  async getSessionById(sessionId: string) {
    const scope = tenantScope();
    return prisma.cashSession.findFirst({
      where: { id: sessionId, ...scope },
      include: {
        movements: { orderBy: { createdAt: "asc" } },
        user: { select: { id: true, name: true, email: true } },
        businessLocation: true,
      },
    });
  },

  async addMovement(data: {
    sessionId: string;
    type: CashMovementType;
    amount: number;
    description?: string;
    reference?: string;
  }) {
    const scope = tenantScope();
    const session = await prisma.cashSession.findFirst({
      where: { id: data.sessionId, status: "OPEN", ...scope },
    });
    if (!session) throw new Error("Sesión de caja no encontrada o ya cerrada.");

    const outflowTypes: CashMovementType[] = [CashMovementType.EXPENSE, CashMovementType.WITHDRAWAL];
    const isOutflow = outflowTypes.includes(data.type);
    const amount = Math.abs(data.amount);
    const delta = isOutflow ? -amount : amount;

    const [movement] = await prisma.$transaction([
      prisma.cashMovement.create({
        data: {
          sessionId: data.sessionId,
          type: data.type,
          amount: isOutflow ? -amount : amount,
          description: data.description ?? null,
          reference: data.reference ?? null,
        },
      }),
      prisma.cashSession.update({
        where: { id: data.sessionId },
        data: { expectedBalance: { increment: delta } },
      }),
    ]);

    return movement;
  },

  async getSessionSummary(sessionId: string) {
    const scope = tenantScope();
    const session = await prisma.cashSession.findFirst({
      where: { id: sessionId, ...scope },
      include: { movements: true, businessLocation: true, user: { select: { id: true, name: true } } },
    });
    if (!session) throw new Error("Sesión no encontrada.");

    // Sum cash sales that occurred during this session window
    const cashSalesAgg = await prisma.salePayment.aggregate({
      where: {
        method: "EFECTIVO",
        createdAt: { gte: session.openedAt, lte: session.closedAt ?? new Date() },
        sale: {
          status: "COMPLETED",
          businessLocationId: session.businessLocationId ?? undefined,
          ...scope,
        },
      },
      _sum: { amount: true },
    });

    const cashAccountPayments = await prisma.accountMovement.aggregate({
      where: {
        type: "PAYMENT",
        paymentMethod: "EFECTIVO",
        date: { gte: session.openedAt, lte: session.closedAt ?? new Date() },
        client: { tenantId: currentTenantId() ?? undefined },
      },
      _sum: { amount: true },
    });

    const cashSalesTotal = cashSalesAgg._sum.amount ?? 0;
    const accountPaymentsTotal = cashAccountPayments._sum.amount ?? 0;

    const outflows = session.movements
      .filter((m) => m.amount < 0)
      .reduce((s, m) => s + Math.abs(m.amount), 0);
    const manualDeposits = session.movements
      .filter((m) => m.type === "DEPOSIT" && m.amount > 0)
      .reduce((s, m) => s + m.amount, 0);

    const expectedBalance = round2(
      session.openingBalance + cashSalesTotal + accountPaymentsTotal + manualDeposits - outflows
    );

    return {
      session: {
        id: session.id,
        status: session.status,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        openingBalance: session.openingBalance,
        businessLocation: session.businessLocation,
        user: session.user,
        notes: session.notes,
        closeNotes: session.closeNotes,
      },
      breakdown: {
        openingBalance: round2(session.openingBalance),
        cashSales: round2(cashSalesTotal),
        accountPaymentsCash: round2(accountPaymentsTotal),
        manualDeposits: round2(manualDeposits),
        outflows: round2(outflows),
        expectedBalance,
        actualBalance: session.actualBalance ?? null,
        difference: session.actualBalance != null ? round2(session.actualBalance - expectedBalance) : null,
      },
      movements: session.movements,
    };
  },

  async closeSession(data: {
    sessionId: string;
    actualBalance: number;
    closeNotes?: string;
  }) {
    const scope = tenantScope();
    const session = await prisma.cashSession.findFirst({
      where: { id: data.sessionId, status: "OPEN", ...scope },
    });
    if (!session) throw new Error("Sesión no encontrada o ya cerrada.");

    // Recalculate expected
    const cashSalesAgg = await prisma.salePayment.aggregate({
      where: {
        method: "EFECTIVO",
        createdAt: { gte: session.openedAt },
        sale: {
          status: "COMPLETED",
          businessLocationId: session.businessLocationId ?? undefined,
          ...scope,
        },
      },
      _sum: { amount: true },
    });

    const cashAccountPayments = await prisma.accountMovement.aggregate({
      where: {
        type: "PAYMENT",
        paymentMethod: "EFECTIVO",
        date: { gte: session.openedAt },
        client: { tenantId: currentTenantId() ?? undefined },
      },
      _sum: { amount: true },
    });

    const movements = await prisma.cashMovement.findMany({ where: { sessionId: data.sessionId } });
    const outflows = movements.filter((m) => m.amount < 0).reduce((s, m) => s + Math.abs(m.amount), 0);
    const deposits = movements.filter((m) => m.type === "DEPOSIT" && m.amount > 0).reduce((s, m) => s + m.amount, 0);

    const expectedBalance = round2(
      session.openingBalance +
        (cashSalesAgg._sum.amount ?? 0) +
        (cashAccountPayments._sum.amount ?? 0) +
        deposits -
        outflows
    );
    const difference = round2(data.actualBalance - expectedBalance);

    return prisma.cashSession.update({
      where: { id: data.sessionId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        actualBalance: data.actualBalance,
        expectedBalance,
        difference,
        closeNotes: data.closeNotes ?? null,
      },
    });
  },

  async getHistory(filters: { from?: Date; to?: Date; userId?: string; businessLocationId?: string }) {
    const scope = tenantScope();
    return prisma.cashSession.findMany({
      where: {
        ...scope,
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.businessLocationId && { businessLocationId: filters.businessLocationId }),
        ...(filters.from || filters.to
          ? { openedAt: { ...(filters.from && { gte: filters.from }), ...(filters.to && { lte: filters.to }) } }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true } },
        businessLocation: { select: { id: true, name: true } },
        _count: { select: { movements: true } },
      },
      orderBy: { openedAt: "desc" },
    });
  },
};
