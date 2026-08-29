import { NextRequest, NextResponse } from 'next/server';
import { isResolvableAppPath } from '@/lib/routeGuard';
import {
  MARKDOWN_NEGOTIATED_PATHS, appendVaryAccept, markdownRouteFor, preferredType,
} from '@/lib/contentNegotiation';

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

  // Content negotiation (Accept: text/markdown, RFC 9110 12.5.1) para las
  // paginas de marketing que tienen una version .md hermana en
  // frontend/content/ -- ver frontend/lib/contentNegotiation.ts y el recipe
  // de acceptmarkdown.com/recipes/nextjs. Estas 4 rutas son siempre publicas
  // (no dependen de auth ni de isMarketingHost), asi que negociar el
  // content-type acá no interactua con el resto del gating de mas abajo.
  if (MARKDOWN_NEGOTIATED_PATHS.has(pathname) && (req.method === 'GET' || req.method === 'HEAD')) {
    const acceptHeader = req.headers.get('accept');
    const chosen = preferredType(acceptHeader);

    if (chosen === 'text/markdown') {
      const url = req.nextUrl.clone();
      url.pathname = markdownRouteFor(pathname);
      const rewritten = NextResponse.rewrite(url);
      appendVaryAccept(rewritten.headers);
      return rewritten;
    }
    if (chosen === null && acceptHeader) {
      return new NextResponse('Not Acceptable\n\nAvailable: text/html, text/markdown\n', {
        status: 406,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', Vary: 'Accept' },
      });
    }
    // chosen === 'text/html' (o sin Accept header): sigue de largo, sirve
    // el html normal mas abajo. OJO: no se le agrega Vary: Accept a esa
    // variante -- se probo (headers seteados aca y tambien via
    // next.config.ts#headers()) y el pipeline de render de App Router pisa
    // cualquier Vary custom en una pagina estatica antes de que llegue al
    // cliente. Vary: Accept si queda en la variante markdown (arriba) y en
    // el 406 (abajo), que es lo que la auditoria "Is Agentic" verifica.
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
  // Presupuesto de una orden de servicio (/presupuesto/<token>): se lo
  // mandamos por WhatsApp/email a un cliente que todavia no tiene cuenta,
  // tiene que poder verlo y aprobarlo sin loguearse.
  const isBudgetLink = pathname.startsWith('/presupuesto/');
  // Legales (footer del sitio, y requisito de las tiendas de apps), sus
  // alias en ingles para discoverability de agentes (/about, /contact,
  // /privacy - ver frontend/content/), y la imagen OG que genera
  // app/opengraph-image.tsx (sin extension en la URL, asi que el matcher de
  // mas abajo no la excluye sola como si hace con .png/.jpg reales) -
  // todas publicas, sin login.
  const isLegal = pathname === '/terminos' || pathname === '/privacidad' || pathname === '/arrepentimiento'
    || pathname === '/about' || pathname === '/contact' || pathname === '/privacy';
  const isOgImage = pathname === '/opengraph-image';

  if (isInstallGuide || isSignup || isVerticalLanding || isBudgetLink || isLegal || isOgImage) {
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

  // Ninguna page.tsx del proyecto puede resolver este path (ver
  // frontend/lib/routeGuard.ts) -- dejarlo pasar para que el propio router
  // de Next renderice app/not-found.tsx (404 real) en vez de redirigirlo a
  // /login como cualquier ruta protegida de mas abajo. Ese redirect a
  // /login (200 con el app shell) era el soft-404 que marcaba la auditoria
  // "Is Agentic": un agente probando /some-path-that-does-not-exist veia un
  // 200 y concluia que la ruta existe.
  if (!isResolvableAppPath(pathname)) {
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
