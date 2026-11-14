import prisma from "../prisma";
import { NotificationType, Prisma, Role } from "@prisma/client";

export type ChannelPrefs = { inApp: boolean; push: boolean };
export type NotificationPrefs = Partial<Record<NotificationType, ChannelPrefs>>;

/**
 * Tipos de notificacion que el usuario puede activar/desactivar desde
 * Configuracion > Notificaciones. Es la unica fuente de verdad: el frontend
 * arma la pantalla con lo que devuelve GET /notifications/preferences, asi
 * que para sumar un tipo nuevo alcanza con agregarlo aca (y emitirlo con
 * notificationService.create/broadcast/notifyStaff).
 *
 * `roles` = quienes pueden llegar a recibirla (para no mostrarle a un
 * empleado opciones de avisos que solo le llegan al admin).
 */
export const NOTIFICATION_CATALOG: {
  type: NotificationType;
  group: string;
  label: string;
  description: string;
  roles: Role[];
}[] = [
  {
    type: "ORDER_NEW",
    group: "Tienda online",
    label: "Nuevo pedido",
    description: "Cuando un cliente hace un pedido en tu tienda online.",
    roles: ["ADMIN", "EMPLEADO"],
  },
  {
    type: "ORDER_PAID",
    group: "Tienda online",
    label: "Pago aprobado",
    description: "Cuando Mercado Pago aprueba el pago de un pedido.",
    roles: ["ADMIN", "EMPLEADO"],
  },
  {
    type: "ORDER_TRANSFER_PROOF",
    group: "Tienda online",
    label: "Comprobante de transferencia",
    description: "Cuando un cliente sube el comprobante de su transferencia para que lo revises.",
    roles: ["ADMIN", "EMPLEADO"],
  },
  {
    type: "LOW_STOCK",
    group: "Stock",
    label: "Stock bajo",
    description: "Productos que quedaron por debajo del stock mínimo (se revisa todos los días a la mañana).",
    roles: ["ADMIN"],
  },
  {
    type: "STOCK_FALLBACK",
    group: "Stock",
    label: "Stock de respaldo usado",
    description: "Cuando una venta descuenta stock de otra sucursal porque en la suya no había.",
    roles: ["ADMIN"],
  },
  {
    type: "PRINTER_NOT_CONFIGURED",
    group: "Sistema",
    label: "Impresora sin configurar",
    description: "Cuando se intenta imprimir un ticket y no hay impresora configurada.",
    roles: ["ADMIN"],
  },
  {
    type: "ONBOARDING_PENDING",
    group: "Sistema",
    label: "Guía de arranque",
    description: "Recordatorios de los pasos que te faltan para terminar de configurar el sistema.",
    roles: ["ADMIN"],
  },
  {
    type: "SYSTEM",
    group: "Sistema",
    label: "Avisos del sistema",
    description: "Novedades y avisos generales de ComarPOS.",
    roles: ["ADMIN", "EMPLEADO", "CONTADOR"],
  },
];

const CATALOG_TYPES = new Set<string>(NOTIFICATION_CATALOG.map((c) => c.type));

function parsePrefs(raw: Prisma.JsonValue | null | undefined): NotificationPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: NotificationPrefs = {};
  for (const [type, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    out[type as NotificationType] = { inApp: v.inApp !== false, push: v.push !== false };
  }
  return out;
}

// Ausente = activado: un tipo nuevo que se agregue al catalogo arranca
// prendido para todos sin necesidad de migrar datos.
function channelFor(prefs: NotificationPrefs, type: NotificationType): ChannelPrefs {
  return prefs[type] ?? { inApp: true, push: true };
}

export const notificationPrefsService = {
  async getForUser(userId: string, role?: Role | null) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true, role: true },
    });
    const prefs = parsePrefs(user?.notificationPrefs);
    const effectiveRole = role ?? user?.role;
    return NOTIFICATION_CATALOG.filter((c) => !effectiveRole || c.roles.includes(effectiveRole)).map((c) => ({
      ...c,
      ...channelFor(prefs, c.type),
    }));
  },

  /** Recibe [{ type, inApp, push }] y pisa solo esos tipos (whitelist contra el catalogo). */
  async updateForUser(userId: string, changes: unknown) {
    if (!Array.isArray(changes)) throw new Error("Formato invalido: se esperaba una lista de preferencias.");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
    const prefs = parsePrefs(user?.notificationPrefs);

    for (const item of changes) {
      if (!item || typeof item !== "object") continue;
      const { type, inApp, push } = item as Record<string, unknown>;
      if (typeof type !== "string" || !CATALOG_TYPES.has(type)) continue;
      const current = channelFor(prefs, type as NotificationType);
      prefs[type as NotificationType] = {
        inApp: typeof inApp === "boolean" ? inApp : current.inApp,
        push: typeof push === "boolean" ? push : current.push,
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { notificationPrefs: prefs as Prisma.InputJsonValue },
    });
    return this.getForUser(userId);
  },

  /** Tipos que el usuario apago para la campanita (se filtran al listar). */
  async hiddenInAppTypes(userId: string): Promise<NotificationType[]> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
    const prefs = parsePrefs(user?.notificationPrefs);
    return (Object.keys(prefs) as NotificationType[]).filter((t) => prefs[t]?.inApp === false);
  },

  /**
   * De una lista de destinatarios: a quienes guardarles la notificacion
   * (tienen al menos un canal prendido) y a quienes mandarles push.
   */
  async splitRecipients(userIds: string[], type: NotificationType) {
    if (!userIds.length) return { store: [] as string[], push: [] as string[] };
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, notificationPrefs: true },
    });
    const store: string[] = [];
    const push: string[] = [];
    for (const u of users) {
      const ch = channelFor(parsePrefs(u.notificationPrefs), type);
      if (ch.inApp || ch.push) store.push(u.id);
      if (ch.push) push.push(u.id);
    }
    return { store, push };
  },
};
