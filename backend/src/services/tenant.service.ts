import prisma from "../prisma";
import { currentTenantId } from "../context/tenantContext";

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
  deliveryPricePerKm?: number | null;
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
  deliveryPricePerKm: true,
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
    if (data.deliveryPricePerKm !== undefined) {
      // null/0/NaN => borra el override y vuelve a usar el default global
      // (DELIVERY_PRICE_PER_KM). Ver delivery.service.ts.
      const value = Number(data.deliveryPricePerKm);
      cleanData.deliveryPricePerKm = Number.isFinite(value) && value > 0 ? value : null;
    }

    return prisma.tenant.update({
      where: { id: tenantId },
      data: cleanData,
      select: SELF_SERVICE_SELECT,
    });
  },
};
