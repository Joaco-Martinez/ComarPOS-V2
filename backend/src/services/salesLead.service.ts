import prisma from "../prisma";
import { SalesLeadStatus, SalesLeadContactRole } from "@prisma/client";

function clean(value?: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

const VALID_STATUSES = Object.values(SalesLeadStatus);

function normalizeStatus(value: unknown): SalesLeadStatus {
  if (typeof value === "string" && (VALID_STATUSES as string[]).includes(value)) {
    return value as SalesLeadStatus;
  }
  return SalesLeadStatus.PENDIENTE;
}

const VALID_CONTACT_ROLES = Object.values(SalesLeadContactRole);

// null = todavia no se cargo/no se sabe con quien se hablo - a diferencia
// de normalizeStatus, acá SI puede quedar sin valor (no hay un default
// razonable como PENDIENTE).
function normalizeContactRole(value: unknown): SalesLeadContactRole | null {
  if (typeof value === "string" && (VALID_CONTACT_ROLES as string[]).includes(value)) {
    return value as SalesLeadContactRole;
  }
  return null;
}

const ADMIN_SELECT = { id: true, name: true };

export const salesLeadService = {
  async list() {
    return prisma.salesLead.findMany({
      orderBy: { createdAt: "desc" },
      include: { createdByAdmin: { select: ADMIN_SELECT } },
    });
  },

  async create(
    data: {
      businessName?: string;
      address?: string | null;
      contactName?: string | null;
      phone?: string | null;
      notes?: string | null;
      status?: string;
      contactRole?: string | null;
    },
    platformAdminId?: string
  ) {
    const businessName = clean(data.businessName);
    if (!businessName) throw new Error("El nombre del local es obligatorio");

    return prisma.salesLead.create({
      data: {
        businessName,
        address: clean(data.address),
        contactName: clean(data.contactName),
        phone: clean(data.phone),
        notes: clean(data.notes),
        status: data.status ? normalizeStatus(data.status) : SalesLeadStatus.PENDIENTE,
        contactRole: normalizeContactRole(data.contactRole),
        createdByAdminId: platformAdminId ?? null,
      },
      include: { createdByAdmin: { select: ADMIN_SELECT } },
    });
  },

  async update(
    id: string,
    data: Partial<{
      businessName: string;
      address: string | null;
      contactName: string | null;
      phone: string | null;
      notes: string | null;
      status: string;
      contactRole: string | null;
    }>
  ) {
    const existing = await prisma.salesLead.findUnique({ where: { id } });
    if (!existing) throw new Error("Prospecto no encontrado");

    const cleanData: Record<string, unknown> = {};

    if (data.businessName !== undefined) {
      const businessName = clean(data.businessName);
      if (!businessName) throw new Error("El nombre del local es obligatorio");
      cleanData.businessName = businessName;
    }
    if (data.address !== undefined) cleanData.address = clean(data.address);
    if (data.contactName !== undefined) cleanData.contactName = clean(data.contactName);
    if (data.phone !== undefined) cleanData.phone = clean(data.phone);
    if (data.notes !== undefined) cleanData.notes = clean(data.notes);
    if (data.status !== undefined) cleanData.status = normalizeStatus(data.status);
    if (data.contactRole !== undefined) cleanData.contactRole = normalizeContactRole(data.contactRole);

    return prisma.salesLead.update({
      where: { id },
      data: cleanData,
      include: { createdByAdmin: { select: ADMIN_SELECT } },
    });
  },

  async delete(id: string) {
    const existing = await prisma.salesLead.findUnique({ where: { id } });
    if (!existing) throw new Error("Prospecto no encontrado");
    await prisma.salesLead.delete({ where: { id } });
  },
};
