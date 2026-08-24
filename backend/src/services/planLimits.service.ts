import prisma from "../prisma";
import { getPlan } from "../config/billing";

type LimitedResource = "businessLocations" | "products" | "users";

const RESOURCE_LABEL: Record<LimitedResource, string> = {
  businessLocations: "sucursales/depósitos",
  products: "productos",
  users: "usuarios",
};

async function countCurrent(tenantId: string, resource: LimitedResource) {
  if (resource === "businessLocations") {
    return prisma.businessLocation.count({ where: { tenantId } });
  }
  if (resource === "products") {
    return prisma.product.count({ where: { tenantId } });
  }
  // "users" = cuentas del sistema (ADMIN/EMPLEADO) -- un usuario con rol
  // CLIENTE es un cliente con portal propio, no cuenta contra este limite.
  return prisma.user.count({ where: { tenantId, role: { in: ["ADMIN", "EMPLEADO"] } } });
}

export const planLimitsService = {
  /**
   * Chequeo previo a crear una sucursal/producto/usuario nuevo, contra el
   * limite del plan actual del tenant (ver config/billing.ts). Cada call
   * site decide como surfacear el resultado (throw vs return {statusCode},
   * segun la convencion de ese service) -- este helper solo informa.
   */
  async checkLimit(
    tenantId: string | null | undefined,
    resource: LimitedResource
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    // Sin tenant resuelto (scripts internos, seeds, contextos sin
    // multi-tenant) no hay plan que aplicar -- no se limita.
    if (!tenantId) return { ok: true };

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { planId: true } });
    if (!tenant) return { ok: true };

    const plan = getPlan(tenant.planId);
    const max =
      resource === "businessLocations" ? plan.limits.maxBusinessLocations
      : resource === "products" ? plan.limits.maxProducts
      : plan.limits.maxUsers;

    if (max == null) return { ok: true }; // ilimitado en este plan

    const current = await countCurrent(tenantId, resource);
    if (current < max) return { ok: true };

    return {
      ok: false,
      message: `Tu plan (${plan.name}) permite hasta ${max} ${RESOURCE_LABEL[resource]}. Para sumar más, mejorá tu plan desde Suscripción.`,
    };
  },
};
