/**
 * Edicion de items de una venta pendiente (recalculo de precios, stock y deuda).
 * Extraido de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { AccountMovementType, DeliveryMethod, DeliveryStatus, SaleStatus } from "@prisma/client";
import { financeService } from "../finance.service";
import { CreateSaleInput, ClientMini, DELIVERY_SKU } from "./sale.types";
import {
  round2,
  normalizeStockLocation,
  isDeliverySaleItem,
  resolveSaleItems,
  saleItemToResolved,
  buildSaleItemCreateData,
  getPaymentsFromExistingSale,
  applyDiscountAndProfitToItems,
} from "./sale.pricing";
import { buildStockLines, validateStockAvailability, discountStockLines, restoreStockLines, queueStockAlerts } from "./sale.stock";
import { calculatePaymentState } from "./sale.payment";
import { buildSaleInclude, queueSalePdfGeneration } from "./sale.query";
import { tenantScope } from "../../utils/tenantScope";

export async function updateItems(id: string, data: Partial<CreateSaleInput>) {
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("La venta debe tener al menos un producto");
  }

  const sale = await prisma.sale.findFirst({
    where: { id, ...tenantScope() },
    include: {
      payments: true,
      accountMovements: true,
      businessLocation: true,
      items: {
        include: {
          product: true,
          boxContents: {
            include: {
              product: true,
            },
          },
        },
      },
      client: true,
      user: { select: { id: true, name: true, email: true, role: true } },
      invoiceAfip: true,
    },
  });

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  if (sale.status === SaleStatus.CANCELLED) {
    throw new Error("No se puede editar una venta cancelada");
  }

  if (sale.status !== SaleStatus.PENDING) {
    throw new Error("Solo se puede editar una venta pendiente antes de confirmarla");
  }

  if (sale.isInvoiced || sale.invoiceStatus === "INVOICED" || sale.invoiceAfip) {
    throw new Error("No se puede editar una venta facturada. Emití una nota de crédito y generá una nueva venta");
  }

  const clientId = data.clientId !== undefined ? data.clientId : sale.clientId ?? undefined;
  let client: ClientMini = null;

  if (clientId) {
    client = await prisma.client.findFirst({
      where: { id: clientId, ...tenantScope() },
      select: { category: true },
    });

    if (!client) {
      throw new Error("Cliente no encontrado");
    }
  }

  const businessLocationId =
    data.businessLocationId !== undefined
      ? data.businessLocationId
      : sale.businessLocationId ?? null;

  if (businessLocationId) {
    const location = await prisma.businessLocation.findFirst({
      where: { id: businessLocationId, ...tenantScope() },
      select: { id: true, isActive: true },
    });

    if (!location) {
      throw new Error("Sucursal/depósito no encontrado");
    }

    if (!location.isActive) {
      throw new Error("La sucursal/depósito seleccionado está inactiva");
    }
  }

  const stockLocation = normalizeStockLocation(
    data.stockLocation ?? (sale as any).stockLocation ?? "LOCAL"
  );

  const itemsWithPrices = await resolveSaleItems(data.items, client);

  const subtotal = round2(
    itemsWithPrices.reduce((acc, item) => acc + item.subtotal, 0)
  );

  const deliveryMethod = data.deliveryMethod ?? sale.deliveryMethod ?? DeliveryMethod.PICKUP;
  const deliveryStatus = data.deliveryStatus ?? sale.deliveryStatus ?? DeliveryStatus.NONE;
  const deliveryCost = round2(Number(data.deliveryCost ?? sale.deliveryCost ?? 0));

  if (!Number.isFinite(deliveryCost) || deliveryCost < 0) {
    throw new Error("El costo de envío no puede ser negativo");
  }

  const deliveryLineSubtotal = round2(
    itemsWithPrices
      .filter(isDeliverySaleItem)
      .reduce((acc, item) => acc + item.subtotal, 0)
  );

  const discountType = data.discountType !== undefined ? data.discountType : sale.discountType ?? undefined;
  const discountValue = data.discountValue !== undefined ? data.discountValue : sale.discountValue ?? undefined;
  const discountBaseSubtotal = round2(subtotal - deliveryLineSubtotal);

  let discountAmount = 0;

  if (discountType && typeof discountValue === "number") {
    discountAmount =
      discountType === "PERCENTAGE"
        ? discountBaseSubtotal * (discountValue / 100)
        : discountValue;
  }

  discountAmount = round2(discountAmount);

  if (deliveryMethod === DeliveryMethod.LOCAL_DELIVERY) {
    if (deliveryCost <= 0) {
      throw new Error("El costo de envío debe ser mayor a 0");
    }

    if (deliveryLineSubtotal <= 0) {
      throw new Error(
        `El envío debe venir cargado como item (${DELIVERY_SKU}) en la venta`
      );
    }

    if (Math.abs(deliveryLineSubtotal - deliveryCost) > 0.01) {
      throw new Error(
        `El item de envío (${round2(deliveryLineSubtotal)}) no coincide con deliveryCost (${deliveryCost})`
      );
    }
  }

  const total = round2(subtotal - discountAmount);

  if (total < 0) {
    throw new Error("El total no puede ser negativo");
  }

  const itemsWithProfit = applyDiscountAndProfitToItems(
    itemsWithPrices,
    discountBaseSubtotal,
    discountAmount
  );

  const grossProfit = round2(
    itemsWithProfit.reduce((acc, item) => acc + item.profit, 0)
  );

  const paymentsForCalculation =
    data.payments !== undefined ? data.payments : getPaymentsFromExistingSale(sale);

  const paymentState = calculatePaymentState({
    total,
    paymentMethod: data.paymentMethod ?? sale.paymentMethod,
    payments: paymentsForCalculation,
  });

  if (paymentState.isAccountSale && !clientId) {
    throw new Error("Para vender en cuenta corriente necesitás seleccionar un cliente");
  }

  const oldDebt = round2(Number(sale.accountDebtAmount ?? 0));
  const newDebt = round2(paymentState.debtAmount);
  const debtDelta = round2(newDebt - oldDebt);

  if (debtDelta !== 0 && !clientId) {
    throw new Error("Para ajustar deuda necesitás seleccionar cliente");
  }

  const oldStockLines = buildStockLines(sale.items.map(saleItemToResolved));
  const newStockLines = buildStockLines(itemsWithProfit);
  const pendingAlerts: string[] = [];

  const updated = await prisma.$transaction(
    async (tx) => {
      await restoreStockLines(
        tx,
        oldStockLines,
        sale.userId ?? undefined,
        sale.id,
        normalizeStockLocation((sale as any).stockLocation ?? "LOCAL"),
        pendingAlerts
      );

      await validateStockAvailability(tx, newStockLines, stockLocation);

      await tx.boxContent.deleteMany({
        where: {
          saleItem: {
            saleId: sale.id,
          },
        },
      });

      await tx.saleItem.deleteMany({
        where: {
          saleId: sale.id,
        },
      });

      if (debtDelta !== 0 && clientId) {
        const currentClient = await tx.client.findFirst({
          where: { id: clientId, ...tenantScope() },
          select: {
            id: true,
            currentBalance: true,
            isAccountEnabled: true,
            creditLimit: true,
          },
        });

        if (!currentClient) throw new Error("Cliente no encontrado");

        if (!currentClient.isAccountEnabled && debtDelta > 0) {
          throw new Error("La cuenta corriente de este cliente está deshabilitada");
        }

        const previousBalance = round2(currentClient.currentBalance);
        const newBalance = round2(Math.max(previousBalance + debtDelta, 0));

        if (
          debtDelta > 0 &&
          currentClient.creditLimit !== null &&
          currentClient.creditLimit !== undefined &&
          currentClient.creditLimit > 0 &&
          newBalance > currentClient.creditLimit
        ) {
          throw new Error(
            `La deuda supera el límite de crédito del cliente. Límite: ${currentClient.creditLimit}`
          );
        }

        await tx.client.update({
          where: { id: clientId },
          data: { currentBalance: newBalance },
        });

        await tx.accountMovement.create({
          data: {
            clientId,
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
                ? "Aumento de deuda por edición de venta"
                : "Reducción de deuda por edición de venta",
          },
        });
      }

      const editedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          clientId: clientId ?? null,
          businessLocationId,
          subtotal,
          total,
          grossProfit,
          discountType: discountType ?? null,
          discountValue: discountValue ?? null,
          paymentMethod: data.paymentMethod ?? sale.paymentMethod,
          receiptType: data.receiptType ?? sale.receiptType,
          stockLocation,
          deliveryMethod,
          deliveryStatus,
          deliveryAddressSnapshot:
            data.deliveryAddressSnapshot !== undefined
              ? data.deliveryAddressSnapshot
              : sale.deliveryAddressSnapshot,
          deliveryDistanceKm:
            data.deliveryDistanceKm !== undefined
              ? data.deliveryDistanceKm
              : sale.deliveryDistanceKm,
          deliveryPricePerKm:
            data.deliveryPricePerKm !== undefined
              ? data.deliveryPricePerKm
              : sale.deliveryPricePerKm,
          deliveryCost,
          transportName:
            data.transportName !== undefined ? data.transportName : sale.transportName,
          transportCuit:
            data.transportCuit !== undefined ? data.transportCuit : sale.transportCuit,
          packagesCount:
            data.packagesCount !== undefined ? data.packagesCount : sale.packagesCount,
          declaredValue:
            data.declaredValue !== undefined ? data.declaredValue : sale.declaredValue,
          isAccountSale: paymentState.isAccountSale,
          accountDebtAmount: newDebt,
          items: {
            create: itemsWithProfit.map(buildSaleItemCreateData),
          },
          payments: {
            deleteMany: {},
            create: paymentState.paymentsToPersist.map((payment) => ({
              method: payment.method,
              amount: payment.amount,
              reference: payment.reference ?? null,
              notes: payment.notes ?? null,
            })),
          },
        },
        include: buildSaleInclude(),
      });

      await discountStockLines(
        tx,
        newStockLines,
        sale.userId ?? undefined,
        sale.id,
        stockLocation,
        pendingAlerts
      );

      return editedSale;
    },
    {
      timeout: 30000,
      maxWait: 30000,
    }
  );

  queueStockAlerts(pendingAlerts);
  queueSalePdfGeneration(updated.id);

  if (updated.status === SaleStatus.COMPLETED) {
    await financeService.registerIncomeFromSale(id);
  }

  return updated;
}
