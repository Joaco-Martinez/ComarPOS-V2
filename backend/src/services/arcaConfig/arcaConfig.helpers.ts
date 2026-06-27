/**
 * Tipos y helpers compartidos de configuracion ARCA.
 * Extraidos de arcaConfig.service.ts (doc seccion 4 - modularizacion).
 */
import forge from "node-forge";
import prisma from "../../prisma";
import { arcaCryptoService } from "../arcaCrypto.service";
import { tenantScope } from "../../utils/tenantScope";

export type ArcaEnvironment = "HOMOLOGACION" | "PRODUCCION";
export type RemitoMode = "DIGITAL_FULL" | "PREPRINTED_FORM";

export type UpdateArcaConfigInput = {
  businessName?: string;
  cuit?: string;
  ivaCondition?: string | null;
  fiscalAddress?: string | null;
  iibb?: string | null;
  activityStart?: string | Date | null;
  activityStartDate?: string | Date | null;
  environment?: ArcaEnvironment;
  status?: "ACTIVE" | "INACTIVE" | "ERROR" | "INCOMPLETE" | "CERT_EXPIRED";
  pointOfSale?: number | string | null;
  defaultPointOfSale?: number | string | null;
  defaultCurrencyId?: string | null;
  defaultConcept?: number | string | null;
  certPem?: string | null;
  keyPem?: string | null;
  certExpiresAt?: string | Date | null;
};

export type GenerateCsrInput = UpdateArcaConfigInput & {
  certAlias?: string | null;
};

export type PointOfSaleInput = {
  id?: string;
  number?: number | string;
  pointOfSale?: number | string;
  description?: string | null;
  enabled?: boolean;
  isDefault?: boolean;
  enabledCbteTypes?: number[] | string | null;
};

export type RemitoCaiInput = {
  id?: string;
  mode?: RemitoMode;
  pointOfSale?: number | string;
  cai?: string;
  expiresAt?: string | Date;
  rangeFrom?: number | string | null;
  rangeTo?: number | string | null;
  nextNumber?: number | string | null;
  enabled?: boolean;
};

export function normalizeCuit(cuit?: string | null) {
  return String(cuit || "").replace(/\D/g, "");
}

export function toNullableDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toNullableNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function cleanObject<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export function decryptRequired(value: string | null, fieldName: string) {
  if (!value) throw new Error(`Falta configurar ${fieldName} en ARCA.`);
  return arcaCryptoService.decrypt(value);
}

export function parseEnabledCbteTypes(value: PointOfSaleInput["enabledCbteTypes"]) {
  if (Array.isArray(value)) {
    return value.map(Number).filter((n) => Number.isFinite(n));
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(Number).filter((n) => Number.isFinite(n));
      }
    } catch {
      return value
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n));
    }
  }

  return [];
}

export function assertValidCuit(cuit: string) {
  if (!/^\d{11}$/.test(cuit)) {
    throw new Error("El CUIT debe tener 11 dígitos, sin guiones.");
  }
}

export function getCertExpiration(certPem: string) {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    return cert.validity.notAfter;
  } catch {
    throw new Error("El certificado .crt no es válido.");
  }
}

export function validatePrivateKey(keyPem: string) {
  try {
    forge.pki.privateKeyFromPem(keyPem);
  } catch {
    throw new Error("La clave privada .key no es válida.");
  }
}

export function buildCsrSubject(params: {
  businessName: string;
  cuit: string;
  certAlias?: string | null;
}) {
  return [
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: params.businessName },
    { name: "commonName", value: params.certAlias || "COMARPOS" },
    { name: "serialNumber", value: `CUIT ${params.cuit}` },
  ];
}

export async function getConfig() {
  return prisma.arcaConfig.findFirst({
    where: { ...tenantScope() },
    include: {
      pointsOfSale: true,
      tokens: true,
      remitoCais: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
