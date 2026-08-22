'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

// Entry point para el ícono de la PWA (ver manifest.webmanifest: start_url).
// No es una pantalla en si: solo decide a donde mandar segun haya sesion o
// no, para no atar el ícono a "/login" (que visualmente es la pantalla de
// login) ni a una ruta con tenant hardcodeado (multi-tenant, no hay un
// "/pos" fijo).
export default function AppEntryPage() {
  const { user, loading: sessionLoading, me } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) me();
  }, [sessionLoading, me]);

  useEffect(() => {
    if (sessionLoading) return;
    router.replace(user?.tenantSlug ? `/${user.tenantSlug}/pos` : '/login');
  }, [user, sessionLoading, router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </div>
  );
}
