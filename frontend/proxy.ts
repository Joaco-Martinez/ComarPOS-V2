import { NextRequest, NextResponse } from 'next/server';

// Dominio(s) donde "/" sirve la landing de ventas en vez del sistema.
// Cualquier otro host (subdominios de tenant, ej. grupovj.comarpos.com.ar)
// entra a "/" y se lo manda a /login. Se resuelve acá (en vez de con
// headers() dentro de app/page.tsx) para que esa page pueda ser estática:
// headers() forzaba SSR dinámico en cada request a "/", con
// Cache-Control: no-store -- eso bloqueaba el browser back/forward cache y
// le sacaba a la landing cualquier chance de cachearse en CDN.
const MARKETING_HOSTS = new Set([
  'comarpos.com.ar',
  'www.comarpos.com.ar',
  'comarpos.com',
  'www.comarpos.com',
  'localhost:3000',
  'localhost',
]);

function isMarketingHost(host: string) {
  return MARKETING_HOSTS.has(host) || MARKETING_HOSTS.has(host.split(':')[0]);
}

type JwtPayload = { role?: string; exp?: number };

function decodeJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getRole(req: NextRequest): string | null {
  const token = req.cookies.get('token')?.value;
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;
  return payload.role ?? null;
}

function hasPlatformSession(req: NextRequest): boolean {
  const token = req.cookies.get('platform_token')?.value;
  if (!token) return false;
  const payload = decodeJwt(token);
  if (!payload) return false;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return false;
  return true;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Panel de plataforma: sesion completamente separada (cookie platform_token),
  // no debe entrar en la logica isStaff de negocio de mas abajo.
  if (pathname.startsWith('/platform-admin')) {
    const isPlatformLogged = hasPlatformSession(req);
    const isPlatformLogin = pathname === '/platform-admin/login';

    if (isPlatformLogin) {
      if (isPlatformLogged) {
        const url = req.nextUrl.clone();
        url.pathname = '/platform-admin';
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    if (!isPlatformLogged) {
      const url = req.nextUrl.clone();
      url.pathname = '/platform-admin/login';
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  const role = getRole(req);
  const isLogged = Boolean(role);
  const isStaff = role === 'ADMIN' || role === 'EMPLEADO';
  // /app es el entry point de la PWA (ver manifest.webmanifest): tiene que
  // tratarse igual que /login (público, sin redirect server-side) para que
  // la URL nunca cambie a /login en el momento de instalar el ícono - ver
  // el comentario en app/app/page.tsx.
  const isLogin = pathname === '/login' || pathname === '/app';
  // "/" es público: en el dominio de marketing sirve la landing de ventas
  // (app/page.tsx, estática); en cualquier otro host se redirige a /login
  // acá mismo (donde sí aplica el gate de auth de más abajo).
  const isRoot = pathname === '/';
  // Página pública de instrucciones para instalar la PWA (paso a paso
  // iPhone/Android) - tiene que verse sin estar logueado.
  const isInstallGuide = pathname === '/instalar';
  // Alta de cuenta (prueba gratis / suscripción directa) y landings por
  // rubro (/para/<slug>) - son parte del sitio de marketing, públicas.
  const isSignup = pathname === '/prueba-gratis';
  const isVerticalLanding = pathname.startsWith('/para/');
  // Legales (footer del sitio, y requisito de las tiendas de apps) y la
  // imagen OG que genera app/opengraph-image.tsx (sin extension en la URL,
  // asi que el matcher de mas abajo no la excluye sola como si hace con
  // .png/.jpg reales) - todas publicas, sin login.
  const isLegal = pathname === '/terminos' || pathname === '/privacidad';
  const isOgImage = pathname === '/opengraph-image';

  if (isInstallGuide || isSignup || isVerticalLanding || isLegal || isOgImage) {
    return NextResponse.next();
  }

  if (isLogin) {
    // No hay forma de saber el slug del tenant acá (el JWT solo trae
    // tenantId, no el slug, y no queremos pegarle a la DB desde el edge) -
    // si ya está logueado, /login mismo lo manda a /[tenantSlug]/pos
    // (ver app/login/page.tsx) apenas resuelve la sesión via /auth/me.
    return NextResponse.next();
  }

  if (isRoot) {
    if (!isMarketingHost(req.headers.get('host') ?? '')) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!isLogged || !isStaff) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|txt|xml|webmanifest)$).*)',
  ],
};
