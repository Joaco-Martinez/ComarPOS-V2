import prisma from "../prisma";
import bcrypt from "bcryptjs";
import { Response } from "express";
import { Role, TenantSubscriptionStatus } from "@prisma/client";
import { invalidateTenantCache } from "../middleware/tenant";
import { endOfDayAR } from "../utils/dateAR";
import { PLANS, DEFAULT_PLAN_ID } from "../config/billing";
import { authService } from "./auth.service";

// Ultimo login entre todas las cuentas del tenant -- el indicador real de
// "¿lo está usando?" es de cualquier usuario, no de uno en particular.
function maxLastLogin(users: { lastLoginAt: Date | null }[]): Date | null {
  return users.reduce<Date | null>(
    (max, u) => (u.lastLoginAt && (!max || u.lastLoginAt > max) ? u.lastLoginAt : max),
    null
  );
}

// Cross-tenant intencional: unico lugar del codigo donde NO se usa
// tenantScope(), porque el super-admin de plataforma necesita ver todos
// los tenants a la vez.
export const platformTenantService = {
  async listTenants() {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        subscriptionStatus: true,
        planId: true,
        paidUntil: true,
        suspendedAt: true,
        trialEndsAt: true,
        contactPhone: true,
        mpPreapprovalId: true,
        mpSubscriptionAmount: true,
        notes: true,
        createdAt: true,
        // Auditoria: cuentas del negocio (nombre/email/rol/ultimo login), sin
        // el hash de password ni tokens de reseteo.
        users: {
          select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, lastLoginAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // Uso real (¿lo usa o no?): cantidad de ventas y fecha de la ultima,
    // agrupado en una sola query en vez de N+1 por tenant.
    const salesByTenant = await prisma.sale.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenants.map((t) => t.id) } },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const salesMap = new Map(salesByTenant.map((s) => [s.tenantId, s]));

    return tenants.map((t) => {
      const sales = salesMap.get(t.id);
      return {
        ...t,
        lastLoginAt: maxLastLogin(t.users),
        salesCount: sales?._count._all ?? 0,
        lastSaleAt: sales?._max.createdAt ?? null,
      };
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
        users: {
          select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, lastLoginAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!tenant) throw new Error("Tenant no encontrado");

    const [salesAgg, productsCount] = await Promise.all([
      prisma.sale.aggregate({
        where: { tenantId: id, status: { not: "CANCELLED" } },
        _count: { _all: true },
        _max: { createdAt: true },
        _sum: { total: true },
      }),
      prisma.product.count({ where: { tenantId: id } }),
    ]);

    return {
      ...tenant,
      lastLoginAt: maxLastLogin(tenant.users),
      salesCount: salesAgg._count._all,
      lastSaleAt: salesAgg._max.createdAt,
      totalRevenue: salesAgg._sum.total ?? 0,
      productsCount,
    };
  },

  async updateSubscription(
    id: string,
    data: { status?: string; note?: string; paidUntil?: string; trialEndsAt?: string; planId?: string },
    platformAdminId?: string
  ) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new Error("Tenant no encontrado");

    const newStatus = data.status as TenantSubscriptionStatus | undefined;
    if (newStatus && !Object.values(TenantSubscriptionStatus).includes(newStatus)) {
      throw new Error("Estado de suscripción inválido");
    }

    if (data.planId && !PLANS.some((p) => p.id === data.planId)) {
      throw new Error("Plan inválido");
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
          planId: data.planId ?? tenant.planId,
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

  /**
   * Alta manual desde el panel de super-admin. A diferencia del alta
   * self-service (trialSignup.service.ts), este tenant arranca directo en
   * subscriptionStatus=ACTIVE (nunca TRIAL) y sin paidUntil -- getTenantBlock
   * (middleware/tenant.ts) solo bloquea por SUSPENDED/isActive o TRIAL
   * vencido, asi que un tenant ACTIVE sin paidUntil queda gratis indefinido
   * hasta que un admin lo suspenda a mano. planId es opcional: si no se
   * pasa o no matchea un plan real, cae al plan recomendado (mismo criterio
   * que trialSignup.service.ts) en vez de rechazar el alta.
   */
  async createTenant(
    data: {
      name: string;
      slug: string;
      adminEmail: string;
      adminPassword: string;
      planId?: string;
    },
    platformAdminId?: string
  ) {
    const name = String(data.name || "").trim();
    const slug = String(data.slug || "").trim().toLowerCase();
    const adminEmail = String(data.adminEmail || "").trim().toLowerCase();
    const adminPassword = String(data.adminPassword || "");
    const planId = PLANS.some((p) => p.id === data.planId) ? (data.planId as string) : DEFAULT_PLAN_ID;

    if (!name) throw new Error("El nombre es obligatorio");
    if (!slug) throw new Error("El slug es obligatorio");
    if (!adminEmail) throw new Error("El email del admin es obligatorio");
    if (!adminPassword || adminPassword.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    }

    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) throw new Error("Ya existe un tenant con ese slug");

    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name,
          slug,
          isActive: true,
          subscriptionStatus: "ACTIVE",
          planId,
          notes: "Cuenta gratuita creada desde el panel de super-admin, sin pasar por Mercado Pago.",
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

      await tx.businessLocation.create({
        data: {
          name: "Casa Central",
          type: "STORE",
          isDefault: true,
          isActive: true,
          tenantId: created.id,
        },
      });

      await tx.tenantPaymentLog.create({
        data: {
          tenantId: created.id,
          platformAdminId: platformAdminId ?? undefined,
          previousStatus: "ACTIVE",
          newStatus: "ACTIVE",
          note: `Tenant creado gratis por super-admin con plan "${planId}".`,
        },
      });

      return created;
    });

    invalidateTenantCache(tenant.slug, tenant.id);

    return tenant;
  },

  /**
   * "Entrar como" un tenant desde el panel de super-admin, para soporte:
   * arma una sesion real de tenant (mismas cookies que un login normal, ver
   * authService.impersonate) sobre el primer usuario ADMIN activo del
   * tenant, sin password. Queda registrado en AuditLog del propio tenant
   * para que sea auditable desde adentro (Auditoria en el menu del negocio).
   */
  async impersonate(tenantId: string, platformAdminId: string | undefined, res: Response) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error("Tenant no encontrado");

    const user =
      (await prisma.user.findFirst({
        where: { tenantId, isActive: true, role: "ADMIN" },
        orderBy: { createdAt: "asc" },
      })) ??
      (await prisma.user.findFirst({
        where: { tenantId, isActive: true, role: "EMPLEADO" },
        orderBy: { createdAt: "asc" },
      }));

    if (!user) {
      throw new Error("Este tenant no tiene ninguna cuenta de negocio activa para ingresar");
    }

    const cleanUser = await authService.impersonate(user.id, res);

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: user.id,
        entity: "Tenant",
        entityId: tenantId,
        action: "IMPERSONATE_START",
        changes: { platformAdminId: platformAdminId ?? null },
      },
    });

    return cleanUser;
  },
};
