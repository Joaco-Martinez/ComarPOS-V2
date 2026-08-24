/**
 * Push notifications nativas (Android/iOS via Firebase Cloud Messaging) -
 * opt-in, mismo criterio que sentry.ts. Sin FIREBASE_SERVICE_ACCOUNT
 * configurado, este modulo no hace nada: push.service.ts detecta
 * !firebaseEnabled y no-opea en vez de tirar error, para que el resto de
 * la app (que ya crea notificaciones in-app sin depender de esto) siga
 * funcionando igual antes de tener las credenciales.
 *
 * Como conseguir FIREBASE_SERVICE_ACCOUNT:
 *  1. Crear un proyecto en https://console.firebase.google.com (gratis).
 *  2. Project settings > Service accounts > Generate new private key.
 *  3. Pegar el JSON completo descargado como UNA sola linea en
 *     FIREBASE_SERVICE_ACCOUNT (ver .env.example).
 * Ese mismo proyecto de Firebase es el que despues se linkea a la app de
 * Capacitor (google-services.json en Android, GoogleService-Info.plist +
 * la APNs key subida a Firebase en iOS) para que los tokens que registra
 * el celu sean validos contra este mismo proyecto.
 */
import { initializeApp, cert, App, ServiceAccount } from "firebase-admin/app";

let app: App | null = null;

function parseServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error(
      "FIREBASE_SERVICE_ACCOUNT esta seteado pero no es JSON valido - push notifications deshabilitadas."
    );
    return null;
  }
}

const serviceAccount = parseServiceAccount();
export const firebaseEnabled = Boolean(serviceAccount);

export function getFirebaseApp(): App | null {
  if (!serviceAccount) return null;
  if (!app) {
    app = initializeApp({ credential: cert(serviceAccount) });
    console.log("🔥 Firebase Admin inicializado (push notifications activas)");
  }
  return app;
}
