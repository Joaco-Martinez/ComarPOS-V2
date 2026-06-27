import prisma from "../prisma";
import { NotificationType } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

export const notificationService = {
  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: object;
  }) {
    return prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data ?? undefined,
        tenantId: currentTenantId(),
      },
    });
  },

  async broadcast(data: {
    userIds: string[];
    type: NotificationType;
    title: string;
    body: string;
    data?: object;
  }) {
    return prisma.notification.createMany({
      data: data.userIds.map((userId) => ({
        userId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data ?? undefined,
        tenantId: currentTenantId(),
      })),
    });
  },

  async getForUser(userId: string, onlyUnread = false) {
    return prisma.notification.findMany({
      where: {
        userId,
        ...tenantScope(),
        ...(onlyUnread ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },

  async markRead(id: string, userId: string) {
    const notif = await prisma.notification.findFirst({
      where: { id, userId, ...tenantScope() },
    });
    if (!notif) throw new Error("Notificación no encontrada.");
    return prisma.notification.update({ where: { id }, data: { isRead: true } });
  },

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false, ...tenantScope() },
      data: { isRead: true },
    });
  },

  async getUnreadCount(userId: string) {
    return prisma.notification.count({
      where: { userId, isRead: false, ...tenantScope() },
    });
  },

  async checkLowStock() {
    const scope = tenantScope();
    const products = await prisma.product.findMany({
      where: { isActive: true, isService: false, ...scope },
      select: { id: true, name: true, sku: true, stockLocal: true, stockDeposito: true, minStock: true, tenantId: true },
    });

    const tenantId = currentTenantId();
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", tenantId },
      select: { id: true },
    });
    if (!admins.length) return { created: 0 };

    let created = 0;
    for (const product of products) {
      const totalStock = product.stockLocal + product.stockDeposito;
      if (product.minStock !== null && totalStock <= product.minStock) {
        await prisma.notification.createMany({
          data: admins.map((u) => ({
            userId: u.id,
            type: "LOW_STOCK" as NotificationType,
            title: "Stock bajo",
            body: `${product.name}${product.sku ? ` (SKU: ${product.sku})` : ""} tiene ${totalStock} unidades (mínimo: ${product.minStock}).`,
            tenantId,
          })),
        });
        created += admins.length;
      }
    }
    return { created };
  },
};
