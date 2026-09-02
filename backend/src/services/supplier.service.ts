import prisma from "../prisma";
import { SaleUnit } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { priceListService } from "./priceList.service";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const supplierService = {
  async getAll() {
    return prisma.supplier.findMany({
      where: { ...tenantScope() },
      orderBy: { name: "asc" },
    });
  },

  async getById(id: string) {
    return prisma.supplier.findFirst({ where: { id, ...tenantScope() } });
  },

  async create(data: {
    name: string;
    cuit?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  }) {
    return prisma.supplier.create({
      data: { ...data, tenantId: currentTenantId() },
    });
  },

  async update(id: string, data: {
    name?: string;
    cuit?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    isActive?: boolean;
  }) {
    const existing = await prisma.supplier.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Proveedor no encontrado.");
    return prisma.supplier.update({ where: { id }, data });
  },

  async remove(id: string) {
    const existing = await prisma.supplier.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Proveedor no encontrado.");
    // Soft delete
    return prisma.supplier.update({ where: { id }, data: { isActive: false } });
  },

  /**
   * Aumento (o descuento) masivo del precio de venta (Minorista) de TODOS
   * los productos activos vinculados a este proveedor - pedido explicito:
   * cuando el proveedor sube un %, poder trasladarlo a los precios de venta
   * de un solo saque en vez de producto por producto. Sigue el mismo patron
   * que priceListService.bulkApply: factor = 1 + percentage/100 sobre el
   * precio actual, nunca acumulativo sobre un aumento previo. Solo toca
   * price/pricePerKg (y sus espejos clientPrice/wholesalePrice) del
   * producto - no toca purchasePrice (costo) ni overrides en otras listas
   * de precios, que se cargan aparte.
   */
  async bulkPriceUpdate(supplierId: string, percentage: number) {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, ...tenantScope() } });
    if (!supplier) {
      return { statusCode: 404, message: "Proveedor no encontrado" };
    }

    if (!Number.isFinite(percentage) || percentage <= -100) {
      return { statusCode: 400, message: "Porcentaje inválido" };
    }

    const products = await prisma.product.findMany({
      where: { supplierId, isActive: true, ...tenantScope() },
      select: { id: true, saleUnit: true, price: true, pricePerKg: true },
    });

    if (products.length === 0) {
      return { ok: true, count: 0 };
    }

    const factor = 1 + percentage / 100;

    const updated = await prisma.$transaction(
      products.map((product) => {
        const isKg = product.saleUnit === SaleUnit.KG;
        const nextPrice = isKg ? 0 : round2(product.price * factor);
        const nextPricePerKg = !isKg ? null : product.pricePerKg != null ? round2(product.pricePerKg * factor) : 0;

        return prisma.product.update({
          where: { id: product.id },
          data: {
            price: nextPrice,
            clientPrice: nextPrice,
            wholesalePrice: nextPrice,
            pricePerKg: nextPricePerKg,
            clientPricePerKg: nextPricePerKg,
            wholesalePricePerKg: nextPricePerKg,
          },
          select: { id: true, price: true, pricePerKg: true },
        });
      })
    );

    for (const product of updated) {
      await priceListService.syncDefaultPriceListItem(currentTenantId(), product);
    }

    return { ok: true, count: updated.length };
  },

  async getPurchaseHistory(supplierId: string) {
    const scope = tenantScope();
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, ...scope } });
    if (!supplier) throw new Error("Proveedor no encontrado.");

    const purchases = await prisma.purchase.findMany({
      where: { supplierId, ...scope },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    });

    const totalSpent = purchases.reduce((s, p) => s + p.totalAmount, 0);
    const avgPurchase = purchases.length > 0 ? totalSpent / purchases.length : 0;

    return {
      supplier,
      stats: {
        totalPurchases: purchases.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        avgPurchaseAmount: Math.round(avgPurchase * 100) / 100,
        lastPurchaseDate: purchases[0]?.date ?? null,
      },
      purchases,
    };
  },
};
