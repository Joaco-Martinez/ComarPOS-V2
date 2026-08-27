import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

export const stockCountService = {
  async startCount(data: { userId: string; businessLocationId: string; notes?: string }) {
    const scope = tenantScope();

    const location = await prisma.businessLocation.findFirst({
      where: { id: data.businessLocationId, ...scope },
    });
    if (!location) throw new Error("Ubicación no encontrada.");

    // Only one IN_PROGRESS count per location
    const existing = await prisma.stockCount.findFirst({
      where: { status: { in: ["DRAFT", "IN_PROGRESS"] }, businessLocationId: data.businessLocationId, ...scope },
    });
    if (existing) throw new Error("Ya hay un conteo activo para esta ubicación.");

    // Pre-populate con el stock actual de esta ubicacion para todos los
    // productos activos (ver doc de migracion "ubicaciones de stock
    // dinamicas" - reemplaza el split fijo Product.stockLocal/stockDeposito).
    const stockRows = await prisma.productStock.findMany({
      where: {
        businessLocationId: data.businessLocationId,
        product: { isActive: true, isService: false, unlimitedStock: false, ...scope },
      },
      select: {
        productId: true,
        quantity: true,
        quantityKg: true,
        product: { select: { saleUnit: true } },
      },
    });

    const stockCount = await prisma.stockCount.create({
      data: {
        userId: data.userId,
        businessLocationId: data.businessLocationId,
        notes: data.notes ?? null,
        status: "IN_PROGRESS",
        tenantId: currentTenantId(),
        items: {
          create: stockRows.map((row) => {
            const isKg = row.product.saleUnit === "KG";
            return {
              productId: row.productId,
              systemStock: isKg ? row.quantityKg : row.quantity,
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
        businessLocation: true,
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
    if (!count.businessLocationId) throw new Error("Este conteo no tiene una ubicación asociada.");
    const businessLocationId = count.businessLocationId;

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

        await tx.productStock.upsert({
          where: { productId_businessLocationId: { productId: item.productId, businessLocationId } },
          update: isKg ? { quantityKg: { increment: diff } } : { quantity: { increment: Math.round(diff) } },
          create: {
            productId: item.productId,
            businessLocationId,
            tenantId: currentTenantId(),
            ...(isKg ? { quantityKg: diff } : { quantity: Math.round(diff) }),
          },
        });

        if (diff !== 0) {
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              userId,
              type: "ADJUSTMENT",
              toLocationId: businessLocationId,
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
    }, { timeout: 20000, maxWait: 20000 });

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
        businessLocation: true,
        _count: { select: { items: true } },
      },
      orderBy: { startedAt: "desc" },
    });
  },
};
