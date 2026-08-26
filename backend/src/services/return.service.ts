import prisma from "../prisma";
import { SaleStatus, PaymentMethod, ReturnItemDirection, CategoryFinance, FinanceType } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { updateStatus } from "./sale/sale.lifecycle";
import { round2, resolveSaleItems, saleItemToResolved } from "./sale/sale.pricing";
import {
  buildStockLines,
  requireStockLocationId,
  validateStockAvailability,
  discountStockLines,
  restoreStockLines,
  queueStockAlerts,
} from "./sale/sale.stock";
import { accountService } from "./account.service";
import type { ClientMini, ResolvedSaleItem } from "./sale/sale.types";

const RETURN_INCLUDE = {
  items: { include: { product: { select: { name: true, sku: true } } } },
  client: { select: { nombre: true, apellido: true } },
  user: { select: { name: true } },
};

type ReturnItemInput = { saleItemId: string; quantity?: number; quantityKg?: number };
type ExchangeItemInput = {
  productId: string;
  quantity?: number;
  quantityKg?: number;
  price?: number;
};
type SettlementInput = { type: "REFUND" | "CREDIT" | "DEBT"; method?: PaymentMethod };

type LineQty = { quantity: number; quantityKg: number };

function validateSettlement(settlement: SettlementInput | undefined, clientId: string | null) {
  if (!settlement) return;

  if (settlement.type === "REFUND" && !settlement.method) {
    throw new Error("Falta el método de pago");
  }
  if ((settlement.type === "CREDIT" || settlement.type === "DEBT") && !clientId) {
    throw new Error("Esta operación requiere un cliente asociado a la venta");
  }
}

function addLineQty(map: Map<string, LineQty>, saleItemId: string, qty: LineQty) {
  const cur = map.get(saleItemId) ?? { quantity: 0, quantityKg: 0 };
  cur.quantity = round2(cur.quantity + qty.quantity);
  cur.quantityKg = round2(cur.quantityKg + qty.quantityKg);
  map.set(saleItemId, cur);
}

async function createFinanceEntry(type: FinanceType, amount: number, method: PaymentMethod, description: string) {
  if (method === PaymentMethod.CUENTA_CORRIENTE) return;

  await prisma.finance.create({
    data: {
      type,
      category: CategoryFinance.VENTA,
      amount: round2(amount),
      paymentMethod: method,
      description,
      date: new Date(),
      tenantId: currentTenantId(),
    },
  });
}

