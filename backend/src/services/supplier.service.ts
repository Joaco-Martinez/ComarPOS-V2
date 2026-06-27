import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

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
