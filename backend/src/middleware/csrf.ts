import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const isProd = process.env.NODE_ENV === "production";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

export const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function csrfCookieOptions() {
  return {
    httpOnly: false, // el frontend necesita leerla para mandarla en el header
    secure: isProd,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    domain: isProd ? COOKIE_DOMAIN : undefined,
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  };
}

// Emite/renueva la cookie legible por JS que el check de abajo compara
// contra el header X-CSRF-Token (patron double-submit cookie). Se llama
// junto con las cookies de sesion en cada login (auth.service.ts,
// platformAdmin.service.ts) - no hace falta reemitirla en cada request,
// vive lo mismo que el token de sesion.
export function issueCsrfCookie(res: Response) {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return token;
}

export function clearCsrfCookie(res: Response) {
  res.clearCookie(CSRF_COOKIE_NAME, { path: "/", domain: isProd ? COOKIE_DOMAIN : undefined });
}

// Sesiones que ya estaban logueadas antes de que este middleware existiera
// tienen cookie `token`/`platform_token` pero nunca recibieron `csrf_token`
// (se emite recien en el login). Sin esto, el primer POST/PUT/DELETE de
// cualquier usuario con sesion vieja pegaria un 403 hasta volver a loguearse.
// Se engancha temprano (antes del check de abajo) asi la cookie ya esta
// puesta para cuando el navegador haga la primera mutacion.
export function ensureCsrfCookie(req: Request, res: Response, next: NextFunction) {
  const hasSessionCookie = Boolean(req.cookies?.token || req.cookies?.platform_token);
  if (hasSessionCookie && !req.cookies?.[CSRF_COOKIE_NAME]) {
    issueCsrfCookie(res);
  }
  next();
}

// Double-submit cookie CSRF check. Solo aplica cuando la request ya viaja
// con una cookie de sesion propia (token/platform_token): clientes que se
// autentican via Authorization: Bearer no son vulnerables a CSRF (un
// navegador no adjunta ese header solo), y requests sin ninguna sesion
// (login, register, pairing HTTP de PrintBox) no tienen una sesion que
// proteger todavia.
export function verifyCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  const hasSessionCookie = Boolean(req.cookies?.token || req.cookies?.platform_token);
  if (!hasSessionCookie) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (
    typeof cookieToken === "string" &&
    typeof headerToken === "string" &&
    cookieToken.length > 0 &&
    cookieToken === headerToken
  ) {
    return next();
  }

  return res.status(403).json({
    ok: false,
    code: "CSRF_TOKEN_INVALID",
    message: "Token de seguridad inválido o ausente, recargá la página e intentá de nuevo.",
  });
}
