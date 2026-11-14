import prisma from "../prisma";
import { NotificationType, Role } from "@prisma/client";
import { notificationPrefsService } from "./notificationPrefs.service";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import onboardingService, { ONBOARDING_STEPS } from "./onboarding.service";
import { pushService } from "./push.service";

export const notificationService = {
  // Respeta las preferencias de cada usuario (Configuracion >
  // Notificaciones): push = llega al celu; inApp = se muestra en la
  // campanita. Si al menos un canal esta prendido la fila se guarda igual
  // (aunque inApp este apagado, getForUser la oculta): checkLowStock,
  // checkOnboarding y el aviso de impresora deduplican mirando las filas sin
  // leer, y sin la fila un usuario con "solo push" recibiria el mismo push en
  // cada corrida del cron / cada venta. Si los dos canales estan apagados no
  // se hace nada.
  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: object;
  }) {
    const { store, push } = await notificationPrefsService.splitRecipients([data.userId], data.type);
    let notif = null;
    if (store.length) {
      notif = await prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          body: data.body,
          data: data.data ?? undefined,
          tenantId: currentTenantId(),
        },
      });
    }
    if (push.length) {
      await pushService.sendToUsers(push, { title: data.title, body: data.body, data: data.data });
    }
    return notif;
  },

  async broadcast(data: {
    userIds: string[];
    type: NotificationType;
    title: string;
    body: string;
    data?: object;
  }) {
    const { store, push } = await notificationPrefsService.splitRecipients(data.userIds, data.type);
    const result = store.length
      ? await prisma.notification.createMany({
          data: store.map((userId) => ({
            userId,
            type: data.type,
            title: data.title,
            body: data.body,
            data: data.data ?? undefined,
            tenantId: currentTenantId(),
          })),
        })
      : { count: 0 };
    if (push.length) {
      await pushService.sendToUsers(push, { title: data.title, body: data.body, data: data.data });
    }
    return result;
  },

  // Avisa a todo el personal activo del tenant actual con alguno de esos
  // roles (por defecto ADMIN + EMPLEADO). Pensado para eventos que pasan
  // fuera de una sesion del negocio (ej. un pedido de la tienda online) --
  // nunca tira: un error notificando no puede romper el flujo que lo origino.
  async notifyStaff(data: {
    type: NotificationType;
    title: string;
    body: string;
    data?: object;
    roles?: Role[];
  }) {
    try {
      const tenantId = currentTenantId();
      if (!tenantId) return { count: 0 };
      const staff = await prisma.user.findMany({
        where: { tenantId, isActive: true, role: { in: data.roles ?? ["ADMIN", "EMPLEADO"] } },
        select: { id: true },
      });
      if (!staff.length) return { count: 0 };
      return await this.broadcast({
        userIds: staff.map((u) => u.id),
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data,
      });
    } catch (err) {
      console.error(`[notifications] No se pudo notificar ${data.type}:`, err);
      return { count: 0 };
    }
  },

  // Push de prueba solo al usuario que lo pide (ignora preferencias), para
  // verificar desde Configuracion > Notificaciones que le llega al celu.
  async sendTest(userId: string) {
    return pushService.sendToUsers([userId], {
      title: "¡Notificaciones activadas! 🎉",
      body: "Así te van a llegar los avisos de ComarPOS a este dispositivo.",
      data: { href: "/configuracion/notificaciones" },
      tag: "TEST",
    });
  },

  async getForUser(userId: string, onlyUnread = false) {
    const hiddenTypes = await notificationPrefsService.hiddenInAppTypes(userId);
    return prisma.notification.findMany({
      where: {
        userId,
        ...tenantScope(),
        ...(hiddenTypes.length ? { type: { notIn: hiddenTypes } } : {}),
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
    const hiddenTypes = await notificationPrefsService.hiddenInAppTypes(userId);
    return prisma.notification.count({
      where: {
        userId,
        isRead: false,
        ...tenantScope(),
        ...(hiddenTypes.length ? { type: { notIn: hiddenTypes } } : {}),
      },
    });
  },

  // Una notificacion por cada (producto, ubicacion) por debajo de su propio
  // minimo - generalizado a N ubicaciones dinamicas (antes sumaba
  // stockLocal+stockDeposito contra un unico minStock fijo; ver doc de
  // migracion "ubicaciones de stock dinamicas", y alert.service.ts que
  // sigue el mismo criterio para la pagina de Alertas).
  //
  // No re-notifica un (producto, ubicacion) que ya tiene una notificacion
  // LOW_STOCK sin leer (misma idea que checkOnboarding): sin esto, cada
  // corrida del cron (ver cron/scheduler.ts) volvia a crear una notificacion
  // nueva para todos los admins mientras el producto siguiera bajo el
  // minimo, generando spam de push/email.
  async checkLowStock() {
    const scope = tenantScope();
    const products = await prisma.product.findMany({
      // Sin padres de productos con variantes: la notificacion sale por
      // variante, con su nombre completo y la sucursal.
      where: { isActive: true, isService: false, unlimitedStock: false, hasVariants: false, ...scope },
      select: {
        id: true,
        name: true,
        sku: true,
        saleUnit: true,
        stock: { include: { businessLocation: { select: { id: true, name: true, isActive: true } } } },
      },
    });

    const tenantId = currentTenantId();
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", tenantId },
      select: { id: true },
    });
    if (!admins.length) return { created: 0 };

    const pendingLowStock = await prisma.notification.findMany({
      where: {
        type: "LOW_STOCK" as NotificationType,
        isRead: false,
        userId: { in: admins.map((u) => u.id) },
        ...tenantScope(),
      },
      select: { data: true },
    });
    const alreadyNotified = new Set(
      pendingLowStock
        .map((n) => n.data as { productId?: string; businessLocationId?: string } | null)
        .filter((d): d is { productId: string; businessLocationId: string } => !!d?.productId && !!d?.businessLocationId)
        .map((d) => `${d.productId}:${d.businessLocationId}`)
    );

    let created = 0;
    for (const product of products) {
      const isKg = product.saleUnit === "KG";
      for (const row of product.stock) {
        if (!row.businessLocation.isActive) continue;

        const qty = Number((isKg ? row.quantityKg : row.quantity) ?? 0);
        const min = isKg ? row.minQuantityKg : row.minQuantity;
        if (min == null || Number(min) <= 0) continue;
        if (qty > Number(min)) continue;
        if (alreadyNotified.has(`${product.id}:${row.businessLocation.id}`)) continue;

        await this.broadcast({
          userIds: admins.map((u) => u.id),
          type: "LOW_STOCK" as NotificationType,
          title: "Stock bajo",
          body: `${product.name}${product.sku ? ` (SKU: ${product.sku})` : ""} tiene ${qty} ${isKg ? "kg" : "unidades"} en "${row.businessLocation.name}" (mínimo: ${min}).`,
          data: { productId: product.id, businessLocationId: row.businessLocation.id },
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
