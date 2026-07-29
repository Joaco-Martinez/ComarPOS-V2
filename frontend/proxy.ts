import { NextRequest, NextResponse } from 'next/server';

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
  const isLogin = pathname === '/login';

  if (isLogin) {
    if (isStaff) {
      const url = req.nextUrl.clone();
      url.pathname = '/pos';
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
