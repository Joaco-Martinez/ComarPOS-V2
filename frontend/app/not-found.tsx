'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth';

export default function NotFound() {
  // Sin el slug del tenant en la URL (esto puede renderizar en cualquier
  // ruta rota) no podemos armar /[tenant]/dashboard a ciegas - usamos la
  // sesión si ya está cargada, y si no hay, mandamos a /login.
  const { user } = useAuthStore();
  const href = user?.tenantSlug ? `/${user.tenantSlug}/dashboard` : '/login';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 88, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)', lineHeight: 1, letterSpacing: -4 }}>404</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 16 }}>Página no encontrada</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6 }}>La ruta que buscás no existe en ComarPOS.</div>
        <div style={{ marginTop: 28 }}>
          <Link href={href} className="btn btn-primary btn-sm">Ir al Dashboard</Link>
        </div>
        {/* Pensado tambien para agentes/crawlers que llegan a un path que no
            existe (ver frontend/lib/routeGuard.ts): les da un lugar por
            donde seguir en vez de un callejon sin salida. */}
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 20 }}>
          ¿Buscás algo en particular? Mirá el{' '}
          <Link href="/sitemap.xml" style={{ color: 'var(--accent)' }}>mapa del sitio</Link>
          {' '}o <Link href="/llms.txt" style={{ color: 'var(--accent)' }}>llms.txt</Link>.
        </div>
      </div>
    </div>
  );
}
