/**
 * Tipos y helpers compartidos de estadisticas de productos.
 * Extraidos de productStats.service.ts (doc seccion 4 - modularizacion).
 */
import prisma from "../../prisma";
import { AccountMovementType, SaleStatus, SaleUnit } from "@prisma/client";
import { tenantScope } from "../../utils/tenantScope";

export type SaleItemStatInput = {
  productId: string;
  quantity?: number;
  quantityKg?: number;
};

export type ProductLite = {
  id: string;
  name: string;
  saleUnit: SaleUnit;
};

export type GroupedRow = {
  productId: string;
  _sum: {
    quantity: number | null;
    quantityKg: number | null;
  };
};

export type ReportProductStat = {
  productId: string;
  name: string;
  saleUnit: SaleUnit;
  unitsSold: number;
  kgSold: number;
  totalSold: number;
  totalSoldLabel: string;

  totalRevenue: number;
  grossRevenue: number;
  collectedRevenue: number;
  pendingRevenue: number;

  rankValue: number;
  product: ProductLite | null;
};

export type AccountDebtAllocation = {
  remainingDebt: number;
  accountPaid: number;
};

export function toDateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function n0(v: unknown) {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function buildAccountDebtAllocationBySale(clientIds: string[]) {
  const result = new Map<string, AccountDebtAllocation>();

  if (!clientIds.length) return result;

  const accountSales = await prisma.sale.findMany({
    where: {
      clientId: {
        in: clientIds,
      },
      status: SaleStatus.COMPLETED,
      isAccountSale: true,
      accountDebtAmount: {
        gt: 0,
      },
      ...tenantScope(),
    },
    select: {
      id: true,
      clientId: true,
      accountDebtAmount: true,
      createdAt: true,
    },
    orderBy: [
      {
        clientId: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  const payments = await prisma.accountMovement.findMany({
    where: {
      clientId: {
        in: clientIds,
      },
      type: AccountMovementType.PAYMENT,
      client: { ...tenantScope() },
    },
    select: {
      clientId: true,
      amount: true,
      date: true,
      createdAt: true,
    },
    orderBy: [
      {
        clientId: "asc",
      },
      {
        date: "asc",
      },
    ],
  });

  for (const clientId of clientIds) {
    const clientSales = accountSales.filter((s) => s.clientId === clientId);
    const clientPayments = payments.filter((p) => p.clientId === clientId);

    const queue: {
      saleId: string;
      remainingDebt: number;
      accountPaid: number;
    }[] = [];

    const events: {
      kind: "DEBT" | "PAYMENT";
      date: Date;
      saleId?: string;
      amount: number;
    }[] = [];

    for (const sale of clientSales) {
      const amount = round2(n0(sale.accountDebtAmount));

      if (amount <= 0) continue;

      events.push({
        kind: "DEBT",
        date: sale.createdAt,
        saleId: sale.id,
        amount,
      });

      result.set(sale.id, {
        remainingDebt: amount,
        accountPaid: 0,
      });
    }

    for (const payment of clientPayments) {
      const amount = round2(n0(payment.amount));

      if (amount <= 0) continue;

      events.push({
        kind: "PAYMENT",
        date: payment.date ?? payment.createdAt,
        amount,
      });
    }

    events.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();

      if (diff !== 0) return diff;

      if (a.kind === "DEBT" && b.kind === "PAYMENT") return -1;
      if (a.kind === "PAYMENT" && b.kind === "DEBT") return 1;

      return 0;
    });

    for (const event of events) {
      if (event.kind === "DEBT") {
        if (!event.saleId) continue;

        const row = {
          saleId: event.saleId,
          remainingDebt: round2(event.amount),
          accountPaid: 0,
        };

        queue.push(row);

        result.set(event.saleId, {
          remainingDebt: row.remainingDebt,
          accountPaid: row.accountPaid,
        });

        continue;
      }

      let availablePayment = round2(event.amount);

      while (availablePayment > 0 && queue.length > 0) {
        const firstDebt = queue[0];

        const applied = round2(Math.min(firstDebt.remainingDebt, availablePayment));

        firstDebt.remainingDebt = round2(firstDebt.remainingDebt - applied);
        firstDebt.accountPaid = round2(firstDebt.accountPaid + applied);
        availablePayment = round2(availablePayment - applied);

        result.set(firstDebt.saleId, {
          remainingDebt: firstDebt.remainingDebt,
          accountPaid: firstDebt.accountPaid,
        });

        if (firstDebt.remainingDebt <= 0) {
          queue.shift();
        }
      }
    }
  }

  return result;
}
