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
   * Aumento (o descuento) masivo de precios de TODOS los productos activos
   * vinculados a este proveedor - pedido explicito: cuando el proveedor sube
   * un %, poder trasladarlo (al costo, a la venta, o a ambos) de un solo
   * saque en vez de producto por producto. Sigue el mismo patron que
   * priceListService.bulkApply: factor = 1 + percentage/100 sobre el valor
   * actual de cada producto, nunca acumulativo sobre un aumento previo.
   * `target` controla que campos toca:
   *  - "sale": price/pricePerKg (y espejos clientPrice/wholesalePrice) - default, compat con el comportamiento previo.
   *  - "cost": purchasePrice (costo de compra).
   *  - "both": ambos a la vez, mismo porcentaje.
   */
  async bulkPriceUpdate(supplierId: string, percentage: number, target: "sale" | "cost" | "both" = "sale") {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, ...tenantScope() } });
    if (!supplier) {
      return { statusCode: 404, message: "Proveedor no encontrado" };
    }

    if (!Number.isFinite(percentage) || percentage <= -100) {
      return { statusCode: 400, message: "Porcentaje inválido" };
    }

    if (target !== "sale" && target !== "cost" && target !== "both") {
      return { statusCode: 400, message: "target inválido (usar sale, cost o both)" };
    }

    const applySale = target === "sale" || target === "both";
    const applyCost = target === "cost" || target === "both";

    const products = await prisma.product.findMany({
      where: { supplierId, isActive: true, ...tenantScope() },
      select: { id: true, saleUnit: true, price: true, pricePerKg: true, purchasePrice: true },
    });

    if (products.length === 0) {
      return { ok: true, count: 0 };
    }

    const factor = 1 + percentage / 100;

    const updated = await prisma.$transaction(
      products.map((product) => {
        const isKg = product.saleUnit === SaleUnit.KG;
        const data: Record<string, number | null> = {};

        if (applySale) {
          const nextPrice = isKg ? 0 : round2(product.price * factor);
          const nextPricePerKg = !isKg ? null : product.pricePerKg != null ? round2(product.pricePerKg * factor) : 0;
          data.price = nextPrice;
          data.clientPrice = nextPrice;
          data.wholesalePrice = nextPrice;
          data.pricePerKg = nextPricePerKg;
          data.clientPricePerKg = nextPricePerKg;
          data.wholesalePricePerKg = nextPricePerKg;
        }

        if (applyCost) {
          data.purchasePrice = round2(product.purchasePrice * factor);
        }

        return prisma.product.update({
          where: { id: product.id },
          data,
          select: { id: true, price: true, pricePerKg: true },
        });
      })
    );

    if (applySale) {
      for (const product of updated) {
        await priceListService.syncDefaultPriceListItem(currentTenantId(), product);
      }
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
