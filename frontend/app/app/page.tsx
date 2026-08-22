'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import LoginPage from '../login/page';

// Entry point para el ícono de la PWA (ver manifest.webmanifest: start_url).
// A proposito NO redirige a /login cuando no hay sesion (renderiza el login
// directo aca mismo) - si redirigiera, la URL visible pasaria a ser /login
// justo en el momento en que alguien intenta instalar el icono (Compartir >
// Agregar a Inicio en iOS toma la URL actual), y el icono quedaria apuntando
// a /login de nuevo. Con sesion activa si navega a /pos, que es el resultado
// esperado.
export default function AppEntryPage() {
  const { user, loading: sessionLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!sessionLoading && user?.tenantSlug) {
      router.replace(`/${user.tenantSlug}/pos`);
    }
  }, [user, sessionLoading, router]);

  return <LoginPage />;
}
