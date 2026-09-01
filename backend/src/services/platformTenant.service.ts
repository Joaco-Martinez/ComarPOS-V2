import prisma from "../prisma";
import bcrypt from "bcryptjs";
import { Response } from "express";
import { Role, TenantSubscriptionStatus } from "@prisma/client";
import { invalidateTenantCache } from "../middleware/tenant";
import { endOfDayAR } from "../utils/dateAR";
import { PLANS, DEFAULT_PLAN_ID, PlanFeatureKey, FEATURE_LABELS } from "../config/billing";
import { authService } from "./auth.service";
import { trialSignupService } from "./trialSignup.service";
import type { BusinessPresetSelection } from "./businessPreset.service";

const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as PlanFeatureKey[];

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
   * Prende/apaga un modulo para UN tenant puntual, sin importar su plan --
   * a diferencia de planFeatureConfigService.setFeature (que pisa el plan
   * entero), esto solo afecta a este tenant. Se guarda en
   * Tenant.featureOverrides (mapa parcial), leido por
   * planFeature.service.ts#getEffectiveFeatures y billing.service.ts#getStatus.
   * No hay cache propio que invalidar (esos dos leen la fila del tenant al
   * toque en cada request).
   */
  async setTenantFeatureOverride(id: string, feature: PlanFeatureKey, enabled: boolean) {
    if (!FEATURE_KEYS.includes(feature)) throw new Error("Módulo inválido");

    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { featureOverrides: true } });
    if (!tenant) throw new Error("Tenant no encontrado");

    const current = (tenant.featureOverrides as Partial<Record<PlanFeatureKey, boolean>>) ?? {};
    const updated = { ...current, [feature]: enabled };

    await prisma.tenant.update({ where: { id }, data: { featureOverrides: updated } });

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
   * tenant, sin password. Queda registrado en AuditLog (accion
   * IMPERSONATE_START) para trazabilidad interna de plataforma, pero
   * auditLogService filtra esa accion a proposito de lo que ve el propio
   * tenant en su pantalla de Auditoria -- el acceso de soporte no debe ser
   * visible desde adentro del negocio.
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

  /**
   * Cuenta demo de 7 días creada por un super-admin (a diferencia de
   * createTenant() de arriba, que es gratis pero ACTIVA sin trial) - para
   * mostrarle el sistema andando a un prospecto en el momento, ver botón
   * "Crear cuenta demo" en /platform-admin y en el CRM de puerta a puerta
   * (leadId). Reusa trialSignupService.signup() (mismo alta que
   * /trial-signup self-service) en vez de duplicar la lógica de creación.
   */
  async createDemoTenant(
    data: {
      businessName: string;
      adminName: string;
      adminEmail: string;
      adminPassword: string;
      phone: string;
      businessType?: string;
      presetSelection?: BusinessPresetSelection;
      leadId?: string;
    },
    platformAdminId?: string
  ) {
    const { tenant } = await trialSignupService.signup({
      businessName: data.businessName,
      adminName: data.adminName,
      adminEmail: data.adminEmail,
      adminPassword: data.adminPassword,
      phone: data.phone,
      businessType: data.businessType,
      presetSelection: data.presetSelection,
      createdByPlatformAdminId: platformAdminId,
    });

    if (data.leadId) {
      await prisma.salesLead.update({
        where: { id: data.leadId },
        data: { status: "CLIENTE", convertedTenantId: tenant.id },
      });
    }

    return tenant;
  },

  /**
   * Borrado REAL (no soft-delete) de un tenant y absolutamente todo lo que
   * cuelga de él - a diferencia de "suspender" (updateSubscription), esto no
   * se puede deshacer. Pensado para limpiar cuentas demo/prueba que no
   * prosperaron, no para negocios con actividad real (el caller debería
   * confirmarlo fuerte antes de llamar esto, ver el modal de confirmación en
   * el frontend).
   *
   * Ninguna de las ~40 relaciones hacia Tenant tiene onDelete:Cascade a nivel
   * de schema (a proposito, para no poder borrar un tenant sin querer desde
   * cualquier lado) - así que hay que borrar todo a mano, en el orden que
   * respeta las foreign keys (primero lo que referencia, después lo
   * referenciado). Los modelos "hijos" de una fila que sí se borra acá
   * (SaleItem de Sale, PurchaseItem de Purchase, etc., todos con
   * onDelete:Cascade hacia su padre directo) NO se listan explícitamente:
   * Postgres los borra solo en cuanto se borra el padre.
   *
   * Corre en una única transacción: si algo se rompe a mitad de camino (ej.
   * se nos escapó algún modelo con una FK viva hacia el tenant), Postgres
   * hace rollback completo y no se pierde nada - por eso vale la pena tener
   * el orden bien pensado pero no es catastrófico si algo quedó mal
   * ordenado, simplemente falla entero y hay que arreglarlo.
   */
  async deleteTenant(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new Error("Tenant no encontrado");

    await prisma.$transaction(
      async (tx) => {
        // Autoreferenciado en Product (componentes de kits) - no cascadea del
        // lado "componentId", hay que sacarlo de encima antes de tocar Product.
        await tx.productComponent.deleteMany({
          where: { OR: [{ composite: { tenantId: id } }, { component: { tenantId: id } }] },
        });
        // Sin tenantId propio, sin cascade hacia Product - via relación.
        await tx.alert.deleteMany({ where: { product: { tenantId: id } } });
        await tx.productStats.deleteMany({ where: { product: { tenantId: id } } });

        await tx.productStock.deleteMany({ where: { tenantId: id } });
        await tx.pushToken.deleteMany({ where: { tenantId: id } });

        // Todo lo que referencia Sale/Client/User/BusinessLocation sin
        // cascade (o cuyos hijos SI cascadean pero el modelo en si no) -
        // tiene que desaparecer antes que esos cuatro.
        await tx.reservation.deleteMany({ where: { tenantId: id } });
        await tx.repairOrder.deleteMany({ where: { tenantId: id } });
        await tx.order.deleteMany({ where: { tenantId: id } });
        await tx.return.deleteMany({ where: { tenantId: id } });
        await tx.remito.deleteMany({ where: { tenantId: id } });
        await tx.invoiceAfip.deleteMany({ where: { tenantId: id } });
        // Sin tenantId propio.
        await tx.invoice.deleteMany({ where: { sale: { tenantId: id } } });
        await tx.accountMovement.deleteMany({ where: { client: { tenantId: id } } });
        await tx.supplierAccountMovement.deleteMany({ where: { supplier: { tenantId: id } } });

        await tx.stockMovement.deleteMany({ where: { tenantId: id } });
        await tx.stockCount.deleteMany({ where: { tenantId: id } });
        await tx.cashSession.deleteMany({ where: { tenantId: id } });
        await tx.vatSettlement.deleteMany({ where: { tenantId: id } });
        await tx.auditLog.deleteMany({ where: { tenantId: id } });
        await tx.notification.deleteMany({ where: { tenantId: id } });

        // Ahora sí, Sale (ya no queda nada referenciandola sin cascade).
        await tx.sale.deleteMany({ where: { tenantId: id } });

        await tx.purchase.deleteMany({ where: { tenantId: id } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId: id } });
        await tx.finance.deleteMany({ where: { tenantId: id } });
        await tx.financeAccount.deleteMany({ where: { tenantId: id } });
        await tx.promotion.deleteMany({ where: { tenantId: id } });

        await tx.loyaltyAccount.deleteMany({ where: { tenantId: id } });
        await tx.client.deleteMany({ where: { tenantId: id } });
        // PriceListItem referencia Product sin cascade - PriceList tiene que
        // irse antes que Product.
        await tx.priceList.deleteMany({ where: { tenantId: id } });
        await tx.product.deleteMany({ where: { tenantId: id } });
        await tx.productCategory.deleteMany({ where: { tenantId: id } });

        await tx.supplier.deleteMany({ where: { tenantId: id } });

        await tx.room.deleteMany({ where: { tenantId: id } });
        await tx.roomType.deleteMany({ where: { tenantId: id } });

        await tx.tenantStorefrontConfig.deleteMany({ where: { tenantId: id } });
        await tx.tenantMpConfig.deleteMany({ where: { tenantId: id } });

        // User despues de Client (Client.userId lo referencia), antes de
        // BusinessLocation (User.defaultBusinessLocationId la referencia).
        await tx.user.deleteMany({ where: { tenantId: id } });
        await tx.businessLocation.deleteMany({ where: { tenantId: id } });

        await tx.arcaAuditLog.deleteMany({ where: { tenantId: id } });
        await tx.arcaConfig.deleteMany({ where: { tenantId: id } });
        await tx.cbteCounter.deleteMany({ where: { tenantId: id } });

        await tx.recurringExpense.deleteMany({ where: { tenantId: id } });
        await tx.exchangeRate.deleteMany({ where: { tenantId: id } });
        await tx.salesGoal.deleteMany({ where: { tenantId: id } });

        await tx.printJob.deleteMany({ where: { tenantId: id } });
        await tx.printboxDevice.deleteMany({ where: { tenantId: id } });

        await tx.tenantPaymentLog.deleteMany({ where: { tenantId: id } });

        // SalesLead.convertedTenantId es onDelete:SetNull -- no hace falta
        // tocarlo, Postgres lo deja en null solo.
        await tx.tenant.delete({ where: { id } });
      },
      {
        // Muchos round-trips secuenciales (uno por deleteMany) contra una DB
        // remota (Railway) - el timeout/maxWait default de Prisma (5s/2s) no
        // alcanza, mismo problema visto en trialSignup.service.ts al aplicar
        // un preset completo.
        maxWait: 15000,
        timeout: 90000,
      }
    );

    invalidateTenantCache(tenant.slug, tenant.id);
  },
};
