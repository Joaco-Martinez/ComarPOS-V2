import prisma from "../prisma";
import {
  CategoryFinance,
  FinanceType,
  MovementType,
  PaymentMethod,
  ProductType,
  PurchaseStatus,
  SaleUnit,
} from "@prisma/client";
import alertService from "./alert.service";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { cashSessionService } from "./cashSession.service";
import { parseDateInputAR } from "../utils/dateAR";

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
  businessLocationId?: string;
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

async function requireBusinessLocation(businessLocationId: unknown): Promise<string> {
  if (typeof businessLocationId !== "string" || !businessLocationId) {
    throw new Error("Falta la ubicación de destino del stock");
  }
  const location = await prisma.businessLocation.findFirst({
    where: { id: businessLocationId, ...tenantScope() },
  });
  if (!location) throw new Error("La ubicación de destino no existe");
  return location.id;
}

function validatePaymentMethod(value: unknown): PaymentMethod | undefined {
  if (!value) return undefined;
  if (Object.values(PaymentMethod).includes(value as PaymentMethod)) return value as PaymentMethod;
  throw new Error("Método de pago inválido");
}

function parseDate(value: unknown): Date {
  const date = parseDateInputAR(value as string | Date | null | undefined) ?? new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Fecha inválida");
  return date;
}

const purchaseItemProductInclude = {
  select: {
    id: true,
    name: true,
    sku: true,
    saleUnit: true,
    purchasePrice: true,
    stock: { include: { businessLocation: { select: { id: true, name: true } } } },
  },
} as const;

export const purchaseService = {
  async getAll() {
    return prisma.purchase.findMany({
      where: { ...tenantScope() },
      orderBy: { date: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        finance: true,
        businessLocation: true,
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
        businessLocation: true,
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

    const businessLocationId = await requireBusinessLocation(data.businessLocationId);
    const paymentMethod = validatePaymentMethod(data.paymentMethod);
    const date = parseDate(data.date);

    const createdPurchase = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          providerName: data.providerName?.trim() || null,
          invoiceNumber: data.invoiceNumber?.trim() || null,
          description: data.description?.trim() || null,
          paymentMethod,
          businessLocationId,
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

          await tx.product.update({ where: { id: product.id }, data: { purchasePrice: unitCost } });
          await tx.productStock.upsert({
            where: { productId_businessLocationId: { productId: product.id, businessLocationId } },
            update: { quantity: { increment: quantity } },
            create: { productId: product.id, businessLocationId, quantity, tenantId: currentTenantId() },
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              userId,
              purchaseId: purchase.id,
              type: MovementType.INGRESS,
              toLocationId: businessLocationId,
              quantity,
              reason: "Compra de mercadería",
              reference: `[purchase:${purchase.id}]`,
              tenantId: currentTenantId(),
            },
          });
        }

        if (product.saleUnit === SaleUnit.KG) {
          const qtyKg = toNumber(item.quantityKg);
          if (!Number.isFinite(qtyKg) || qtyKg <= 0) throw new Error(`Cantidad KG inválida para "${product.name}"`);

          quantityKg = qtyKg;
          subtotal = roundMoney(quantityKg * unitCost);

          await tx.product.update({ where: { id: product.id }, data: { purchasePrice: unitCost } });
          await tx.productStock.upsert({
            where: { productId_businessLocationId: { productId: product.id, businessLocationId } },
            update: { quantityKg: { increment: quantityKg } },
            create: { productId: product.id, businessLocationId, quantityKg, tenantId: currentTenantId() },
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              userId,
              purchaseId: purchase.id,
              type: MovementType.INGRESS,
              toLocationId: businessLocationId,
              quantityKg,
              reason: "Compra de mercadería",
              reference: `[purchase:${purchase.id}]`,
              tenantId: currentTenantId(),
            },
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
          businessLocation: true,
          items: { include: { product: purchaseItemProductInclude } },
          stockMovements: true,
        },
      });
    }, { timeout: 20000, maxWait: 20000 });

    for (const item of createdPurchase.items) {
      await alertService.checkProductStock(item.productId).catch(() => undefined);
    }

    // Igual que un egreso de Finanzas: solo descuenta de la caja abierta si
    // se pago en EFECTIVO. Compras por transferencia/tarjeta no tocan la caja.
    await cashSessionService.maybeLinkExpense({
      userId,
      paymentMethod: createdPurchase.paymentMethod,
      amount: createdPurchase.totalAmount,
      description: `Compra${createdPurchase.providerName ? ` - ${createdPurchase.providerName}` : ""}`,
      reference: `purchase:${createdPurchase.id}`,
    }).catch(() => null);

    return createdPurchase;
  },

  async cancel(id: string, userId?: string) {
    if (!userId) throw new Error("Falta userId para cancelar la compra");

    const cancelled = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, ...tenantScope() },
        include: { items: { include: { product: true } }, finance: true, businessLocation: true },
      });

      if (!purchase) throw new Error("Compra no encontrada");
      if (purchase.status === PurchaseStatus.CANCELLED) throw new Error("La compra ya está cancelada");
      if (!purchase.businessLocationId) {
        throw new Error("Esta compra no tiene una ubicación de stock asociada, no se puede revertir automáticamente");
      }
      const businessLocationId = purchase.businessLocationId;

      for (const item of purchase.items) {
        const product = item.product;

        const stockRow = await tx.productStock.findUnique({
          where: { productId_businessLocationId: { productId: product.id, businessLocationId } },
        });

        if (product.saleUnit === SaleUnit.UNIT) {
          const qty = Number(item.quantity || 0);

          if (!stockRow || stockRow.quantity < qty) {
            throw new Error(`No hay stock suficiente en "${purchase.businessLocation?.name ?? "la ubicación"}" para revertir "${product.name}"`);
          }

          await tx.productStock.update({
            where: { id: stockRow.id },
            data: { quantity: { decrement: qty } },
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              userId,
              purchaseId: purchase.id,
              type: MovementType.ADJUSTMENT,
              fromLocationId: businessLocationId,
              quantity: qty,
              reason: "Cancelación de compra de mercadería",
              reference: `[purchase-cancel:${purchase.id}]`,
              tenantId: currentTenantId(),
            },
          });
        }

        if (product.saleUnit === SaleUnit.KG) {
          const qtyKg = Number(item.quantityKg || 0);

          if (!stockRow || stockRow.quantityKg < qtyKg) {
            throw new Error(`No hay stock KG suficiente en "${purchase.businessLocation?.name ?? "la ubicación"}" para revertir "${product.name}"`);
          }

          await tx.productStock.update({
            where: { id: stockRow.id },
            data: { quantityKg: { decrement: qtyKg } },
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              userId,
              purchaseId: purchase.id,
              type: MovementType.ADJUSTMENT,
              fromLocationId: businessLocationId,
              quantityKg: qtyKg,
              reason: "Cancelación de compra de mercadería",
              reference: `[purchase-cancel:${purchase.id}]`,
              tenantId: currentTenantId(),
            },
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
    }, { timeout: 20000, maxWait: 20000 });

    for (const item of cancelled.items) {
      await alertService.checkProductStock(item.productId).catch(() => undefined);
    }

    return cancelled;
  },
};
