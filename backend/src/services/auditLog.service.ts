import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

// Acciones de soporte/plataforma (ej. "entrar como" un tenant desde el panel
// de super-admin, ver platformTenant.service.ts#impersonate) que SÍ quedan
// grabadas en AuditLog para trazabilidad interna, pero nunca deben mostrarse
// en la pantalla de Auditoría que ve el propio tenant (getAll/getEntityHistory,
// los únicos consumidores de esta tabla desde /audit-log). No se borran de la
// base, solo se excluyen de estas dos lecturas.
const HIDDEN_FROM_TENANT_ACTIONS = ["IMPERSONATE_START"];

export const auditLogService = {
  async log(data: {
    userId: string;
    action: string;
    entity: string;
    entityId: string;
    changes?: object;
    ip?: string;
  }) {
    return prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        changes: data.changes ?? undefined,
        ip: data.ip ?? null,
        tenantId: currentTenantId(),
      },
    });
  },

  async getAll(filters?: {
    userId?: string;
    entity?: string;
    entityId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }) {
    const where = {
      ...tenantScope(),
      action: { notIn: HIDDEN_FROM_TENANT_ACTIONS },
      ...(filters?.userId ? { userId: filters.userId } : {}),
      ...(filters?.entity ? { entity: filters.entity } : {}),
      ...(filters?.entityId ? { entityId: filters.entityId } : {}),
      ...(filters?.from || filters?.to
        ? { createdAt: { ...(filters.from && { gte: filters.from }), ...(filters.to && { lte: filters.to }) } }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
    ]);

    return { total, items };
  },

  async getEntityHistory(entity: string, entityId: string) {
    return prisma.auditLog.findMany({
      where: { entity, entityId, action: { notIn: HIDDEN_FROM_TENANT_ACTIONS }, ...tenantScope() },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  },
};