export const returnService = {
  async processReturn(
    saleId: string,
    userId: string,
    options: {
      items: ReturnItemInput[];
      exchangeItems?: ExchangeItemInput[];
      settlement?: SettlementInput;
      reason?: string;
    }
  ) {
    if (!Array.isArray(options.items) || options.items.length === 0) {
      throw new Error("Elegí al menos un ítem para devolver");
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, ...tenantScope() },
      include: {
        items: { include: { product: true, boxContents: { include: { product: true } } } },
        client: true,
      },
    });

    if (!sale) throw new Error("Venta no encontrada");
    if (sale.status !== SaleStatus.COMPLETED) {
      throw new Error("Solo se pueden devolver ventas en estado COMPLETED");
    }

    const saleItemById = new Map(sale.items.map((item) => [item.id, item]));

    // Cuanto de cada linea ya se devolvio en devoluciones parciales previas
    // de esta misma venta (ver ReturnItem.saleItemId en el schema).
    const previousReturnedRows = await prisma.returnItem.findMany({
      where: {
        direction: ReturnItemDirection.RETURNED,
        saleItem: { saleId: sale.id },
      },
      select: { saleItemId: true, quantity: true, quantityKg: true },
    });

    const alreadyReturnedByLine = new Map<string, LineQty>();
    for (const row of previousReturnedRows) {
      if (!row.saleItemId) continue;
      addLineQty(alreadyReturnedByLine, row.saleItemId, {
        quantity: row.quantity,
        quantityKg: row.quantityKg ?? 0,
      });
    }

    const requestedByLine = new Map<string, LineQty>();

    for (const req of options.items) {
      const saleItem = saleItemById.get(req.saleItemId);
      if (!saleItem) throw new Error("El ítem indicado no pertenece a esta venta");

      const already = alreadyReturnedByLine.get(saleItem.id) ?? { quantity: 0, quantityKg: 0 };
      const remainingQty = round2(saleItem.quantity - already.quantity);
      const remainingKg = round2((saleItem.quantityKg ?? 0) - already.quantityKg);

      const reqQty = round2(Number(req.quantity ?? 0));
      const reqKg = round2(Number(req.quantityKg ?? 0));
      const label = saleItem.productNameSnapshot ?? "un producto";

      if (reqQty <= 0 && reqKg <= 0) {
        throw new Error(`Cantidad inválida a devolver para ${label}`);
      }
      if (reqQty > remainingQty + 0.001 || reqKg > remainingKg + 0.001) {
        throw new Error(
          `No podés devolver más de lo pendiente de ${label} (disponible: ${remainingQty || remainingKg})`
        );
      }

      requestedByLine.set(saleItem.id, { quantity: reqQty, quantityKg: reqKg });
    }

    // Devolucion "total": cubre el 100% de lo que queda pendiente de TODA
    // la venta y no incluye cambio por otro producto -- en ese caso se
    // mantiene el camino de siempre (cancelar la venta entera), en vez del
    // camino generico de abajo que deja la venta en COMPLETED.
    const isFullReturn =
      !options.exchangeItems?.length &&
      sale.items.every((saleItem) => {
        const already = alreadyReturnedByLine.get(saleItem.id) ?? { quantity: 0, quantityKg: 0 };
        const remainingQty = round2(saleItem.quantity - already.quantity);
        const remainingKg = round2((saleItem.quantityKg ?? 0) - already.quantityKg);
        const req = requestedByLine.get(saleItem.id) ?? { quantity: 0, quantityKg: 0 };
        return req.quantity === remainingQty && req.quantityKg === remainingKg;
      });

    validateSettlement(options.settlement, sale.clientId);

    if (isFullReturn) {
      return processFullReturn(sale, userId, options);
    }

    return processPartialReturn(sale, userId, options, requestedByLine);
  },

  async getReturns(params?: { fromDate?: Date; toDate?: Date; page?: number; limit?: number }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { ...tenantScope() };

    if (params?.fromDate || params?.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = params.fromDate;
      if (params.toDate) where.createdAt.lte = params.toDate;
    }

    const [items, total] = await Promise.all([
      prisma.return.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: RETURN_INCLUDE,
      }),
      prisma.return.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  },
};

// --- Devolucion total: cancela la venta entera (comportamiento historico) ---
async function processFullReturn(
  sale: any,
  userId: string,
  options: { settlement?: SettlementInput; reason?: string }
) {
  const settlement = options.settlement;

  if (settlement?.type === "DEBT") {
    throw new Error("Una devolución total no puede saldarse como deuda del cliente");
  }

  await updateStatus(sale.id, SaleStatus.CANCELLED);

  const total = round2(sale.total);

  const returnRecord = await prisma.return.create({
    data: {
      saleId: sale.id,
      clientId: sale.clientId,
      userId,
      total,
      reason: options.reason ?? null,
      refundMethod: settlement?.type === "REFUND" ? settlement.method ?? null : null,
      refundAmount: settlement?.type === "REFUND" ? total : null,
      creditAmount: settlement?.type === "CREDIT" ? total : null,
      tenantId: currentTenantId(),
      items: {
        create: sale.items.map((item: any) => ({
          productId: item.productId,
          saleItemId: item.id,
          direction: ReturnItemDirection.RETURNED,
          quantity: item.quantity,
          quantityKg: item.quantityKg,
          unitPrice: item.price,
          subtotal: item.subtotal,
        })),
      },
    },
    include: RETURN_INCLUDE,
  });

  if (total > 0 && settlement?.type === "REFUND" && settlement.method) {
    // Marker [return:saleId] preserva el chequeo de "no duplicar" que ya
    // existia antes de este cambio.
    const marker = `[return:${sale.id}]`;
    const existing = await prisma.finance.findFirst({
      where: { description: { contains: marker }, ...tenantScope() },
    });
    if (!existing) {
      await createFinanceEntry(
        FinanceType.EGRESO,
        total,
        settlement.method,
        `Devolución de venta ${sale.id} ${marker}`
      );
    }
  } else if (total > 0 && settlement?.type === "CREDIT") {
    if (!sale.clientId) throw new Error("No hay cliente asociado a esta venta para acreditar a favor");
    await accountService.creditAccount({
      clientId: sale.clientId,
      amount: total,
      saleId: sale.id,
      userId,
      reference: returnRecord.id,
      description: `Saldo a favor por devolución de venta ${sale.id}`,
    });
  }

  return returnRecord;
}

