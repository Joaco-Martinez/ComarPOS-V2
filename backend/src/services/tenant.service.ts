import prisma from "../prisma";
import { currentTenantId } from "../context/tenantContext";
import { tenantScope } from "../utils/tenantScope";

function cleanString(value?: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

type TenantSelfServiceInput = {
  name?: string | null;
  ticketBusinessName?: string | null;
  ticketCuit?: string | null;
  ticketAddress?: string | null;
  ticketPhone?: string | null;
  ticketEmail?: string | null;
};

// Datos que un ADMIN de tenant puede leer/editar de su propio negocio (no el
// registro completo de Tenant - eso incluye cosas de plataforma como
// subscriptionStatus/notes que solo tocamos desde platform-admin).
const SELF_SERVICE_SELECT = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  ticketBusinessName: true,
  ticketCuit: true,
  ticketAddress: true,
  ticketPhone: true,
  ticketEmail: true,
};

export const tenantService = {
  async getMe() {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error("No hay negocio en contexto");

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: SELF_SERVICE_SELECT,
    });

    if (!tenant) throw new Error("Negocio no encontrado");
    return tenant;
  },

  async updateMe(data: TenantSelfServiceInput) {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error("No hay negocio en contexto");

    const cleanData: Record<string, string | number | null> = {};
    // Razon social (legal). A diferencia de los campos ticket* (nullable,
    // caen a esto como fallback -- ver ticket.service.ts), Tenant.name no
    // puede quedar vacio: si mandan un string en blanco se ignora en vez de
    // pisarlo con "".
    if (data.name !== undefined) {
      const name = cleanString(data.name);
      if (name) cleanData.name = name;
    }
    if (data.ticketBusinessName !== undefined) {
      cleanData.ticketBusinessName = cleanString(data.ticketBusinessName);
    }
    if (data.ticketCuit !== undefined) {
      cleanData.ticketCuit = cleanString(data.ticketCuit);
    }
    if (data.ticketAddress !== undefined) {
      cleanData.ticketAddress = cleanString(data.ticketAddress);
    }
    if (data.ticketPhone !== undefined) {
      cleanData.ticketPhone = cleanString(data.ticketPhone);
    }
    if (data.ticketEmail !== undefined) {
      cleanData.ticketEmail = cleanString(data.ticketEmail);
    }
    return prisma.tenant.update({
      where: { id: tenantId },
      data: cleanData,
      select: SELF_SERVICE_SELECT,
    });
  },

  // Stock de respaldo (Configuracion > Stock, ver sale.stock.ts#allocateStockLines).
  // El GET lo lee tambien el POS (cualquier rol) para mostrar como disponible
  // el stock de las ubicaciones de respaldo; el PATCH es solo ADMIN.
  async getStockSettings() {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error("No hay negocio en contexto");

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stockFallbackEnabled: true, stockFallbackLocationIds: true },
    });
    if (!tenant) throw new Error("Negocio no encontrado");
    return tenant;
  },

  async updateStockSettings(data: { stockFallbackEnabled?: unknown; stockFallbackLocationIds?: unknown }) {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error("No hay negocio en contexto");

    const cleanData: { stockFallbackEnabled?: boolean; stockFallbackLocationIds?: string[] } = {};
    if (data.stockFallbackEnabled !== undefined) {
      cleanData.stockFallbackEnabled = data.stockFallbackEnabled === true;
    }
    if (data.stockFallbackLocationIds !== undefined) {
      if (!Array.isArray(data.stockFallbackLocationIds)) {
        throw new Error("stockFallbackLocationIds tiene que ser una lista");
      }
      const ids = [...new Set(data.stockFallbackLocationIds.filter((id): id is string => typeof id === "string" && !!id))];
      // Solo ubicaciones propias del tenant, respetando el orden recibido
      // (es el orden de prioridad de donde se descuenta).
      const owned = await prisma.businessLocation.findMany({
        where: { id: { in: ids }, ...tenantScope() },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map((l) => l.id));
      cleanData.stockFallbackLocationIds = ids.filter((id) => ownedIds.has(id));
    }

    return prisma.tenant.update({
      where: { id: tenantId },
      data: cleanData,
      select: { stockFallbackEnabled: true, stockFallbackLocationIds: true },
    });
  },

  /** Ultimas ventas que descontaron de una ubicacion de respaldo. */
  async getStockFallbackLog(limit = 100) {
    const movements = await prisma.stockMovement.findMany({
      where: { isStockFallback: true, ...tenantScope() },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 500),
      select: {
        id: true,
        createdAt: true,
        quantity: true,
        quantityKg: true,
        reason: true,
        reference: true,
        product: { select: { id: true, name: true, sku: true } },
        fromLocation: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });

    // reference = id de la venta: se suma la ubicacion de la venta (la que
    // se quedo sin stock) y si despues se cancelo.
    const saleIds = [...new Set(movements.map((m) => m.reference).filter((id): id is string => !!id))];
    const sales = await prisma.sale.findMany({
      where: { id: { in: saleIds }, ...tenantScope() },
      select: { id: true, status: true, stockLocationRef: { select: { id: true, name: true } } },
    });
    const saleById = new Map(sales.map((s) => [s.id, s]));

    return movements.map((m) => {
      const sale = m.reference ? saleById.get(m.reference) : undefined;
      return {
        ...m,
        saleId: m.reference,
        saleStatus: sale?.status ?? null,
        saleLocation: sale?.stockLocationRef ?? null,
      };
    });
  },
};
