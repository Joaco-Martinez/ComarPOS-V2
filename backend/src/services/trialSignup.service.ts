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
import { PLANS, DEFAULT_PLAN_ID } from "../config/billing";
import { LEGACY_CATEGORY_ACCOUNTS } from "../utils/legacyFinanceCategories";
import { businessPresetService, type BusinessPresetSelection } from "./businessPreset.service";
import { priceListService } from "./priceList.service";

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
    planId?: string;
    // Rubro elegido en el paso "¿qué tipo de negocio tenés?" del wizard (ver
    // frontend/app/prueba-gratis/page.tsx) + qué categorias/productos de ese
    // preset dejó tildados. businessType ausente/invalido = no precarga nada
    // (igual que antes de este wizard).
    businessType?: string;
    presetSelection?: BusinessPresetSelection;
    // Presente solo cuando el alta la dispara un super-admin desde
    // /platform-admin (ver platformAdmin.controller.ts#createDemoTenant), no
    // el propio visitante de la landing - deja un TenantPaymentLog con quien
    // la creó, mismo patron que platformTenant.service.ts#createTenant.
    createdByPlatformAdminId?: string;
  }) {
    const businessName = String(data.businessName || "").trim();
    const adminName = String(data.adminName || "").trim();
    const adminEmail = String(data.adminEmail || "").trim().toLowerCase();
    const adminPassword = String(data.adminPassword || "");
    const phone = String(data.phone || "").trim();
    const businessType = data.businessType && businessPresetService.getBySlug(data.businessType)
      ? data.businessType
      : undefined;
    // Plan invalido/ausente -> el recomendado, nunca rechaza el alta por esto.
    const planId = PLANS.some((p) => p.id === data.planId) ? (data.planId as string) : DEFAULT_PLAN_ID;

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
      let tenant = await tx.tenant.create({
        data: {
          name: businessName,
          slug,
          isActive: true,
          subscriptionStatus: "TRIAL",
          trialEndsAt,
          contactPhone: phone,
          planId,
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

      // Plan de cuentas default (isSystem=true), igual que en
      // scripts/createTenant.ts -- ver utils/legacyFinanceCategories.ts.
      await tx.financeAccount.createMany({
        data: LEGACY_CATEGORY_ACCOUNTS.map((c) => ({
          tenantId: tenant.id,
          name: c.label,
          type: c.type,
          isSystem: true,
          isActive: true,
        })),
      });

      // Lista de precios default (doc "listas de precios"), igual que en
      // scripts/createTenant.ts -- faltaba acá (ver comentario historico),
      // ahora hace falta si el wizard de rubro crea productos abajo.
      await tx.priceList.create({
        data: {
          tenantId: tenant.id,
          name: "Minorista",
          description: "Lista principal (venta al público) - se sincroniza con el precio del producto",
          isDefault: true,
          isActive: true,
        },
      });

      // Categorias/productos de ejemplo del rubro elegido (doc "wizard tipo
      // Treinta") - ver businessPreset.service.ts#apply. Vacio si el usuario
      // no eligió rubro o prefirió "configurarlo yo".
      const presetProducts = businessType
        ? await businessPresetService.apply(tx, tenant.id, businessType, data.presetSelection)
        : [];

      if (presetProducts.length > 0) {
        // Arranca con stock en 0 en la sucursal default, igual que un alta
        // manual de producto (ver product.write.ts#create) - así las
        // pantallas de stock encuentran la fila en vez de tratarlo como
        // "sin ubicación".
        await tx.productStock.createMany({
          data: presetProducts.map((p) => ({
            productId: p.id,
            businessLocationId: location.id,
            tenantId: tenant.id,
          })),
        });
      }

      if (businessType) {
        // Pisa el `tenant` de más abajo (no solo la fila en la DB): si no,
        // el objeto que devuelve signup() queda con businessType=null hasta
        // el proximo GET, aunque la DB ya lo tenga bien guardado.
        tenant = await tx.tenant.update({ where: { id: tenant.id }, data: { businessType } });
      }

      if (data.createdByPlatformAdminId) {
        await tx.tenantPaymentLog.create({
          data: {
            tenantId: tenant.id,
            platformAdminId: data.createdByPlatformAdminId,
            previousStatus: "TRIAL",
            newStatus: "TRIAL",
            note: "Cuenta demo (7 días) creada desde Platform Admin.",
          },
        });
      }

      return { tenant, admin, location, presetProducts };
    }, {
      // maxWait/timeout mayores al default (2s/5s): con un preset de rubro
      // completo (varias categorias + productos, cada uno con su propio
      // chequeo de slug/SKU unico) la cantidad de round-trips a la DB supera
      // el timeout default y Prisma corta la transaccion (P2028) antes de
      // terminar - visto en la práctica al aplicar un preset sin selección
      // parcial.
      maxWait: 10000,
      timeout: 30000,
    });

    invalidateTenantCache(result.tenant.slug, result.tenant.id);

    // Fuera de la transaccion (mismo patron que product.write.ts#create):
    // sincroniza cada producto de ejemplo con la lista de precios default
    // recien creada.
    for (const product of result.presetProducts) {
      await priceListService.syncDefaultPriceListItem(result.tenant.id, product);
    }

    return result;
  },
};
