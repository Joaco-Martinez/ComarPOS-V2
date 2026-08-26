/**
 * Tipos y helpers compartidos del servicio de clientes.
 * Extraidos de client.service.ts (doc seccion 4 - modularizacion).
 */
import { CategoryClient, DocumentType } from "@prisma/client";

export type ClientCategory = "Price" | "Cliente" | "Mayorista";

// Mismos 5 valores que ArcaConfig.ivaCondition (ver frontend
// configuracion/arca/page.tsx y backend/src/afip/ivaCondition.ts).
const IVA_CONDITIONS = [
  "IVA RESPONSABLE INSCRIPTO",
  "RESPONSABLE MONOTRIBUTO",
  "CONSUMIDOR FINAL",
  "IVA SUJETO EXENTO",
  "IVA NO RESPONSABLE",
];

export function normalizeDocumentType(value?: string | null): DocumentType {
  return value === "CUIT" ? DocumentType.CUIT : DocumentType.DNI;
}

export function normalizeIvaCondition(value?: string | null) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return IVA_CONDITIONS.includes(normalized) ? normalized : null;
}

export const DEFAULT_CLIENT_PASSWORD =
  process.env.CLIENT_DEFAULT_PASSWORD || "GrupoVJ123";

export function normalizeCategory(value?: string | null): CategoryClient {
  if (value === "Mayorista") return CategoryClient.Mayorista;

  // Si llega "Cliente" desde algún frontend viejo, ahora lo tratamos como minorista.
  return CategoryClient.Price;
}

export function cleanEmail(value?: string | null) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

export function cleanString(value?: string | null) {
  const text = String(value || "").trim();
  return text || null;
}

export type ClientAddressData = {
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressFloor?: string | null;
  addressApartment?: string | null;
  addressCity?: string | null;
  addressProvince?: string | null;
  addressPostalCode?: string | null;
  addressNotes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function buildAddressData(data: ClientAddressData) {
  const cleanData: any = {};

  if (data.addressStreet !== undefined) {
    cleanData.addressStreet = cleanString(data.addressStreet);
  }

  if (data.addressNumber !== undefined) {
    cleanData.addressNumber = cleanString(data.addressNumber);
  }

  if (data.addressFloor !== undefined) {
    cleanData.addressFloor = cleanString(data.addressFloor);
  }

  if (data.addressApartment !== undefined) {
    cleanData.addressApartment = cleanString(data.addressApartment);
  }

  if (data.addressCity !== undefined) {
    cleanData.addressCity = cleanString(data.addressCity);
  }

  if (data.addressProvince !== undefined) {
    cleanData.addressProvince = cleanString(data.addressProvince);
  }

  if (data.addressPostalCode !== undefined) {
    cleanData.addressPostalCode = cleanString(data.addressPostalCode);
  }

  if (data.addressNotes !== undefined) {
    cleanData.addressNotes = cleanString(data.addressNotes);
  }

  if (data.latitude !== undefined) {
    cleanData.latitude = data.latitude ?? null;
  }

  if (data.longitude !== undefined) {
    cleanData.longitude = data.longitude ?? null;
  }

  return cleanData;
}

export const clientUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
};
