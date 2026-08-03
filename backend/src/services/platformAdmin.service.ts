import prisma from "../prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Response, Request } from "express";
import { issueCsrfCookie, clearCsrfCookie } from "../middleware/csrf";

const isProd = process.env.NODE_ENV === "production";
// JWT_SECRET ya se valida (>=64 chars, sin fallback) al boot; reusamos el
// mismo secreto que el auth de negocio, la separacion la da el claim `type`
// y la cookie propia `platform_token`.
const JWT_SECRET = process.env.JWT_SECRET as string;
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const COOKIE_NAME = "platform_token";

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

function sanitize(admin: any) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    isActive: admin.isActive,
  };
}

export const platformAdminService = {
  async login(email: string, password: string, res: Response) {
    const cleanEmail = String(email || "").trim().toLowerCase();

    const admin = await prisma.platformAdmin.findUnique({ where: { email: cleanEmail } });
    if (!admin) throw new Error("Credenciales inválidas");

    if (admin.isActive === false) {
      throw new Error("Usuario deshabilitado");
    }

    const isValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isValid) throw new Error("Credenciales inválidas");

    const token = jwt.sign(
      { platformAdminId: admin.id, type: "platform" },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie(COOKIE_NAME, token, getCookieOptions());
    issueCsrfCookie(res);

    return { admin: sanitize(admin) };
  },

  async logout(res: Response) {
    res.clearCookie(COOKIE_NAME, {
      path: "/",
      domain: isProd ? COOKIE_DOMAIN : undefined,
    });

    clearCsrfCookie(res);

    return { message: "Logout exitoso" };
  },

  async me(req: Request) {
    const platformAdminId = (req as any).platformAdmin?.id;
    if (!platformAdminId) throw new Error("No autenticado");

    const admin = await prisma.platformAdmin.findUnique({ where: { id: platformAdminId } });
    if (!admin) throw new Error("Usuario no encontrado");
    if (admin.isActive === false) throw new Error("Usuario deshabilitado");

    return sanitize(admin);
  },
};
