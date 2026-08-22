'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import LoginPage from '../login/page';

function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  // navigator.standalone: iOS Safari (PWA agregada a Inicio).
  // display-mode: standalone: Android/Chrome y el resto.
  return (window.navigator as any).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

// Entry point para el ícono de la PWA (ver manifest.webmanifest: start_url).
// Esta pantalla NUNCA navega sola a otra URL salvo que se esté ejecutando
// como app instalada (standalone) - así, mientras alguien la tiene abierta
// en una pestaña normal de Safari/Chrome para instalarla ("Compartir >
// Agregar a Inicio"), la barra de direcciones se queda siempre en /app, sin
// importar si hay sesión activa o no. El salto automático a /pos solo pasa
// al abrir el ícono ya instalado.
export default function AppEntryPage() {
  const { user, loading: sessionLoading } = useAuthStore();
  const router = useRouter();
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
  }, []);

  useEffect(() => {
    if (standalone && !sessionLoading && user?.tenantSlug) {
      router.replace(`/${user.tenantSlug}/pos`);
    }
  }, [standalone, user, sessionLoading, router]);

  if (!sessionLoading && user?.tenantSlug && !standalone) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
            Ya iniciaste sesión como <b style={{ color: 'var(--text)' }}>{user.name}</b>.
          </p>
          <a href={`/${user.tenantSlug}/pos`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            Ir al sistema
          </a>
        </div>
      </div>
    );
  }

  return <LoginPage />;
}
