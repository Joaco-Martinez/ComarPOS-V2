'use client';

import api from './api';
import { isNativeApp } from './push';

// Web Push (estandar W3C + VAPID) para la PWA: es lo que hace que los avisos
// lleguen como notificacion del celu con ComarPOS agregado a la pantalla de
// inicio. La app nativa de Capacitor usa FCM en cambio (ver lib/push.ts).

export type WebPushStatus =
  | 'unsupported'      // navegador sin Push API (o app nativa, que usa FCM)
  | 'ios-needs-install' // iPhone en Safari: solo funciona con la app agregada a Inicio
  | 'server-disabled'  // el backend no tiene VAPID configurado
  | 'denied'           // el usuario bloqueo las notificaciones del sitio
  | 'off'              // se puede activar
  | 'on';              // este dispositivo ya esta suscripto

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (window.navigator as any).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

function hasPushApi() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// PwaRegister solo registra el service worker en produccion (en dev rompe el
// hot-reload, ver ese componente); aca se reusa ese registro.
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  if (process.env.NODE_ENV !== 'production') return null;
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

let cachedKey: { enabled: boolean; publicKey: string | null } | null = null;
async function getServerKey() {
  if (!cachedKey) {
    const { data } = await api.get('/notifications/web-push/public-key');
    cachedKey = { enabled: !!data?.enabled, publicKey: data?.publicKey ?? null };
  }
  return cachedKey;
}

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (isNativeApp()) return 'unsupported';
  if (!hasPushApi()) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  if (isIos() && !isStandalone()) return 'ios-needs-install';

  try {
    const key = await getServerKey();
    if (!key.enabled || !key.publicKey) return 'server-disabled';
  } catch {
    return 'server-disabled';
  }

  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Tiene que llamarse desde un click (iOS solo pide permiso ante un gesto del usuario). */
export async function enableWebPush(): Promise<WebPushStatus> {
  const key = await getServerKey();
  if (!key.enabled || !key.publicKey) return 'server-disabled';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await getRegistration();
  if (!reg) throw new Error('El service worker no está disponible (solo funciona en la versión publicada).');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key.publicKey),
    });
  }
  await api.post('/notifications/web-push/subscribe', { subscription: sub.toJSON() });
  return 'on';
}

export async function disableWebPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.post('/notifications/web-push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// Al abrir la app con el permiso ya concedido, re-sincroniza la suscripcion
// con el backend: cubre el caso de otra cuenta logueada en el mismo celu
// (el endpoint pasa al usuario actual) y suscripciones que el navegador
// renovo por su cuenta. Silencioso.
export async function syncWebPushSubscription() {
  try {
    if (isNativeApp() || !hasPushApi() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await api.post('/notifications/web-push/subscribe', { subscription: sub.toJSON() });
  } catch {
    /* silencioso */
  }
}

// Al cerrar sesion: el celu deja de recibir los avisos de esta cuenta, pero
// la suscripcion del navegador se conserva para que, al volver a entrar,
// syncWebPushSubscription la asocie a quien se loguee sin pedir permiso de nuevo.
export async function detachWebPushFromAccount() {
  try {
    if (isNativeApp() || !hasPushApi()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await api.post('/notifications/web-push/unsubscribe', { endpoint: sub.endpoint });
  } catch {
    /* silencioso: no bloquear el logout */
  }
}
