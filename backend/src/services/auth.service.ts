import prisma from "../prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Response, Request } from "express";
import { CategoryClient, Role } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { issueCsrfCookie, clearCsrfCookie } from "../middleware/csrf";
import { resolveTenantAccess, listUserTenants, invalidateTenantAccess } from "./tenantAccess.service";

const isProd = process.env.NODE_ENV === "production";
// JWT_SECRET ya se valida (>=64 chars, sin fallback) al boot en src/index.ts
// y src/middleware/auth.ts; este modulo firma tokens y debe usar el mismo
// secreto, no un fallback inseguro propio.
const JWT_SECRET = process.env.JWT_SECRET as string;
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
// La app se usa mayormente instalada (Capacitor/PWA) como si fuera nativa:
// con sesion de 24hs, cualquiera que no abre la app un dia entero volvia a
// ver el login. 30 dias imita el comportamiento esperado de una app movil
// (login persistente hasta logout explicito).
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_DURATION_JWT = "30d";

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    domain: isProd ? COOKIE_DOMAIN : undefined,
    path: "/",
    maxAge: SESSION_DURATION_MS,
  };
}

function sanitizeUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword ?? false,
    client: user.client ?? null,
    tenantId: user.tenantId ?? null,
    // Slug/nombre del tenant: el frontend los usa para armar la URL con
    // el negocio identificado (ej. /grupo-vj/pos), como en Mi Taller Ya.
    tenantSlug: user.tenant?.slug ?? null,
    tenantName: user.tenant?.name ?? null,
    quickAccessConfig: user.quickAccessConfig ?? null,
    // Sucursal de base (doc "puntos de venta separados") - el frontend la
    // usa para preseleccionar la ubicacion en POS/Caja sin tener que pedirla
    // aparte (ver sale.stock.ts#resolveStockLocationId).
    defaultBusinessLocationId: user.defaultBusinessLocationId ?? null,
    restrictToDefaultLocation: user.restrictToDefaultLocation ?? false,
  };
}

// Negocio activo de la sesion cuando NO es el de base del usuario (contador
// con acceso a varios negocios, ver tenantAccess.service.ts): pisa los datos
// de negocio y el rol que sanitizeUser saca de la fila del usuario.
type ActiveTenant = { tenantId: string; slug: string; name: string; role: Role };

function sanitizeSessionUser(user: any, active?: ActiveTenant | null) {
  const clean = sanitizeUser(user);
  if (!active) return clean;
  return { ...clean, role: active.role, tenantId: active.tenantId, tenantSlug: active.slug, tenantName: active.name };
}

function signSession(userId: string, role: Role | string, tenantId: string | null, ext: boolean) {
  return jwt.sign(
    ext ? { userId, role, tenantId, ext: true } : { userId, role, tenantId },
    JWT_SECRET,
    { expiresIn: SESSION_DURATION_JWT }
  );
}

/**
 * Usuario de la sesion para el negocio que trae el token. Si es un negocio
 * ajeno (contador), verifica que el acceso siga vigente y devuelve los
 * datos de ESE negocio -- si no, el frontend (AppLayout) lo mandaria de
 * vuelta al negocio de base en cada carga.
 */
async function loadSessionUser(userId: string, tokenTenantId?: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { client: true, tenant: { select: { slug: true, name: true } } },
  });

  if (!user) throw new Error("Usuario no encontrado");
  if (user.isActive === false) throw new Error("Usuario deshabilitado");

  if (!tokenTenantId || tokenTenantId === user.tenantId) return sanitizeSessionUser(user);

  const access = await resolveTenantAccess(user.id, tokenTenantId);
  if (!access) throw new Error("Ya no tenés acceso a este negocio");
  const tenant = await prisma.tenant.findUnique({ where: { id: tokenTenantId }, select: { slug: true, name: true } });
  if (!tenant) throw new Error("Negocio no encontrado");

  return sanitizeSessionUser(user, { tenantId: tokenTenantId, slug: tenant.slug, name: tenant.name, role: access.role });
}

function setAuthCookies(res: Response, cleanUser: any, token: string) {
  res.cookie("token", token, getCookieOptions());

  res.cookie("user", JSON.stringify(cleanUser), {
    ...getCookieOptions(),
    httpOnly: false,
  });

  issueCsrfCookie(res);
}

