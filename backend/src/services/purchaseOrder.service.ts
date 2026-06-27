import prisma from "../prisma";
import { PurchaseOrderStatus } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

export const purchaseOrderService = {
  async getAll(status?: PurchaseOrderStatus) {
    return prisma.purchaseOrder.findMany({
      where: { ...tenantScope(), ...(status ? { status } : {}) },
      include: {
        supplier: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(id: string) {
    return prisma.purchaseOrder.findFirst({
      where: { id, ...tenantScope() },
      include: {
        supplier: true,
        user: { select: { id: true, name: true } },
        purchases: { select: { id: true, totalAmount: true, createdAt: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, saleUnit: true } } } },
      },
    });
  },

  async create(data: {
    supplierId: string;
    userId: string;
    expectedDate?: Date;
    notes?: string;
    items: { productId: string; quantity: number; unitCost?: number }[];
  }) {
    if (!data.items.length) throw new Error("La orden debe tener al menos un ítem.");
    const scope = tenantScope();

    const supplier = await prisma.supplier.findFirst({ where: { id: data.supplierId, ...scope } });
    if (!supplier) throw new Error("Proveedor no encontrado.");

    const totalAmount = data.items.reduce(
      (sum, i) => sum + (i.unitCost ?? 0) * i.quantity,
      0
    );

    return prisma.purchaseOrder.create({
      data: {
        supplierId: data.supplierId,
        userId: data.userId,
        expectedDate: data.expectedDate ?? null,
        notes: data.notes ?? null,
        totalAmount,
        tenantId: currentTenantId(),
        items: {
          create: data.items.map((i) => ({
            productId: i.productId,
            quantityOrdered: i.quantity,
            unitCost: i.unitCost ?? 0,
            subtotal: (i.unitCost ?? 0) * i.quantity,
          })),
        },
      },
      include: { items: true },
    });
  },

  async updateStatus(id: string, status: PurchaseOrderStatus) {
    const order = await prisma.purchaseOrder.findFirst({ where: { id, ...tenantScope() } });
    if (!order) throw new Error("Orden de compra no encontrada.");
    const allowed: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
      DRAFT: ["SENT", "CANCELLED"],
      SENT: ["PARTIAL", "RECEIVED", "CANCELLED"],
      PARTIAL: ["RECEIVED", "CANCELLED"],
      RECEIVED: [],
      CANCELLED: [],
    };
    if (!allowed[order.status].includes(status)) {
      throw new Error(`No se puede pasar de ${order.status} a ${status}.`);
    }
    return prisma.purchaseOrder.update({ where: { id }, data: { status } });
  },

  async receiveItems(id: string, data: {
    items: { productId: string; receivedQuantity: number }[];
  }) {
    const scope = tenantScope();
    const order = await prisma.purchaseOrder.findFirst({
      where: { id, status: { in: ["SENT", "PARTIAL"] }, ...scope },
      include: { items: true },
    });
    if (!order) throw new Error("Orden no encontrada o no está en estado SENT/PARTIAL.");

    // Determine new status by comparing received vs ordered quantities
    // Schema doesn't have receivedQuantity on items — we mark the order as RECEIVED
    // when admin confirms receipt and link it to a Purchase record
    const anyItems = data.items.length > 0;
    const newStatus: PurchaseOrderStatus = anyItems ? "RECEIVED" : order.status;

    return prisma.purchaseOrder.update({
      where: { id },
      data: { status: newStatus },
    });
  },

  async remove(id: string) {
    const order = await prisma.purchaseOrder.findFirst({ where: { id, status: "DRAFT", ...tenantScope() } });
    if (!order) throw new Error("Solo se pueden eliminar órdenes en estado DRAFT.");
    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    return prisma.purchaseOrder.delete({ where: { id } });
  },
};
