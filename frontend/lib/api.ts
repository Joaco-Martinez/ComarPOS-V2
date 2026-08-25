import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

api.interceptors.request.use((config) => {
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
  }

  // Double-submit cookie CSRF (ver backend/src/middleware/csrf.ts): la
  // cookie csrf_token la pone el backend en el login, no es httpOnly a
  // proposito para que se pueda leer y reenviar aca.
  const method = (config.method || 'get').toLowerCase();
  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCookie('csrf_token');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }

  return config;
});

// Codigos que devuelve middleware/tenant.ts (getTenantBlock) cuando el
// tenant esta bloqueado (prueba gratis vencida, suspendido por MP o a
// mano) - se resuelven todos mandando a /suscripcion, que ademas de dejar
// pagar via Mercado Pago explica la situacion y da un link de soporte para
// los casos de suspension manual que no se resuelven pagando solo.
const BILLING_BLOCK_CODES = new Set(['TENANT_SUSPENDED', 'TRIAL_EXPIRED', 'SUBSCRIPTION_EXPIRED']);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // /auth/me y /platform-admin/auth/me son el chequeo de "¿hay sesión?":
    // un 401 ahí es una respuesta normal para un visitante anónimo, no una
    // sesión que se cayó a mitad de uso - el propio store ya maneja ese caso
    // (limpia el user). Redirigir acá además rompe el login: la llamada a
    // /auth/me que dispara /login al montar puede resolver *después* del
    // login exitoso y mandarte de vuelta con un location.href duro.
    const isMeCheck = typeof error.config?.url === 'string' && error.config.url.includes('/auth/me');
    if (error.response?.status === 401 && !isMeCheck && typeof window !== 'undefined') {
      const isPlatform = window.location.pathname.startsWith('/platform-admin');
      const loginPath = isPlatform ? '/platform-admin/login' : '/login';
      if (!window.location.pathname.includes('/login')) {
        window.location.href = loginPath;
      }
    }

    const blockCode = error.response?.status === 403 ? error.response?.data?.code : undefined;
    if (
      blockCode &&
      BILLING_BLOCK_CODES.has(blockCode) &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/suscripcion')
    ) {
      window.location.href = '/suscripcion';
    }

    return Promise.reject(error);
  }
);

export default api;