// --- Devolucion parcial y/o con cambio por otro producto ---
async function processPartialReturn(
  sale: any,
  userId: string,
  options: { exchangeItems?: ExchangeItemInput[]; settlement?: SettlementInput; reason?: string },
  requestedByLine: Map<string, LineQty>
) {
  const stockLocationId = await requireStockLocationId(sale.stockLocationId);
  const client: ClientMini = sale.client ? { category: sale.client.category } : null;

  // 1) Lo que el cliente devuelve -> lineas de stock a restaurar
  const returnedLines: { saleItemId: string; resolved: ResolvedSaleItem }[] = [];
  let returnedSubtotal = 0;

  for (const saleItem of sale.items) {
    const req = requestedByLine.get(saleItem.id);
    if (!req) continue;

    const resolved = saleItemToResolved(saleItem);
    resolved.quantity = saleItem.quantityKg != null ? 0 : req.quantity;
    resolved.quantityKg = saleItem.quantityKg != null ? req.quantityKg : null;
    const qtyForTotal = resolved.quantityKg ?? resolved.quantity;
    resolved.subtotal = round2(resolved.price * qtyForTotal);
    resolved.costTotal = round2(resolved.purchasePriceSnapshot * qtyForTotal);

    returnedLines.push({ saleItemId: saleItem.id, resolved });
    returnedSubtotal = round2(returnedSubtotal + resolved.subtotal);
  }

  const returnedResolved = returnedLines.map((l) => l.resolved);
  const returnedStockLines = buildStockLines(returnedResolved);

  // 2) Lo que se lleva a cambio (opcional) -> precio actual + lineas de stock a descontar
  let exchangeResolved: ResolvedSaleItem[] = [];
  let exchangeSubtotal = 0;

  if (options.exchangeItems?.length) {
    exchangeResolved = await resolveSaleItems(
      options.exchangeItems.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        quantityKg: it.quantityKg,
        price: it.price,
        priceType: it.price !== undefined ? "MANUAL" : undefined,
      })),
      client
    );
    exchangeSubtotal = round2(exchangeResolved.reduce((sum, item) => sum + item.subtotal, 0));
  }

  const exchangeStockLines = buildStockLines(exchangeResolved);

  const diff = round2(returnedSubtotal - exchangeSubtotal);
  const settlement = options.settlement;

  if (diff !== 0 && !settlement) {
    throw new Error(
      diff > 0
        ? "Falta indicar cómo se le devuelve la diferencia al cliente"
        : "Falta indicar cómo paga el cliente la diferencia"
    );
  }
  if (diff > 0 && settlement && settlement.type === "DEBT") {
    throw new Error("La diferencia es a favor del cliente, no puede quedar como deuda");
  }
  if (diff < 0 && settlement && settlement.type === "CREDIT") {
    throw new Error("El cliente debe pagar la diferencia, no se le puede acreditar");
  }

  const result = await prisma.$transaction(
    async (tx) => {
      if (returnedStockLines.length > 0) {
        await restoreStockLines(tx, returnedStockLines, userId, sale.id, stockLocationId, []);
      }
      if (exchangeStockLines.length > 0) {
        await validateStockAvailability(tx, exchangeStockLines, stockLocationId);
        await discountStockLines(tx, exchangeStockLines, userId, sale.id, stockLocationId, []);
      }

      // Reversion proporcional de deuda de cta cte de ESTA venta, si tenia.
      // Suma lo ya reversado en devoluciones parciales previas (mismo
      // criterio que reverseAccountDebtFromSale en sale.payment.ts) para no
      // reversar de mas ni de menos a lo largo de varias devoluciones.
      if (sale.clientId && sale.accountDebtAmount > 0 && sale.total > 0) {
        const previousReverses = await tx.accountMovement.findMany({
          where: { saleId: sale.id, type: "CREDIT_NOTE" },
          select: { amount: true },
        });
        const alreadyReversed = round2(
          previousReverses.reduce((sum: number, m: { amount: number }) => sum + m.amount, 0)
        );
        const originalDebt = round2(sale.accountDebtAmount);
        const debtShare = round2((returnedSubtotal / sale.total) * originalDebt);
        const remainingDebt = round2(Math.max(originalDebt - alreadyReversed, 0));
        const thisReversal = round2(Math.min(debtShare, remainingDebt));

        if (thisReversal > 0) {
          const clientRow = await tx.client.findFirst({
            where: { id: sale.clientId, ...tenantScope() },
            select: { id: true, currentBalance: true },
          });
          if (clientRow) {
            const previousBalance = round2(clientRow.currentBalance);
            const newBalance = round2(Math.max(previousBalance - thisReversal, 0));
            await tx.client.update({ where: { id: sale.clientId }, data: { currentBalance: newBalance } });
            await tx.accountMovement.create({
              data: {
                clientId: sale.clientId,
                saleId: sale.id,
                userId,
                type: "CREDIT_NOTE",
                amount: thisReversal,
                previousBalance,
                newBalance,
                paymentMethod: null,
                reference: sale.id,
                description: "Reversión parcial de deuda por devolución",
              },
            });
          }
        }
      }

      const returnRecord = await tx.return.create({
        data: {
          saleId: sale.id,
          clientId: sale.clientId,
          userId,
          total: returnedSubtotal,
          reason: options.reason ?? null,
          refundMethod: diff > 0 && settlement?.type === "REFUND" ? settlement.method ?? null : null,
          refundAmount: diff > 0 && settlement?.type === "REFUND" ? diff : null,
          creditAmount: diff > 0 && settlement?.type === "CREDIT" ? diff : null,
          chargeAmount: diff < 0 && (settlement?.type === "REFUND" || settlement?.type === "DEBT") ? Math.abs(diff) : null,
          chargeMethod: diff < 0 && settlement?.type === "REFUND" ? settlement.method ?? null : null,
          tenantId: currentTenantId(),
          items: {
            create: [
              ...returnedLines.map(({ saleItemId, resolved: item }) => ({
                productId: item.productId,
                saleItemId,
                direction: ReturnItemDirection.RETURNED,
                quantity: item.quantity,
                quantityKg: item.quantityKg,
                unitPrice: item.price,
                subtotal: item.subtotal,
              })),
              ...exchangeResolved.map((item) => ({
                productId: item.productId,
                direction: ReturnItemDirection.EXCHANGE_OUT,
                quantity: item.quantity,
                quantityKg: item.quantityKg,
                unitPrice: item.price,
                subtotal: item.subtotal,
              })),
            ],
          },
        },
        include: RETURN_INCLUDE,
      });

      return returnRecord;
    },
    { timeout: 20000, maxWait: 20000 }
  );

  queueStockAlerts([...returnedStockLines, ...exchangeStockLines].map((l) => l.productId));

  // Liquidacion de la diferencia (fuera de la transaccion de stock/venta,
  // mismo criterio que ya usaba processReturn con el Finance del reembolso).
  if (diff > 0 && settlement?.type === "REFUND" && settlement.method) {
    await createFinanceEntry(
      FinanceType.EGRESO,
      diff,
      settlement.method,
      `Devolución de venta ${sale.id} [return:${result.id}]`
    );
  } else if (diff > 0 && settlement?.type === "CREDIT") {
    await accountService.creditAccount({
      clientId: sale.clientId,
      amount: diff,
      saleId: sale.id,
      userId,
      reference: result.id,
      description: `Saldo a favor por cambio en venta ${sale.id}`,
    });
  } else if (diff < 0 && settlement?.type === "REFUND" && settlement.method) {
    await createFinanceEntry(
      FinanceType.INGRESO,
      Math.abs(diff),
      settlement.method,
      `Cobro de diferencia por cambio en venta ${sale.id} [return:${result.id}]`
    );
  } else if (diff < 0 && settlement?.type === "DEBT") {
    await accountService.addDebt({
      clientId: sale.clientId,
      amount: Math.abs(diff),
      saleId: sale.id,
      userId,
      reference: result.id,
      description: `Diferencia a favor del negocio por cambio en venta ${sale.id}`,
    });
  }

  return result;
}
