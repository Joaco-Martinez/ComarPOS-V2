/**
 * Alta self-service de un tenant nuevo en prueba gratis (POST /trial-signup,
 * publico, sin auth - ver routes/trialSignup.routes.ts). Crea el Tenant en
 * subscriptionStatus=TRIAL con trialEndsAt a TRIAL_DAYS desde ahora, su
 * primer usuario ADMIN y una sucursal default, igual que
 * scripts/createTenant.ts pero disparado por un visitante de la landing en
 * vez de a mano. El bloqueo al vencer la prueba es automatico por request
 * (ver middleware/tenant.ts, getTenantBlock), no hace falta cron.
 */
import prisma from "../prisma";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { invalidateTenantCache } from "../middleware/tenant";

export const TRIAL_DAYS = 7;

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueSlug(base: string) {
  const normalized = normalizeSlug(base) || "negocio";
  let candidate = normalized;
  let suffix = 1;

  while (await prisma.tenant.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${normalized}-${suffix}`;
  }

  return candidate;
}

export const trialSignupService = {
  async signup(data: {
    businessName: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
    phone: string;
  }) {
    const businessName = String(data.businessName || "").trim();
    const adminName = String(data.adminName || "").trim();
    const adminEmail = String(data.adminEmail || "").trim().toLowerCase();
    const adminPassword = String(data.adminPassword || "");
    const phone = String(data.phone || "").trim();

    if (!businessName) throw new Error("El nombre del negocio es obligatorio");
    if (!adminName) throw new Error("Tu nombre es obligatorio");
    if (!adminEmail) throw new Error("El email es obligatorio");
    if (!phone) throw new Error("El teléfono es obligatorio");
    if (!adminPassword || adminPassword.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    }

    // email es unico globalmente (migracion user_email_globally_unique), ver
    // mismo chequeo en auth.service.ts/register.
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) throw new Error("Ese email ya está registrado");

    const slug = await uniqueSlug(businessName);
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: businessName,
          slug,
          isActive: true,
          subscriptionStatus: "TRIAL",
          trialEndsAt,
          contactPhone: phone,
          notes: "Alta por prueba gratis.",
        },
      });

      const admin = await tx.user.create({
        data: {
          email: adminEmail,
          password: passwordHash,
          name: adminName,
          role: Role.ADMIN,
          isActive: true,
          mustChangePassword: false,
          tenantId: tenant.id,
        },
      });

      const location = await tx.businessLocation.create({
        data: {
          name: "Casa Central",
          type: "STORE",
          isDefault: true,
          isActive: true,
          tenantId: tenant.id,
        },
      });

      return { tenant, admin, location };
    });

    invalidateTenantCache(result.tenant.slug, result.tenant.id);

    return result;
  },
};
