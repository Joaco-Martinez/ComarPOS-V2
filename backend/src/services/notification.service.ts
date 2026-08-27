import prisma from "../prisma";
import { NotificationType } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import onboardingService, { ONBOARDING_STEPS } from "./onboarding.service";
import { pushService } from "./push.service";

export const notificationService = {
  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: object;
  }) {
    const notif = await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data ?? undefined,
        tenantId: currentTenantId(),
      },
    });
    await pushService.sendToUsers([data.userId], { title: data.title, body: data.body, data: data.data });
    return notif;
  },

  async broadcast(data: {
    userIds: string[];
    type: NotificationType;
    title: string;
    body: string;
    data?: object;
  }) {
    const result = await prisma.notification.createMany({
      data: data.userIds.map((userId) => ({
        userId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data ?? undefined,
        tenantId: currentTenantId(),
      })),
    });
    await pushService.sendToUsers(data.userIds, { title: data.title, body: data.body, data: data.data });
    return result;
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

  // Una notificacion por cada (producto, ubicacion) por debajo de su propio
  // minimo - generalizado a N ubicaciones dinamicas (antes sumaba
  // stockLocal+stockDeposito contra un unico minStock fijo; ver doc de
  // migracion "ubicaciones de stock dinamicas", y alert.service.ts que
  // sigue el mismo criterio para la pagina de Alertas).
  async checkLowStock() {
    const scope = tenantScope();
    const products = await prisma.product.findMany({
      where: { isActive: true, isService: false, unlimitedStock: false, ...scope },
      select: {
        id: true,
        name: true,
        sku: true,
        saleUnit: true,
        stock: { include: { businessLocation: { select: { name: true, isActive: true } } } },
      },
    });

    const tenantId = currentTenantId();
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", tenantId },
      select: { id: true },
    });
    if (!admins.length) return { created: 0 };

    let created = 0;
    for (const product of products) {
      const isKg = product.saleUnit === "KG";
      for (const row of product.stock) {
        if (!row.businessLocation.isActive) continue;

        const qty = Number((isKg ? row.quantityKg : row.quantity) ?? 0);
        const min = isKg ? row.minQuantityKg : row.minQuantity;
        if (min == null || Number(min) <= 0) continue;
        if (qty > Number(min)) continue;

        await this.broadcast({
          userIds: admins.map((u) => u.id),
          type: "LOW_STOCK" as NotificationType,
          title: "Stock bajo",
          body: `${product.name}${product.sku ? ` (SKU: ${product.sku})` : ""} tiene ${qty} ${isKg ? "kg" : "unidades"} en "${row.businessLocation.name}" (mínimo: ${min}).`,
        });
        created += admins.length;
      }
    }
    return { created };
  },

  // Recuerda a los admins que faltan pasos de la guía de arranque (/guia),
  // por si no vieron el checklist del dashboard. No re-notifica a quien ya
  // tiene un aviso sin leer, para no spamear en cada corrida del cron.
  async checkOnboarding() {
    const tenantId = currentTenantId();
    if (!tenantId) return { created: 0 };

    const checklist = await onboardingService.getChecklist();
    const pendingCount = ONBOARDING_STEPS.filter((s) => !checklist[s]).length;
    if (pendingCount === 0) return { created: 0 };

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", tenantId },
      select: { id: true },
    });
    if (!admins.length) return { created: 0 };

    const alreadyNotified = await prisma.notification.findMany({
      where: {
        type: "ONBOARDING_PENDING" as NotificationType,
        isRead: false,
        userId: { in: admins.map((u) => u.id) },
        ...tenantScope(),
      },
      select: { userId: true },
    });
    const notifiedIds = new Set(alreadyNotified.map((n) => n.userId));
    const targets = admins.filter((u) => !notifiedIds.has(u.id));
    if (!targets.length) return { created: 0 };

    await this.broadcast({
      userIds: targets.map((u) => u.id),
      type: "ONBOARDING_PENDING" as NotificationType,
      title: "Te faltan pasos para arrancar",
      body: `Tenés ${pendingCount} paso${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"} en la guía de arranque.`,
      data: { href: "/guia" },
    });
    return { created: targets.length };
  },
};
