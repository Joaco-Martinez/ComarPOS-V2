/**
 * Actualizacion de metodo de pago y pagos de una venta existente.
 * Extraido de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { AccountMovementType, PaymentMethod, SaleStatus } from "@prisma/client";
import { financeService } from "../finance.service";
import { round2 } from "./sale.pricing";
import { calculatePaymentState } from "./sale.payment";
import { tenantScope } from "../../utils/tenantScope";

export async function updatePaymentMethod(id: string, method: PaymentMethod) {
  const sale = await prisma.sale.findFirst({
    where: {
      id,
      ...tenantScope(),
    },
  });

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  return prisma.sale.update({
    where: {
      id,
    },
    data: {
      paymentMethod: method,
    },
    include: {
      payments: true,
      businessLocation: true,
      items: true,
      user: true,
      client: true,
    },
  });
}

export async function updatePayments(
  id: string,
  payments: {
    method: PaymentMethod;
    amount: number;
    reference?: string;
    notes?: string;
  }[],
  setAsPrimary: boolean
) {
  const sale = await prisma.sale.findFirst({
    where: { id, ...tenantScope() },
    include: {
      payments: true,
      accountMovements: true,
    },
  });

  if (!sale) throw new Error("Venta no encontrada");

  if (sale.status === SaleStatus.CANCELLED) {
    throw new Error("No se pueden modificar pagos de una venta cancelada");
  }

  const paymentState = calculatePaymentState({
    total: sale.total,
    paymentMethod: sale.paymentMethod,
    payments,
  });

  if (paymentState.isAccountSale && !sale.clientId) {
    throw new Error("Para dejar saldo en cuenta corriente la venta debe tener cliente");
  }

  const oldDebt = round2(Number(sale.accountDebtAmount ?? 0));
  const newDebt = round2(paymentState.debtAmount);
  const debtDelta = round2(newDebt - oldDebt);
  const primary = payments[0]?.method ?? sale.paymentMethod;

  const updatedSale = await prisma.$transaction(async (tx) => {
    if (debtDelta !== 0 && sale.clientId) {
      const client = await tx.client.findFirst({
        where: { id: sale.clientId, ...tenantScope() },
        select: {
          id: true,
          currentBalance: true,
          isAccountEnabled: true,
          creditLimit: true,
        },
      });

      if (!client) throw new Error("Cliente no encontrado");

      if (!client.isAccountEnabled && debtDelta > 0) {
        throw new Error("La cuenta corriente de este cliente está deshabilitada");
      }

      const previousBalance = round2(client.currentBalance);
      const newBalance = round2(Math.max(previousBalance + debtDelta, 0));

      if (
        debtDelta > 0 &&
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
        where: { id: sale.clientId },
        data: { currentBalance: newBalance },
      });

      await tx.accountMovement.create({
        data: {
          clientId: sale.clientId,
          saleId: sale.id,
          userId: sale.userId ?? null,
          type:
            debtDelta > 0
              ? AccountMovementType.ADJUSTMENT_POSITIVE
              : AccountMovementType.ADJUSTMENT_NEGATIVE,
          amount: Math.abs(debtDelta),
          previousBalance,
          newBalance,
          paymentMethod: null,
          reference: sale.id,
          description:
            debtDelta > 0
              ? "Aumento de deuda por actualización de pagos"
              : "Reducción de deuda por actualización de pagos",
        },
      });
    }

    return tx.sale.update({
      where: { id },
      data: {
        isAccountSale: paymentState.isAccountSale,
        accountDebtAmount: newDebt,
        payments: {
          deleteMany: {},
          create: paymentState.paymentsToPersist.map((payment) => ({
            method: payment.method,
            amount: payment.amount,
            reference: payment.reference ?? null,
            notes: payment.notes ?? null,
          })),
        },
        ...(setAsPrimary ? { paymentMethod: primary } : {}),
      },
      include: {
        payments: true,
        businessLocation: true,
        items: true,
        user: true,
        client: true,
        accountMovements: true,
      },
    });
  });

  if (updatedSale.status === SaleStatus.COMPLETED) {
    await financeService.registerIncomeFromSale(id);
  }

  return updatedSale;
}
