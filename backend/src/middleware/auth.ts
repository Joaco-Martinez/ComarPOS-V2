import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../prisma";
import { runWithTenant } from "../context/tenantContext";
import { resolveTenantById, isSuspensionExempt, getTenantBlock } from "./tenant";
import { resolveTenantAccessCached } from "../services/tenantAccess.service";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 64) {
  throw new Error("JWT_SECRET debe estar definido y tener minimo 64 caracteres");
}

type JwtPayload = {
  userId: string;
  role: string;
  tenantId?: string | null;
  // true = tenantId NO es el negocio de base del usuario sino uno al que
  // tiene acceso via UserTenantAccess (contador de varios negocios, ver
  // services/tenantAccess.service.ts). Solo estos tokens se re-validan.
  ext?: boolean;
};

// El tenant de un request autenticado es el que trae el JWT (tenantId), no
// el resuelto por subdominio (ese solo sirve de base para rutas
// publicas/anonimas, ver middleware/tenant.ts) - asi el login no depende de
// en que dominio entro el usuario. Pisa el contexto que haya dejado
// tenantMiddleware y corre la misma verificacion de suspension pero contra
// el tenant real del usuario. Tokens sin tenantId (usuarios legacy) no
// pisan nada y siguen con lo que haya resuelto tenantMiddleware.
async function runWithAuthenticatedTenant(
  req: Request,
  res: Response,
  next: NextFunction,
  decoded: JwtPayload
) {
  if (!decoded.tenantId) {
    return next();
  }

  // Negocio ajeno: el acceso se puede revocar en cualquier momento, asi que
  // no alcanza con que el JWT este firmado. Tambien se toma el rol del
  // acceso vigente (no el del token) por si se lo cambiaron.
  if (decoded.ext) {
    const access = await resolveTenantAccessCached(decoded.userId, decoded.tenantId);
    if (!access) {
      // Listar/cambiar de negocio sigue andando (sin contexto de ese
      // negocio, no lo necesitan) para que pueda volver a uno propio.
      const path = req.originalUrl.split("?")[0];
      if (path === "/auth/tenants" || path === "/auth/switch-tenant") return next();
      return res.status(401).json({
        code: "TENANT_ACCESS_REVOKED",
        message: "Ya no tenés acceso a este negocio",
      });
    }
    (req as any).user = { ...(req as any).user, role: access.role };
  }

  const tenant = await resolveTenantById(decoded.tenantId);

  // req.path es relativo al punto de montaje (ej. "/" para GET /users, ya
  // que authMiddleware se monta con prefijo en varios routes.ts) - usar
  // req.originalUrl (siempre la ruta completa, sin importar el nesting de
  // routers) para que isSuspensionExempt no confunda la raiz de un recurso
  // cualquiera con el healthcheck real ("/").
  const fullPath = req.originalUrl.split("?")[0];

  if (tenant && !isSuspensionExempt(fullPath)) {
    const block = getTenantBlock(tenant);
    if (block) {
      return res.status(403).json(block);
    }
  }

  return runWithTenant(decoded.tenantId, next);
}

// "Ultimo acceso" (lastLoginAt) antes solo se tocaba en el login (POST
// /auth/login) -- con el JWT vigente 24hs sin refresh, un usuario que
// sigue usando el sistema activamente mostraba en el panel de
// platform-admin la fecha del login de ayer, no la de "ahora mismo". Se
// actualiza tambien en cada request autenticado, pero throttleado en
// memoria (una escritura a DB cada LAST_SEEN_THROTTLE_MS por usuario) para
// no pegarle a la DB en cada request.
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const lastSeenTouch = new Map<string, number>();

function touchLastSeen(userId: string) {
  const now = Date.now();
  const last = lastSeenTouch.get(userId) ?? 0;
  if (now - last < LAST_SEEN_THROTTLE_MS) return;

  lastSeenTouch.set(userId, now);
  prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }).catch(() => {});
}

