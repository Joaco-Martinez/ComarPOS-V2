import type { CapacitorConfig } from '@capacitor/cli';

// ComarPOS es una app Next.js dinamica (SSR + auth + multi-tenant), no un
// sitio estatico -- por eso Capacitor no empaqueta build local (`webDir` no
// se usa realmente en este modo), sino que el shell nativo carga el sitio
// ya deployado via `server.url`. Esto es lo que permite pasar la revision
// de Apple con una app "web" (a diferencia de una Trusted Web Activity,
// que solo sirve para Play Store): el bridge de Capacitor corre inyectado
// sobre esa pagina remota y expone los plugins nativos (push, etc.) igual
// que si fuera contenido local.
//
// TODO antes de compilar para las tiendas:
//   1. Reemplazar server.url por el dominio de produccion real (HTTPS).
//   2. Ajustar appId al bundle id/applicationId reservado en
//      Play Console / App Store Connect (formato reverse-DNS).
const config: CapacitorConfig = {
  appId: 'com.comarpos.app',
  appName: 'ComarPOS',
  webDir: 'public',
  server: {
    url: process.env.NEXT_PUBLIC_CAPACITOR_SERVER_URL || 'https://REEMPLAZAR-CON-TU-DOMINIO.com',
    cleartext: false,
  },
};

export default config;
