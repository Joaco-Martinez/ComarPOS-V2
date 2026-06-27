import prisma from "../prisma";
import {
  CategoryFinance,
  FinanceType,
  Location,
  MovementType,
  PaymentMethod,
  ProductType,
  PurchaseStatus,
  SaleUnit,
} from "@prisma/client";
import alertService from "./alert.service";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

type PurchaseItemInput = {
  productId: string;
  quantity?: number | string;
  quantityKg?: number | string;
  unitCost?: number | string;
};

type CreatePurchaseInput = {
  providerName?: string;
  invoiceNumber?: string;
  description?: string;
  paymentMethod?: PaymentMethod;
  to?: Location;
  date?: string | Date;
  supplierId?: string;
  purchaseOrderId?: string;
  items: PurchaseItemInput[];
};

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function validateLocation(value: unknown): Location {
  if (value === Location.LOCAL || value === Location.DEPOSITO) return value;
  return Location.DEPOSITO;
}

function validatePaymentMethod(value: unknown): PaymentMethod | undefined {
  if (!value) return undefined;
  if (Object.values(PaymentMethod).includes(value as PaymentMethod)) return value as PaymentMethod;
  throw new Error("Método de pago inválido");
}

function parseDate(value: unknown): Date {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Fecha inválida");
  return date;
}

