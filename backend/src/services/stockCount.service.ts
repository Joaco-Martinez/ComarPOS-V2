import prisma from "../prisma";
import { Location } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

export const stockCountService = {
  async startCount(data: { userId: string; location: Location; notes?: string }) {
    const scope = tenantScope();

    // Only one IN_PROGRESS count per location
    const existing = await prisma.stockCount.findFirst({
      where: { status: { in: ["DRAFT", "IN_PROGRESS"] }, location: data.location, ...scope },
    });
    if (existing) throw new Error("Ya hay un conteo activo para esta ubicación.");

    // Pre-populate with all active products
    const products = await prisma.product.findMany({
      where: { isActive: true, isService: false, ...scope },
      select: {
        id: true, name: true, saleUnit: true,
        stockLocal: true, stockDeposito: true,
        stockLocalKg: true, stockDepositoKg: true,
      },
    });

    const stockCount = await prisma.stockCount.create({
      data: {
        userId: data.userId,
        location: data.location,
        notes: data.notes ?? null,
        status: "IN_PROGRESS",
        tenantId: currentTenantId(),
        items: {
          create: products.map((p) => {
            const isKg = p.saleUnit === "KG";
            const systemStock =
              data.location === "LOCAL"
                ? isKg ? p.stockLocalKg : p.stockLocal
                : isKg ? p.stockDepositoKg : p.stockDeposito;
            return {
              productId: p.id,
              systemStock,
              countedStock: null,
              difference: null,
            };
          }),
        },
      },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true, saleUnit: true } } } } },
    });

    return stockCount;
  },

  async getById(id: string) {
    return prisma.stockCount.findFirst({
      where: { id, ...tenantScope() },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, sku: true, saleUnit: true, category: { select: { name: true } } } } },
          orderBy: { product: { name: "asc" } },
        },
        user: { select: { id: true, name: true } },
      },
    });
  },

  async updateItem(data: { stockCountId: string; productId: string; countedStock: number }) {
    const scope = tenantScope();
    const count = await prisma.stockCount.findFirst({
      where: { id: data.stockCountId, status: "IN_PROGRESS", ...scope },
    });
    if (!count) throw new Error("Conteo no encontrado o no está en progreso.");

    const item = await prisma.stockCountItem.findUnique({
      where: { stockCountId_productId: { stockCountId: data.stockCountId, productId: data.productId } },
    });
    if (!item) throw new Error("Producto no encontrado en el conteo.");

    const difference = Math.round((data.countedStock - item.systemStock) * 1000) / 1000;
    return prisma.stockCountItem.update({
      where: { stockCountId_productId: { stockCountId: data.stockCountId, productId: data.productId } },
      data: { countedStock: data.countedStock, difference },
    });
  },

  async completeCount(id: string, userId: string) {
    const scope = tenantScope();
    const count = await prisma.stockCount.findFirst({
      where: { id, status: "IN_PROGRESS", ...scope },
      include: { items: { include: { product: { select: { saleUnit: true } } } } },
    });
    if (!count) throw new Error("Conteo no encontrado o no está en progreso.");

    const uncounted = count.items.filter((i) => i.countedStock === null);
    if (uncounted.length > 0) {
      throw new Error(`Hay ${uncounted.length} producto(s) sin contar. Completá todos antes de cerrar.`);
    }

    // Apply stock adjustments
    await prisma.$transaction(async (tx) => {
      for (const item of count.items) {
        if (item.countedStock === null || item.difference === 0) continue;
        const isKg = item.product.saleUnit === "KG";
        const diff = item.difference!;

        if (isKg) {
          await tx.product.update({
            where: { id: item.productId },
            data:
              count.location === "LOCAL"
                ? { stockLocalKg: { increment: diff } }
                : { stockDepositoKg: { increment: diff } },
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data:
              count.location === "LOCAL"
                ? { stockLocal: { increment: Math.round(diff) } }
                : { stockDeposito: { increment: Math.round(diff) } },
          });
        }

        if (diff !== 0) {
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              userId,
              type: "ADJUSTMENT",
              to: count.location,
              ...(isKg ? { quantityKg: diff } : { quantity: Math.round(diff) }),
              reason: `Ajuste por toma de inventario #${id.slice(0, 8)}`,
              reference: id,
              tenantId: currentTenantId(),
            },
          });
        }
      }

      await tx.stockCount.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    });

    return prisma.stockCount.findFirst({ where: { id }, include: { items: true } });
  },

  async cancelCount(id: string) {
    const scope = tenantScope();
    const count = await prisma.stockCount.findFirst({
      where: { id, status: { in: ["DRAFT", "IN_PROGRESS"] }, ...scope },
    });
    if (!count) throw new Error("Conteo no encontrado o no puede cancelarse.");
    return prisma.stockCount.update({ where: { id }, data: { status: "CANCELLED" } });
  },

  async getHistory() {
    return prisma.stockCount.findMany({
      where: { ...tenantScope() },
      include: {
        user: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { startedAt: "desc" },
    });
  },
};
