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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const isPlatform = window.location.pathname.startsWith('/platform-admin');
      const loginPath = isPlatform ? '/platform-admin/login' : '/login';
      if (!window.location.pathname.includes('/login')) {
        window.location.href = loginPath;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
