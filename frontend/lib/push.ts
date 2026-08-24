'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications, type Token, type ActionPerformed } from '@capacitor/push-notifications';
import api from './api';

// No-op en la PWA/navegador de escritorio a proposito: esto solo tiene
// sentido dentro del shell nativo generado por Capacitor (ver
// capacitor.config.ts), que es el unico contexto donde el plugin de push
// nativo (FCM) existe. En web, Capacitor.isNativePlatform() da false y
// PushNotifications ni se importa en runtime (el bundle lo incluye pero
// las llamadas al plugin quedan sin usar).
export function isNativeApp() {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

let initialized = false;

// onNotificationTap recibe el "href" relativo (ej. "/guia", "/stock") que
// ya viajaba en notification.data desde el backend (ver
// notification.service.ts) - el caller decide como resolverlo a una URL
// completa (agregando el slug del tenant, etc.), porque este modulo no
// sabe en que tenant esta logueado el usuario.
export async function initPushNotifications(onNotificationTap: (href: string) => void) {
  if (!isNativeApp() || initialized) return;
  initialized = true;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', (token: Token) => {
      api.post('/notifications/push-token', {
        token: token.value,
        platform: Capacitor.getPlatform() === 'ios' ? 'IOS' : 'ANDROID',
      }).catch(() => { /* silencioso: no bloquear el resto del login por esto */ });
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Error registrando push notifications', err);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      const href = action.notification?.data?.href;
      if (typeof href === 'string') onNotificationTap(href);
    });
  } catch (err) {
    console.error('No se pudo inicializar push notifications', err);
  }
}
