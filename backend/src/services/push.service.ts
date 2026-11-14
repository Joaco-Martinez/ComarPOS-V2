import prisma from "../prisma";
import { PushPlatform } from "@prisma/client";
import { getMessaging, SendResponse } from "firebase-admin/messaging";
import { firebaseEnabled, getFirebaseApp } from "../config/firebase";
import { webPushEnabled, vapidPublicKey, webpush } from "../config/webPush";
import { currentTenantId } from "../context/tenantContext";

type PushPayload = { title: string; body: string; data?: object; tag?: string };

// href (ej. "/tienda-online/pedidos") -> URL relativa con el slug del tenant
// ("/mi-negocio/tienda-online/pedidos"), que es lo que abre el service
// worker al tocar la notificacion.
async function resolveUrl(href: unknown): Promise<string> {
  const tenantId = currentTenantId();
  if (!tenantId) return "/app";
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!tenant?.slug) return "/app";
  const path = typeof href === "string" && href.startsWith("/") ? href : "/dashboard";
  return `/${tenant.slug}${path}`;
}

async function sendNative(userIds: string[], payload: PushPayload) {
  if (!firebaseEnabled) return 0;
  const app = getFirebaseApp();
  if (!app) return 0;

  const tokens = await prisma.pushToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true },
  });
  if (!tokens.length) return 0;

  // FCM data payload solo admite valores string.
  const dataStr: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.data ?? {})) {
    dataStr[k] = typeof v === "string" ? v : JSON.stringify(v);
  }

  const res = await getMessaging(app).sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    notification: { title: payload.title, body: payload.body },
    data: dataStr,
  });

  const stale = res.responses
    .map((r: SendResponse, i: number) => ({ ok: r.success, code: r.error?.code, token: tokens[i].token }))
    .filter((r) => !r.ok && r.code === "messaging/registration-token-not-registered")
    .map((r) => r.token);
  if (stale.length) {
    await prisma.pushToken.deleteMany({ where: { token: { in: stale } } });
  }
  return res.successCount;
}

async function sendWeb(userIds: string[], payload: PushPayload) {
  if (!webPushEnabled) return 0;
  const subs = await prisma.webPushSubscription.findMany({
    where: { userId: { in: userIds } },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  if (!subs.length) return 0;

  const url = await resolveUrl((payload.data as { href?: unknown } | undefined)?.href);
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url,
    tag: payload.tag,
    data: payload.data ?? {},
  });

  const stale: string[] = [];
  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: "high" }
        );
        ok++;
      } catch (err: any) {
        // 404/410 = el navegador dio de baja la suscripcion (desinstalo la
        // app, revoco el permiso, etc.): se borra para no reintentar siempre.
        if (err?.statusCode === 404 || err?.statusCode === 410) stale.push(s.endpoint);
        else console.error("[web-push] Error enviando notificacion:", err?.statusCode, err?.body || err?.message);
      }
    })
  );
  if (stale.length) {
    await prisma.webPushSubscription.deleteMany({ where: { endpoint: { in: stale } } });
  }
  return ok;
}

export const pushService = {
  async registerToken(userId: string, token: string, platform: PushPlatform) {
    // upsert por token (no por userId+token): un mismo dispositivo
    // reinstalado o con otra cuenta logueada tiene que pisar el dueño
    // anterior del token, si no quedan pushes viejos yendo a un celu que
    // ahora usa otro usuario.
    return prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform, tenantId: currentTenantId() },
      update: { userId, platform, tenantId: currentTenantId() },
    });
  },

  async unregisterToken(token: string) {
    await prisma.pushToken.deleteMany({ where: { token } });
  },

  webPushPublicKey() {
    return { enabled: webPushEnabled, publicKey: vapidPublicKey };
  },

  // Mismo criterio que registerToken: upsert por endpoint, para que un
  // navegador que cambio de cuenta deje de recibir los avisos del anterior.
  async registerWebSubscription(
    userId: string,
    sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } },
    userAgent?: string
  ) {
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth || !/^https:\/\//.test(endpoint)) {
      throw new Error("Suscripción push inválida.");
    }
    const ua = userAgent?.slice(0, 300) || null;
    return prisma.webPushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth, userAgent: ua, tenantId: currentTenantId() },
      update: { userId, p256dh, auth, userAgent: ua, tenantId: currentTenantId() },
    });
  },

  async unregisterWebSubscription(userId: string, endpoint: string) {
    await prisma.webPushSubscription.deleteMany({ where: { endpoint, userId } });
  },

  // Nunca tira: un push que falla (sin credenciales, servicio caido, etc.)
  // no puede romper el flujo que genero la notificacion (una venta, un
  // pedido de la tienda...).
  async sendToUsers(userIds: string[], payload: PushPayload) {
    if (!userIds.length) return { native: 0, web: 0 };
    const [native, web] = await Promise.all([
      sendNative(userIds, payload).catch((err) => {
        console.error("[push] Error FCM:", err?.message || err);
        return 0;
      }),
      sendWeb(userIds, payload).catch((err) => {
        console.error("[web-push] Error:", err?.message || err);
        return 0;
      }),
    ]);
    return { native, web };
  },
};
