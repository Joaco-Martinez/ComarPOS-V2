import prisma from "../prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Response, Request } from "express";
import { CategoryClient, Role } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { issueCsrfCookie, clearCsrfCookie } from "../middleware/csrf";

const isProd = process.env.NODE_ENV === "production";
// JWT_SECRET ya se valida (>=64 chars, sin fallback) al boot en src/index.ts
// y src/middleware/auth.ts; este modulo firma tokens y debe usar el mismo
// secreto, no un fallback inseguro propio.
const JWT_SECRET = process.env.JWT_SECRET as string;
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    domain: isProd ? COOKIE_DOMAIN : undefined,
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
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
  };
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

    const token = jwt.sign(
      { userId: user.id, role: user.role, tenantId: user.tenantId },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    const cleanUser = sanitizeUser(user);

    setAuthCookies(res, cleanUser, token);

    return cleanUser;
  },

  async changePassword(
    userId: string,
    currentPasswordValue: string,
    newPasswordValue: string,
    res?: Response
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

    const cleanUser = sanitizeUser(updatedUser);

    if (res) {
      const token = jwt.sign(
        { userId: updatedUser.id, role: updatedUser.role, tenantId: updatedUser.tenantId },
        JWT_SECRET,
        { expiresIn: "1d" }
      );

      setAuthCookies(res, cleanUser, token);
    }

    return {
      message: "Contraseña actualizada correctamente",
      user: cleanUser,
    };
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

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          client: true,
          tenant: { select: { slug: true, name: true } },
        },
      });

      if (!user) throw new Error("Usuario no encontrado");

      if (user.isActive === false) {
        throw new Error("Usuario deshabilitado");
      }

      return sanitizeUser(user);
    } catch {
      throw new Error("Token inválido");
    }
  },

  async getMe(token: string) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          client: true,
          tenant: { select: { slug: true, name: true } },
        },
      });

      if (!user) throw new Error("Usuario no encontrado");

      if (user.isActive === false) {
        throw new Error("Usuario deshabilitado");
      }

      return sanitizeUser(user);
    } catch {
      throw new Error("Token inválido");
    }
  },

  async deleteUser(id: string) {
    const existing = await prisma.user.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Usuario no encontrado");

    return prisma.user.delete({ where: { id } });
  },
};