export const authService = {
  async register(
    data: {
      email: string;
      password: string;
      nombre?: string;
      apellido?: string;
      name?: string;
      dni: string;
      telefono?: string | null;
    },
    tenantId?: string | null
  ) {
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");
    const dni = String(data.dni || "").trim();
    const nombre = String(data.nombre || data.name || "").trim();
    const apellido = String(data.apellido || "").trim();

    if (!email) throw new Error("El email es obligatorio");
    if (!password || password.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    }
    if (!dni) throw new Error("El DNI/CUIT es obligatorio");
    if (!nombre) throw new Error("El nombre es obligatorio");

    // email es unico globalmente (migracion user_email_globally_unique), no
    // por tenant: si solo miraramos dentro de tenantId, un email ya usado en
    // otro tenant pasaria este chequeo y el create() de abajo explotaria con
    // un error crudo de constraint en vez de este mensaje.
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new Error("El email ya está registrado");

    const existingClientByDni = await prisma.client.findFirst({
      where: { dni, tenantId: tenantId ?? undefined },
    });
    if (existingClientByDni) throw new Error("Ya existe un cliente con ese DNI/CUIT");

    const existingClientByEmail = await prisma.client.findFirst({
      where: { gmail: email, tenantId: tenantId ?? undefined },
    });
    if (existingClientByEmail) throw new Error("Ya existe un cliente con ese email");

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: apellido ? `${nombre} ${apellido}` : nombre,
        role: Role.CLIENTE,
        isActive: true,
        mustChangePassword: false,
        tenantId: tenantId ?? undefined,
        client: {
          create: {
            nombre,
            apellido,
            dni,
            telefono: data.telefono ?? null,
            gmail: email,
            category: CategoryClient.Price,
            currentBalance: 0,
            creditLimit: null,
            isAccountEnabled: false,
          },
        },
      },
      include: {
        client: true,
        tenant: { select: { slug: true, name: true } },
      },
    });

    return sanitizeUser(user);
  },

  async login(email: string, password: string, res: Response) {
    const cleanEmail = String(email || "").trim().toLowerCase();

    // email es unico globalmente (migracion user_email_globally_unique): el
    // tenant del usuario sale de esta fila, no hace falta resolverlo antes
    // por subdominio.
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: {
        client: true,
        tenant: { select: { slug: true, name: true } },
      },
    });

    if (!user) throw new Error("Credenciales inválidas");

    if (user.isActive === false) {
      throw new Error("Usuario deshabilitado");
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new Error("Credenciales inválidas");

    // Auditoria de platform-admin (ver platformTenant.service.ts): no
    // bloquea el login si falla.
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});

    // Contador con varios negocios: vuelve al ultimo en el que estuvo, si
    // todavia tiene acceso; si no (o nunca cambio), a su negocio de base.
    const lastAccess =
      user.lastActiveTenantId && user.lastActiveTenantId !== user.tenantId
        ? await resolveTenantAccess(user.id, user.lastActiveTenantId)
        : null;

    if (lastAccess) {
      const cleanUser = await loadSessionUser(user.id, lastAccess.tenantId);
      setAuthCookies(res, cleanUser, signSession(user.id, lastAccess.role, lastAccess.tenantId, true));
      return cleanUser;
    }

    const token = signSession(user.id, user.role, user.tenantId, false);
    const cleanUser = sanitizeUser(user);

    setAuthCookies(res, cleanUser, token);

    return cleanUser;
  },

  /**
   * Genera una sesion de tenant valida para un usuario sin pedir password --
   * usado solo desde platformTenant.service.ts (impersonar un tenant desde
   * el panel de super-admin). El caller es responsable de verificar que
   * quien pide esto es realmente un PlatformAdmin autenticado
   * (platformAuthMiddleware) antes de llamar esto.
   */
  async impersonate(targetUserId: string, res: Response) {
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { client: true, tenant: { select: { slug: true, name: true } } },
    });

    if (!user) throw new Error("Usuario no encontrado");
    if (user.isActive === false) throw new Error("Usuario deshabilitado");

    const token = jwt.sign(
      { userId: user.id, role: user.role, tenantId: user.tenantId },
      JWT_SECRET,
      { expiresIn: SESSION_DURATION_JWT }
    );

    const cleanUser = sanitizeUser(user);
    setAuthCookies(res, cleanUser, token);

    return cleanUser;
  },

  async changePassword(
    userId: string,
    currentPasswordValue: string,
    newPasswordValue: string,
    res?: Response,
    activeTenantId?: string | null
  ) {
    const currentPassword = String(currentPasswordValue || "");
    const newPassword = String(newPasswordValue || "");

    if (!userId) {
      throw new Error("No autenticado");
    }

    if (!currentPassword) {
      throw new Error("La contraseña actual es obligatoria");
    }

    if (!newPassword || newPassword.length < 6) {
      throw new Error("La nueva contraseña debe tener al menos 6 caracteres");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        client: true,
        tenant: { select: { slug: true, name: true } },
      },
    });

    if (!user) throw new Error("Usuario no encontrado");

    if (user.isActive === false) {
      throw new Error("Usuario deshabilitado");
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);

    if (!isValid) {
      throw new Error("La contraseña actual es incorrecta");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
      include: {
        client: true,
        tenant: { select: { slug: true, name: true } },
      },
    });

    // La sesion nueva sigue en el negocio en el que estaba (un contador que
    // cambia la contraseña desde otro negocio no vuelve al de base).
    const cleanUser = await loadSessionUser(updatedUser.id, activeTenantId ?? updatedUser.tenantId);

    if (res) {
      const ext = Boolean(cleanUser.tenantId && cleanUser.tenantId !== updatedUser.tenantId);
      const token = signSession(updatedUser.id, cleanUser.role, cleanUser.tenantId, ext);
      setAuthCookies(res, cleanUser, token);
    }

    return {
      message: "Contraseña actualizada correctamente",
      user: cleanUser,
    };
  },

  async updateQuickAccessConfig(userId: string | undefined, config: unknown, activeTenantId?: string | null) {
    if (!userId) throw new Error("No autenticado");

    if (
      config !== null &&
      (typeof config !== "object" || Array.isArray(config))
    ) {
      throw new Error("Config inválida");
    }

    if (config !== null && JSON.stringify(config).length > 20000) {
      throw new Error("Config demasiado grande");
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { quickAccessConfig: config as any },
      select: { id: true, tenantId: true },
    });

    // Con los datos del negocio activo (no del de base): el frontend pisa
    // el usuario guardado con esta respuesta.
    return loadSessionUser(updatedUser.id, activeTenantId ?? updatedUser.tenantId);
  },

  async logout(res: Response) {
    res.clearCookie("token", {
      path: "/",
      domain: isProd ? COOKIE_DOMAIN : undefined,
    });

    res.clearCookie("user", {
      path: "/",
      domain: isProd ? COOKIE_DOMAIN : undefined,
    });

    clearCsrfCookie(res);

    return { message: "Logout exitoso" };
  },

  async me(req: Request) {
    const authorization = req.headers.authorization;
    const token =
      req.cookies?.token ||
      (authorization?.startsWith("Bearer ") ? authorization.replace("Bearer ", "").trim() : null);
    if (!token) throw new Error("No autenticado");

    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string; tenantId?: string | null };
      return await loadSessionUser(payload.userId, payload.tenantId);
    } catch {
      throw new Error("Token inválido");
    }
  },

  async getMe(token: string) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; tenantId?: string | null };
      return await loadSessionUser(decoded.userId, decoded.tenantId);
    } catch {
      throw new Error("Token inválido");
    }
  },

  /** Negocios a los que puede entrar la cuenta (selector de negocio del contador). */
  async listTenants(userId: string | undefined) {
    if (!userId) throw new Error("No autenticado");
    return listUserTenants(userId);
  },

  /**
   * Cambia el negocio activo sin cerrar sesion: firma un token nuevo para
   * `tenantId` (con el rol de ese acceso) y pisa las cookies. Solo entra a
   * un negocio propio o con acceso vigente (UserTenantAccess).
   */
  async switchTenant(userId: string | undefined, tenantId: string, res: Response) {
    if (!userId) throw new Error("No autenticado");
    if (!tenantId) throw new Error("Falta el negocio");

    const access = await resolveTenantAccess(userId, tenantId);
    if (!access) throw new Error("No tenés acceso a ese negocio");
    invalidateTenantAccess(userId, tenantId);

    const cleanUser = await loadSessionUser(userId, tenantId);
    const token = signSession(userId, access.role, tenantId, !access.isHome);
    setAuthCookies(res, cleanUser, token);

    // El proximo login arranca en este negocio (ver login()).
    await prisma.user.update({ where: { id: userId }, data: { lastActiveTenantId: access.isHome ? null : tenantId } });

    return cleanUser;
  },

  async deleteUser(id: string) {
    const existing = await prisma.user.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Usuario no encontrado");

    return prisma.user.delete({ where: { id } });
  },
};