// El JWT vive 30 dias: sin esto un usuario desactivado (o al que le bajaron
// el rol) seguia entrando con su token viejo hasta que venciera. Se re-lee
// isActive/role de la DB en cada request, cacheado en memoria un rato corto
// para no pegarle a la DB en cada llamada. user.service.ts invalida la
// entrada al editar/borrar un usuario (en este proceso; el TTL cubre el resto).
const USER_STATE_TTL_MS = 30 * 1000;
type UserState = { isActive: boolean; role: string };
const userStateCache = new Map<string, { state: UserState | null; at: number }>();

async function loadUserState(userId?: string): Promise<UserState | null> {
  if (!userId) return null;

  const cached = userStateCache.get(userId);
  if (cached && Date.now() - cached.at < USER_STATE_TTL_MS) return cached.state;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, role: true },
  });
  const state = user ? { isActive: user.isActive !== false, role: user.role } : null;

  userStateCache.set(userId, { state, at: Date.now() });
  return state;
}

export function invalidateUserState(userId?: string) {
  if (!userId) {
    userStateCache.clear();
    return;
  }
  userStateCache.delete(userId);
}

// Un CLIENTE (cuenta creada por el registro publico de la tienda online) solo
// puede usar su sesion en el portal de compra -- sin esto, cualquiera que se
// registrara tenia acceso a ventas, finanzas, clientes, etc. del negocio,
// porque esas rutas solo piden authMiddleware y no un rol.
const CLIENTE_ALLOWED_PREFIXES = ["/auth/", "/catalog/", "/tienda/"];

function isClienteAllowedPath(fullPath: string) {
  return CLIENTE_ALLOWED_PREFIXES.some((prefix) => fullPath.startsWith(prefix));
}

async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
  decoded: JwtPayload,
  optional: boolean
) {
  const state = await loadUserState(decoded.userId);

  if (!state || !state.isActive) {
    if (optional) {
      (req as any).user = undefined;
      return next();
    }
    return res.status(401).json({ code: "SESSION_INVALID", message: "Sesión inválida, volvé a iniciar sesión" });
  }

  // Tokens de negocio propio: manda el rol actual de la DB, no el del token.
  // Los de negocio ajeno (ext) toman el rol del acceso vigente en
  // runWithAuthenticatedTenant.
  const role = decoded.ext ? decoded.role : state.role;

  if (role === "CLIENTE" && !isClienteAllowedPath(req.originalUrl.split("?")[0])) {
    return res.status(403).json({ message: "No autorizado" });
  }

  (req as any).user = { id: decoded.userId, role, tenantId: decoded.tenantId };
  touchLastSeen(decoded.userId);
  return runWithAuthenticatedTenant(req, res, next, decoded);
}

// Exportado para storefrontTenant.ts: la tienda online necesita identificar
// a un CLIENTE logueado (para autocompletar datos en el checkout) SIN dejar
// que el tenantId de su JWT pise el tenant de la tienda que esta navegando
// (:tenantSlug en la URL) - por eso no puede usar optionalAuthMiddleware tal
// cual, que via runWithAuthenticatedTenant() sí pisa el contexto de tenant.
export function readToken(req: Request) {
  const cookieToken = req.cookies?.token;
  const authorization = req.headers.authorization;

  if (cookieToken) return cookieToken;

  if (authorization?.startsWith("Bearer ")) {
    return authorization.replace("Bearer ", "").trim();
  }

  return null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);

  if (!token) {
    return res.status(401).json({ message: "Token requerido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as unknown as JwtPayload;

    authenticate(req, res, next, decoded, false).catch(next);
  } catch (_err) {
    return res.status(401).json({ message: "Token inválido" });
  }
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as unknown as JwtPayload;

    authenticate(req, res, next, decoded, true).catch(next);
  } catch (_err) {
    // En rutas públicas no bloqueamos por token vencido/incorrecto.
    // Simplemente se responde como visitante y el frontend puede pedir login al checkout.
    (req as any).user = undefined;
    next();
  }
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user || user.role !== role) {
      return res.status(403).json({ message: "No autorizado" });
    }

    next();
  };
}

export function requireAnyRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ message: "No autorizado" });
    }

    next();
  };
}
