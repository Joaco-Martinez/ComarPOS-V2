/**
 * Web Push (estandar W3C + VAPID) para la PWA - opt-in, mismo criterio que
 * firebase.ts / sentry.ts: sin VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY este
 * modulo no hace nada y push.service.ts no-opea (las notificaciones in-app
 * siguen funcionando igual).
 *
 * A diferencia de Firebase, no hace falta ninguna cuenta externa: las claves
 * se generan una sola vez con
 *     npx web-push generate-vapid-keys
 * y se pegan en VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (ver .env.example).
 * IMPORTANTE: no regenerarlas despues de estar en produccion - cambiar la
 * clave invalida todas las suscripciones existentes (cada usuario tendria
 * que volver a activar las notificaciones en su celu).
 *
 * VAPID_SUBJECT es un contacto para los servicios de push (Apple/Google/
 * Mozilla) en caso de problemas: "mailto:alguien@dominio" o una URL https.
 */
import webpush from "web-push";

const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || "";
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";

function resolveSubject(): string {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit) return explicit;
  const frontend = process.env.FRONTEND_URL?.trim();
  if (frontend?.startsWith("https://")) return frontend.replace(/\/$/, "");
  return "mailto:notificaciones@comarpos.local";
}

let enabled = false;
if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(resolveSubject(), publicKey, privateKey);
    enabled = true;
    console.log("🔔 Web Push (VAPID) configurado (notificaciones push en la PWA activas)");
  } catch (err) {
    console.error("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY invalidas - Web Push deshabilitado.", err);
  }
}

export const webPushEnabled = enabled;
export const vapidPublicKey = enabled ? publicKey : null;
export { webpush };
