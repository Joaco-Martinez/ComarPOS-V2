/**
 * Recuperacion y reseteo de contraseña de clientes.
 * Extraido de client.service.ts (doc seccion 4 - modularizacion).
 */
import prisma from "../../prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Role } from "@prisma/client";
import { sendPasswordResetEmail } from "../../utils/mailer";
import { cleanEmail } from "./client.helpers";
import { tenantScope } from "../../utils/tenantScope";

export async function requestPasswordReset(emailValue?: string | null) {
  const email = cleanEmail(emailValue);

  if (!email) return { ok: true };

  const user = await prisma.user.findFirst({
    where: { email, ...tenantScope() },
    include: {
      client: true,
    },
  });

  if (!user) return { ok: true };
  if (user.role !== Role.CLIENTE) return { ok: true };
  if (user.isActive === false) return { ok: true };

  // El tenant del propio usuario manda (no currentTenantId()): este flujo es
  // publico/anonimo y el tenant de contexto es el default, no necesariamente
  // el del negocio real de este usuario.
  const tenant = user.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true, ticketBusinessName: true },
      })
    : null;
  const businessName = tenant?.ticketBusinessName || tenant?.name || null;

  const rawToken = crypto.randomBytes(32).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const expires = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
    },
  });

  await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    token: rawToken,
    businessName,
  });

  return { ok: true };
}

export async function resetPassword(tokenValue?: string | null, passwordValue?: string | null) {
  const token = String(tokenValue || "").trim();
  const password = String(passwordValue || "");

  if (!token) {
    throw new Error("El token es obligatorio");
  }

  if (!password || password.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres");
  }

  const hashedToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpires: {
        gt: new Date(),
      },
      role: Role.CLIENTE,
      isActive: true,
    },
  });

  if (!user) {
    throw new Error("El enlace es inválido o ya venció");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      mustChangePassword: false,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  return { ok: true };
}
