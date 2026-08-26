/**
 * Logica de pagos, estados de pago y movimientos de cuenta corriente.
 * Extraida de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { AccountMovementType, PaymentMethod } from "@prisma/client";
import { round2 } from "./sale.pricing";
import { tenantScope } from "../../utils/tenantScope";

type PaymentCalcResult = {
  hasPayments: boolean;
  totalPaid: number;
  debtAmount: number;
  isAccountSale: boolean;
  paymentsToPersist: {
    method: PaymentMethod;
    amount: number;
    reference?: string;
    notes?: string;
  }[];
};

function calculatePaymentState(params: {
  total: number;
  paymentMethod: PaymentMethod;
  payments?: {
    method: PaymentMethod;
    amount: number;
    reference?: string;
    notes?: string;
  }[];
}): PaymentCalcResult {
  const hasPayments = Array.isArray(params.payments) && params.payments.length > 0;

  if (!hasPayments) {
    const isAccountSale = params.paymentMethod === PaymentMethod.CUENTA_CORRIENTE;

    return {
      hasPayments: false,
      totalPaid: isAccountSale ? 0 : params.total,
      debtAmount: isAccountSale ? params.total : 0,
      isAccountSale,
      paymentsToPersist: [],
    };
  }

  let totalPaid = 0;
  const paymentsToPersist: PaymentCalcResult["paymentsToPersist"] = [];
  let hasAccountPaymentLine = false;

  for (const payment of params.payments!) {
    if (!payment.method) {
      throw new Error("Cada pago necesita method");
    }

    const amount = Number(payment.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Cada pago necesita amount > 0");
    }

    if (payment.method === PaymentMethod.CUENTA_CORRIENTE) {
      hasAccountPaymentLine = true;
      continue;
    }

    totalPaid += amount;

    paymentsToPersist.push({
      method: payment.method,
      amount,
      reference: payment.reference,
      notes: payment.notes,
    });
  }

  totalPaid = round2(totalPaid);
  const debtAmount = round2(params.total - totalPaid);

  if (debtAmount < 0) {
    throw new Error(
      `La suma de pagos (${totalPaid}) no puede superar el total (${params.total})`
    );
  }

  return {
    hasPayments: paymentsToPersist.length > 0,
    totalPaid,
    debtAmount,
    isAccountSale: debtAmount > 0 || hasAccountPaymentLine,
    paymentsToPersist,
  };
}

async function createAccountDebtMovement(
  tx: any,
  data: {
    clientId: string;
    saleId: string;
    userId?: string | null;
    amount: number;
    description?: string;
  }
) {
  const debtAmount = round2(data.amount);

  if (debtAmount <= 0) return null;

  const client = await tx.client.findFirst({
    where: { id: data.clientId, ...tenantScope() },
    select: {
      id: true,
      currentBalance: true,
      isAccountEnabled: true,
      creditLimit: true,
    },
  });

  if (!client) throw new Error("Cliente no encontrado");

  if (!client.isAccountEnabled) {
    throw new Error("La cuenta corriente de este cliente está deshabilitada");
  }

  const previousBalance = round2(client.currentBalance);
  const newBalance = round2(previousBalance + debtAmount);

  if (
    client.creditLimit !== null &&
    client.creditLimit !== undefined &&
    client.creditLimit > 0 &&
    newBalance > client.creditLimit
  ) {
    throw new Error(
      `La deuda supera el límite de crédito del cliente. Límite: ${client.creditLimit}`
    );
  }

  await tx.client.update({
    where: { id: data.clientId },
    data: { currentBalance: newBalance },
  });

  return tx.accountMovement.create({
    data: {
      clientId: data.clientId,
      saleId: data.saleId,
      userId: data.userId ?? null,
      type: AccountMovementType.DEBT,
      amount: debtAmount,
      previousBalance,
      newBalance,
      paymentMethod: null,
      reference: data.saleId,
      description: data.description ?? "Deuda generada por venta en cuenta corriente",
    },
  });
}

async function reverseAccountDebtFromSale(tx: any, sale: any) {
  const debtAmount = round2(Number(sale.accountDebtAmount ?? 0));

  if (!sale.clientId || debtAmount <= 0) return null;

  // Suma en vez de "existe alguno" -- una devolucion parcial previa
  // (return.service.ts) ya pudo haber creado uno o mas CREDIT_NOTE
  // parciales para esta venta antes de que se termine cancelando entera
  // aca. Sumar y reversar solo el remanente hace que ambos flujos
  // compongan bien sin duplicar ni perder reversion de deuda.
  const previousReverses = await tx.accountMovement.findMany({
    where: {
      saleId: sale.id,
      type: AccountMovementType.CREDIT_NOTE,
    },
    select: { amount: true },
  });
  const alreadyReversed = round2(
    previousReverses.reduce((sum: number, m: { amount: number }) => sum + m.amount, 0)
  );
  const remainingDebt = round2(Math.max(debtAmount - alreadyReversed, 0));

  if (remainingDebt <= 0) return null;

  const client = await tx.client.findFirst({
    where: { id: sale.clientId, ...tenantScope() },
    select: { id: true, currentBalance: true },
  });

  if (!client) throw new Error("Cliente no encontrado");

  const previousBalance = round2(client.currentBalance);
  const newBalance = round2(Math.max(previousBalance - remainingDebt, 0));

  await tx.client.update({
    where: { id: sale.clientId },
    data: { currentBalance: newBalance },
  });

  await tx.sale.update({
    where: { id: sale.id },
    data: {
      accountDebtAmount: 0,
      isAccountSale: false,
    },
  });

  return tx.accountMovement.create({
    data: {
      clientId: sale.clientId,
      saleId: sale.id,
      userId: sale.userId ?? null,
      type: AccountMovementType.CREDIT_NOTE,
      amount: remainingDebt,
      previousBalance,
      newBalance,
      paymentMethod: null,
      reference: sale.id,
      description: "Reversión de deuda por cancelación de venta",
    },
  });
}

const DEFAULT_QUOTATION_HOURS = Number(process.env.DEFAULT_QUOTATION_HOURS ?? 36);


export {
  calculatePaymentState,
  createAccountDebtMovement,
  reverseAccountDebtFromSale,
};
