import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

export const priceListService = {
  async getAll() {
    return prisma.priceList.findMany({
      where: { ...tenantScope() },
      include: { _count: { select: { items: true, clients: true } } },
      orderBy: { name: "asc" },
    });
  },

  async getById(id: string) {
    return prisma.priceList.findFirst({
      where: { id, ...tenantScope() },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true, saleUnit: true } } } },
        _count: { select: { clients: true } },
      },
    });
  },

  async create(data: { name: string; description?: string; isDefault?: boolean }) {
    const tenantId = currentTenantId();
    if (data.isDefault) {
      // Unset any existing default
      await prisma.priceList.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } });
    }
    return prisma.priceList.create({
      data: { name: data.name, description: data.description ?? null, isDefault: data.isDefault ?? false, tenantId },
    });
  },

  async update(id: string, data: { name?: string; description?: string; isActive?: boolean; isDefault?: boolean }) {
    const scope = tenantScope();
    const existing = await prisma.priceList.findFirst({ where: { id, ...scope } });
    if (!existing) throw new Error("Lista de precios no encontrada.");
    if (data.isDefault) {
      await prisma.priceList.updateMany({ where: { tenantId: currentTenantId(), isDefault: true }, data: { isDefault: false } });
    }
    return prisma.priceList.update({ where: { id }, data });
  },

  async remove(id: string) {
    const scope = tenantScope();
    const existing = await prisma.priceList.findFirst({
      where: { id, ...scope },
      include: { _count: { select: { clients: true } } },
    });
    if (!existing) throw new Error("Lista de precios no encontrada.");
    if (existing._count.clients > 0) {
      throw new Error(`No se puede eliminar: ${existing._count.clients} cliente(s) la usan. Reasigná primero.`);
    }
    await prisma.priceListItem.deleteMany({ where: { priceListId: id } });
    return prisma.priceList.delete({ where: { id } });
  },

  async upsertItem(data: { priceListId: string; productId: string; price: number }) {
    const scope = tenantScope();
    const list = await prisma.priceList.findFirst({ where: { id: data.priceListId, ...scope } });
    if (!list) throw new Error("Lista de precios no encontrada.");
    if (data.price < 0) throw new Error("El precio no puede ser negativo.");

    return prisma.priceListItem.upsert({
      where: { priceListId_productId: { priceListId: data.priceListId, productId: data.productId } },
      create: { priceListId: data.priceListId, productId: data.productId, price: data.price },
      update: { price: data.price },
    });
  },

  async removeItem(priceListId: string, productId: string) {
    const scope = tenantScope();
    const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...scope } });
    if (!list) throw new Error("Lista de precios no encontrada.");
    return prisma.priceListItem.delete({
      where: { priceListId_productId: { priceListId, productId } },
    });
  },

  // Bulk-set items (replaces all existing items)
  async setAllItems(priceListId: string, items: { productId: string; price: number }[]) {
    const scope = tenantScope();
    const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...scope } });
    if (!list) throw new Error("Lista de precios no encontrada.");

    await prisma.$transaction(async (tx) => {
      await tx.priceListItem.deleteMany({ where: { priceListId } });
      if (items.length) {
        await tx.priceListItem.createMany({
          data: items.map((i) => ({ priceListId, productId: i.productId, price: i.price })),
        });
      }
    });

    return priceListService.getById(priceListId);
  },

  // Given clientId, resolve their effective price for a product
  async getPriceForClient(clientId: string, productId: string) {
    const scope = tenantScope();
    const client = await prisma.client.findFirst({
      where: { id: clientId, ...scope },
      select: { priceListId: true },
    });
    if (!client?.priceListId) return null;

    const item = await prisma.priceListItem.findUnique({
      where: { priceListId_productId: { priceListId: client.priceListId, productId } },
    });
    return item?.price ?? null;
  },

  async assignToClient(clientId: string, priceListId: string | null) {
    const scope = tenantScope();
    const client = await prisma.client.findFirst({ where: { id: clientId, ...scope } });
    if (!client) throw new Error("Cliente no encontrado.");
    if (priceListId) {
      const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...scope } });
      if (!list) throw new Error("Lista de precios no encontrada.");
    }
    return prisma.client.update({ where: { id: clientId }, data: { priceListId } });
  },
};
