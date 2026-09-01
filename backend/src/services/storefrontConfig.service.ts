/**
 * Configuracion de la tienda online publica de un tenant (doc "tienda online
 * por tenant"). Se auto-provisiona la primera vez que se pide (ensureConfig)
 * con isEnabled=true - el pedido original era que ComarPOS le de una tienda
 * a cada negocio automaticamente, no que tengan que ir a activarla a mano
 * primero. El dueño la puede apagar despues si no la quiere.
 */
import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { tenantMpConfigService } from "./tenantMpConfig.service";

async function ensureConfig(tenantId: string) {
  const existing = await prisma.tenantStorefrontConfig.findUnique({ where: { tenantId } });
  if (existing) return existing;

  return prisma.tenantStorefrontConfig.create({
    data: { tenantId, isEnabled: true },
  });
}

export const storefrontConfigService = {
  ensureConfig,

  /** Para la tienda publica (storefrontTenantMiddleware ya dejo el tenant
   * correcto en el AsyncLocalStorage) - incluye datos basicos del negocio
   * que ya viven en Tenant (nombre/logo) para no obligar al frontend a
   * pegarle a dos endpoints. */
  async getPublic() {
    const tenantId = currentTenantId();
    if (!tenantId) return null;

    const [config, tenant, mpAccessToken] = await Promise.all([
      ensureConfig(tenantId),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, logoUrl: true, ticketPhone: true, ticketEmail: true, ticketAddress: true },
      }),
      tenantMpConfigService.getActiveAccessToken(tenantId),
    ]);

    return {
      isEnabled: config.isEnabled,
      storeName: config.storeName || tenant?.name || "Tienda",
      description: config.description,
      bannerUrl: config.bannerUrl,
      accentColor: config.accentColor,
      businessHours: config.businessHours,
      pickupEnabled: config.pickupEnabled,
      transferInstructions: config.transferInstructions,
      mpEnabled: !!mpAccessToken,
      logoUrl: tenant?.logoUrl ?? null,
      contactPhone: tenant?.ticketPhone ?? null,
      contactEmail: tenant?.ticketEmail ?? null,
      contactAddress: tenant?.ticketAddress ?? null,
    };
  },

  async getForAdmin() {
    const tenantId = currentTenantId();
    if (!tenantId) return null;
    return ensureConfig(tenantId);
  },

  async update(data: {
    isEnabled?: boolean;
    storeName?: string | null;
    description?: string | null;
    accentColor?: string | null;
    businessHours?: unknown;
    pickupEnabled?: boolean;
    businessLocationId?: string | null;
    transferInstructions?: string | null;
  }) {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error("No se pudo resolver el tenant actual");

    await ensureConfig(tenantId);

    if (data.businessLocationId) {
      const location = await prisma.businessLocation.findFirst({
        where: { id: data.businessLocationId, ...tenantScope() },
        select: { id: true },
      });
      if (!location) throw new Error("Sucursal no encontrada");
    }

    const prismaData: any = {};
    const setIfDefined = (key: string, value: any) => {
      if (value !== undefined) prismaData[key] = value;
    };

    setIfDefined("isEnabled", data.isEnabled);
    setIfDefined("storeName", data.storeName?.trim() || null);
    setIfDefined("description", data.description?.trim() || null);
    setIfDefined("accentColor", data.accentColor || null);
    setIfDefined("businessHours", data.businessHours ?? null);
    setIfDefined("pickupEnabled", data.pickupEnabled);
    setIfDefined("businessLocationId", data.businessLocationId || null);
    setIfDefined("transferInstructions", data.transferInstructions?.trim() || null);

    return prisma.tenantStorefrontConfig.update({ where: { tenantId }, data: prismaData });
  },
};
