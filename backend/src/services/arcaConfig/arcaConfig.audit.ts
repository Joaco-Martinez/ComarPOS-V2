/**
 * Auditoria y estado de salud de la configuracion ARCA.
 * Extraido de arcaConfig.service.ts (doc seccion 4 - modularizacion).
 */
import prisma from "../../prisma";
import { getConfig } from "./arcaConfig.helpers";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";

export async function listAuditLogs() {
  const config = await getConfig();
  return prisma.arcaAuditLog.findMany({
    where: config ? { arcaConfigId: config.id, ...tenantScope() } : { ...tenantScope() },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function audit(action: any, configId?: string | null, userId?: string | null, detail?: string, ip?: string) {
  return prisma.arcaAuditLog.create({
    data: {
      action,
      arcaConfigId: configId || null,
      userId: userId || null,
      detail: detail || null,
      ip: ip || null,
      tenantId: currentTenantId(),
    },
  });
}

export async function markError(configId: string, message: string) {
  const existing = await prisma.arcaConfig.findFirst({ where: { id: configId, ...tenantScope() } });
  if (!existing) throw new Error("Configuración ARCA no encontrada.");

  return prisma.arcaConfig.update({
    where: { id: configId },
    data: { status: "ERROR", lastError: message, lastCheckAt: new Date() },
  });
}

export async function markChecked(configId: string) {
  const existing = await prisma.arcaConfig.findFirst({ where: { id: configId, ...tenantScope() } });
  if (!existing) throw new Error("Configuración ARCA no encontrada.");

  return prisma.arcaConfig.update({
    where: { id: configId },
    data: { lastCheckAt: new Date(), lastSuccessAt: new Date(), lastError: null },
  });
}