export const purchaseService = {
  async getAll() {
    return prisma.purchase.findMany({
      where: { ...tenantScope() },
      orderBy: { date: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        finance: true,
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, saleUnit: true } },
          },
        },
      },
    });
  },

  async getById(id: string) {
    const purchase = await prisma.purchase.findFirst({
      where: { id, ...tenantScope() },
      include: {
        user: { select: { id: true, name: true, email: true } },
        finance: true,
        items: { include: { product: true } },
        stockMovements: {
          include: {
            product: { select: { id: true, name: true, sku: true, saleUnit: true } },
          },
        },
      },
    });

    if (!purchase) throw new Error("Compra no encontrada");
    return purchase;
  },

  async create(data: CreatePurchaseInput, userId?: string) {
    if (!userId) throw new Error("Falta userId para registrar la compra");
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("La compra debe tener al menos un producto");
    }

    const to = validateLocation(data.to);
    const paymentMethod = validatePaymentMethod(data.paymentMethod);
    const date = parseDate(data.date);

    const createdPurchase = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          providerName: data.providerName?.trim() || null,
          invoiceNumber: data.invoiceNumber?.trim() || null,
          description: data.description?.trim() || null,
          paymentMethod,
          to,
          date,
          userId,
          status: PurchaseStatus.COMPLETED,
          totalAmount: 0,
          tenantId: currentTenantId(),
          supplierId: data.supplierId ?? null,
          purchaseOrderId: data.purchaseOrderId ?? null,
        },
      });

      let totalAmount = 0;

      for (const item of data.items) {
        if (!item.productId) throw new Error("Cada item debe tener productId");

        const product = await tx.product.findFirst({ where: { id: item.productId, ...tenantScope() } });
        if (!product) throw new Error(`Producto no encontrado: ${item.productId}`);
        if (!product.isActive) throw new Error(`El producto "${product.name}" está inactivo`);
        if ((product as any).isService) throw new Error(`"${product.name}" es un servicio, no puede ingresar stock`);
        if (product.type === ProductType.COMPUESTO) {
          throw new Error(`No se puede comprar stock directo de "${product.name}" porque es un producto compuesto`);
        }

        const rawUnitCost =
          item.unitCost !== undefined && item.unitCost !== null && item.unitCost !== ""
            ? item.unitCost
            : (product as any).purchasePrice ?? 0;

        const unitCost = toNumber(rawUnitCost);
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          throw new Error(`El costo unitario de "${product.name}" debe ser válido`);
        }

        let quantity: number | null = null;
        let quantityKg: number | null = null;
        let subtotal = 0;

        if (product.saleUnit === SaleUnit.UNIT) {
          const qty = toNumber(item.quantity);
          if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Cantidad inválida para "${product.name}"`);

          quantity = Math.trunc(qty);
          subtotal = roundMoney(quantity * unitCost);

          await tx.product.update({
            where: { id: product.id },
            data: {
              ...(to === Location.LOCAL
                ? { stockLocal: { increment: quantity } }
                : { stockDeposito: { increment: quantity } }),
              purchasePrice: unitCost,
            } as any,
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              userId,
              purchaseId: purchase.id,
              type: MovementType.INGRESS,
              from: null,
              to,
              quantity,
              reason: "Compra de mercadería",
              reference: `[purchase:${purchase.id}]`,
              tenantId: currentTenantId(),
            } as any,
          });
        }

        if (product.saleUnit === SaleUnit.KG) {
          const qtyKg = toNumber(item.quantityKg);
          if (!Number.isFinite(qtyKg) || qtyKg <= 0) throw new Error(`Cantidad KG inválida para "${product.name}"`);

          quantityKg = qtyKg;
          subtotal = roundMoney(quantityKg * unitCost);

          await tx.product.update({
            where: { id: product.id },
            data: {
              ...(to === Location.LOCAL
                ? { stockLocalKg: { increment: quantityKg } }
                : { stockDepositoKg: { increment: quantityKg } }),
              purchasePrice: unitCost,
            } as any,
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              userId,
              purchaseId: purchase.id,
              type: MovementType.INGRESS,
              from: null,
              to,
              quantityKg,
              reason: "Compra de mercadería",
              reference: `[purchase:${purchase.id}]`,
              tenantId: currentTenantId(),
            } as any,
          });
        }

        totalAmount += subtotal;

        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: product.id,
            quantity,
            quantityKg,
            unitCost,
            subtotal,
            productNameSnapshot: product.name,
            productSkuSnapshot: product.sku,
          },
        });
      }

      const total = roundMoney(totalAmount);

      const finance = await tx.finance.create({
        data: {
          type: FinanceType.EGRESO,
          amount: total,
          category: CategoryFinance.CompraMercaderia,
          paymentMethod,
          description: `[purchase:${purchase.id}] Compra de mercadería${data.providerName ? ` - ${data.providerName}` : ""}`,
          date,
          tenantId: currentTenantId(),
        },
      });

      return tx.purchase.update({
        where: { id: purchase.id },
        data: { totalAmount: total, financeId: finance.id },
        include: {
          finance: true,
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  saleUnit: true,
                  stockLocal: true,
                  stockDeposito: true,
                  stockLocalKg: true,
                  stockDepositoKg: true,
                  purchasePrice: true,
                },
              },
            },
          },
          stockMovements: true,
        },
      });
    });

    for (const item of createdPurchase.items) {
      await alertService.checkProductStock(item.productId).catch(() => undefined);
    }

    return createdPurchase;
  },

  async cancel(id: string, userId?: string) {
    if (!userId) throw new Error("Falta userId para cancelar la compra");

    const cancelled = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, ...tenantScope() },
        include: { items: { include: { product: true } }, finance: true },
      });

      if (!purchase) throw new Error("Compra no encontrada");
      if (purchase.status === PurchaseStatus.CANCELLED) throw new Error("La compra ya está cancelada");

      for (const item of purchase.items) {
        const product = item.product;

        if (product.saleUnit === SaleUnit.UNIT) {
          const qty = Number(item.quantity || 0);

          if (purchase.to === Location.LOCAL && product.stockLocal < qty) {
            throw new Error(`No hay stock local suficiente para revertir "${product.name}"`);
          }
          if (purchase.to === Location.DEPOSITO && product.stockDeposito < qty) {
            throw new Error(`No hay stock en depósito suficiente para revertir "${product.name}"`);
          }

          await tx.product.update({
            where: { id: product.id },
            data:
              purchase.to === Location.LOCAL
                ? { stockLocal: { decrement: qty } }
                : { stockDeposito: { decrement: qty } },
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              userId,
              purchaseId: purchase.id,
              type: MovementType.ADJUSTMENT,
              from: purchase.to,
              to: null,
              quantity: qty,
              reason: "Cancelación de compra de mercadería",
              reference: `[purchase-cancel:${purchase.id}]`,
              tenantId: currentTenantId(),
            } as any,
          });
        }

        if (product.saleUnit === SaleUnit.KG) {
          const qtyKg = Number(item.quantityKg || 0);

          if (purchase.to === Location.LOCAL && product.stockLocalKg < qtyKg) {
            throw new Error(`No hay stock local KG suficiente para revertir "${product.name}"`);
          }
          if (purchase.to === Location.DEPOSITO && product.stockDepositoKg < qtyKg) {
            throw new Error(`No hay stock en depósito KG suficiente para revertir "${product.name}"`);
          }

          await tx.product.update({
            where: { id: product.id },
            data:
              purchase.to === Location.LOCAL
                ? { stockLocalKg: { decrement: qtyKg } }
                : { stockDepositoKg: { decrement: qtyKg } },
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              userId,
              purchaseId: purchase.id,
              type: MovementType.ADJUSTMENT,
              from: purchase.to,
              to: null,
              quantityKg: qtyKg,
              reason: "Cancelación de compra de mercadería",
              reference: `[purchase-cancel:${purchase.id}]`,
              tenantId: currentTenantId(),
            } as any,
          });
        }
      }

      await tx.finance.create({
        data: {
          type: FinanceType.INGRESO,
          amount: purchase.totalAmount,
          category: CategoryFinance.CompraMercaderia,
          paymentMethod: purchase.paymentMethod,
          description: `[purchase-cancel:${purchase.id}] Reversión de compra de mercadería`,
          date: new Date(),
          tenantId: currentTenantId(),
        },
      });

      return tx.purchase.update({
        where: { id: purchase.id },
        data: { status: PurchaseStatus.CANCELLED },
        include: { finance: true, items: { include: { product: true } }, stockMovements: true },
      });
    });

    for (const item of cancelled.items) {
      await alertService.checkProductStock(item.productId).catch(() => undefined);
    }

    return cancelled;
  },
};
