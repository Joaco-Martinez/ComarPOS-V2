import api from './api';

// Mismos ids que app/[tenant]/guia/page.tsx#STEPS (duplicado a proposito,
// ver comentario abajo: este archivo no puede importar un page.tsx).
const ONBOARDING_STEP_IDS = [
  'empresa', 'arca', 'categorias', 'productos', 'sucursales', 'usuarios', 'pwa', 'primera-venta',
];

/**
 * A donde mandar a un usuario recien logueado (login o alta de prueba
 * gratis): si es ADMIN y todavia no completo la guia de arranque
 * (onboardingChecklist, ver backend/src/services/onboarding.service.ts), lo
 * manda a /guia en vez de /pos - asi un negocio que arranca de cero ve de
 * entrada todo lo que le falta configurar, en vez de un POS vacio sin
 * productos ni facturacion. Una vez que completa los pasos, vuelve a
 * aterrizar en /pos como antes. Los roles no-ADMIN (EMPLEADO) no pueden
 * configurar nada de eso, asi que van directo a /pos siempre.
 */
export async function getLandingHref(user: { tenantSlug?: string | null; role: string }): Promise<string> {
  const base = `/${user.tenantSlug}`;
  if (user.role !== 'ADMIN') return `${base}/pos`;

  try {
    const { data } = await api.get('/onboarding');
    const checklist = (data ?? {}) as Record<string, boolean>;
    const allDone = ONBOARDING_STEP_IDS.every((id) => checklist[id]);
    return allDone ? `${base}/pos` : `${base}/guia`;
  } catch {
    return `${base}/pos`;
  }
}
