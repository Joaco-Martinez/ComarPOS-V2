import prisma from "../prisma";
import { PushPlatform } from "@prisma/client";
import { getMessaging, SendResponse } from "firebase-admin/messaging";
import { firebaseEnabled, getFirebaseApp } from "../config/firebase";
import { currentTenantId } from "../context/tenantContext";

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

  // Silencioso a proposito (ver firebase.ts): sin FIREBASE_SERVICE_ACCOUNT
  // configurado esto no debe romper el flujo de notificationService, que
  // ya funciona hoy sin push nativo.
  async sendToUsers(
    userIds: string[],
    payload: { title: string; body: string; data?: object }
  ) {
    if (!firebaseEnabled || !userIds.length) return;
    const app = getFirebaseApp();
    if (!app) return;

    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    if (!tokens.length) return;

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
  },
};
