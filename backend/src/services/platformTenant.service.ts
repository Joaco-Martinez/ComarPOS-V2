import prisma from "../prisma";
import bcrypt from "bcryptjs";
import { Role, TenantSubscriptionStatus } from "@prisma/client";
import { invalidateTenantCache } from "../middleware/tenant";
import { endOfDayAR } from "../utils/dateAR";

// Cross-tenant intencional: unico lugar del codigo donde NO se usa
// tenantScope(), porque el super-admin de plataforma necesita ver todos
// los tenants a la vez.
export const platformTenantService = {
  async listTenants() {
    return prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        subscriptionStatus: true,
        paidUntil: true,
        suspendedAt: true,
        trialEndsAt: true,
        contactPhone: true,
        mpPreapprovalId: true,
        mpSubscriptionAmount: true,
        notes: true,
        createdAt: true,
      },
    });
  },

  async getTenantById(id: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        paymentLogs: {
          orderBy: { createdAt: "desc" },
          include: { platformAdmin: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (!tenant) throw new Error("Tenant no encontrado");

    return tenant;
  },

  async updateSubscription(
    id: string,
    data: { status?: string; note?: string; paidUntil?: string; trialEndsAt?: string },
    platformAdminId?: string
  ) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new Error("Tenant no encontrado");

    const newStatus = data.status as TenantSubscriptionStatus | undefined;
    if (newStatus && !Object.values(TenantSubscriptionStatus).includes(newStatus)) {
      throw new Error("Estado de suscripción inválido");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.tenant.update({
        where: { id },
        data: {
          subscriptionStatus: newStatus ?? tenant.subscriptionStatus,
          paidUntil: data.paidUntil !== undefined ? endOfDayAR(data.paidUntil) : tenant.paidUntil,
          // Extender/acortar el vencimiento de la prueba gratis desde el
          // panel (ej: darle unos días más antes de que la bloquee
          // getTenantBlock). Si el status pasa a algo distinto de TRIAL no
          // se toca: queda de referencia de cuando fue la prueba original.
          trialEndsAt: data.trialEndsAt !== undefined ? endOfDayAR(data.trialEndsAt) : tenant.trialEndsAt,
          suspendedAt: newStatus === "SUSPENDED" ? new Date() : tenant.suspendedAt,
          notes: data.note !== undefined ? data.note : tenant.notes,
        },
      });

      await tx.tenantPaymentLog.create({
        data: {
          tenantId: id,
          platformAdminId: platformAdminId ?? undefined,
          previousStatus: tenant.subscriptionStatus,
          newStatus: newStatus ?? tenant.subscriptionStatus,
          note: data.note,
          paidUntil: data.paidUntil ? endOfDayAR(data.paidUntil) : undefined,
        },
      });

      return result;
    });

    invalidateTenantCache(tenant.slug, tenant.id);

    return updated;
  },

  async createTenant(data: {
    name: string;
    slug: string;
    adminEmail: string;
    adminPassword: string;
  }) {
    const name = String(data.name || "").trim();
    const slug = String(data.slug || "").trim().toLowerCase();
    const adminEmail = String(data.adminEmail || "").trim().toLowerCase();
    const adminPassword = String(data.adminPassword || "");

    if (!name) throw new Error("El nombre es obligatorio");
    if (!slug) throw new Error("El slug es obligatorio");
    if (!adminEmail) throw new Error("El email del admin es obligatorio");
    if (!adminPassword || adminPassword.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    }

    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) throw new Error("Ya existe un tenant con ese slug");

    const passwordHash = await bcrypt.hash(adminPassword, 10);

    return prisma.tenant.create({
      data: {
        name,
        slug,
        users: {
          create: {
            email: adminEmail,
            password: passwordHash,
            name: "Administrador",
            role: Role.ADMIN,
          },
        },
      },
      include: { users: { select: { id: true, email: true, name: true, role: true } } },
    });
  },
};
