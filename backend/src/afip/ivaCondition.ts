/**
 * Que tipo de comprobante (A/B/C) puede emitir un tenant segun su condicion
 * frente al IVA (ArcaConfig.ivaCondition). Reglas AFIP:
 *  - Responsable Inscripto: Factura A (a otro Responsable Inscripto, con CUIT)
 *    o Factura B (a consumidor final / monotributista / exento).
 *  - Monotributo / Exento: solo Factura C (no discriminan IVA).
 * Default seguro (sin config o valor desconocido): solo C, que es el
 * comportamiento que tenia el sistema antes de esta gating.
 */

// tipoComprobante AFIP: 1 = A, 6 = B, 11 = C
export const CBTE_TIPO_A = 1;
export const CBTE_TIPO_B = 6;
export const CBTE_TIPO_C = 11;

const RESPONSABLE_INSCRIPTO = "IVA RESPONSABLE INSCRIPTO";

export function getAllowedCbteTipos(ivaCondition?: string | null): number[] {
  const normalized = String(ivaCondition ?? "").trim().toUpperCase();

  if (normalized === RESPONSABLE_INSCRIPTO) {
    return [CBTE_TIPO_A, CBTE_TIPO_B];
  }

  // RESPONSABLE MONOTRIBUTO, IVA SUJETO EXENTO, CONSUMIDOR FINAL, IVA NO
  // RESPONSABLE, sin config, o cualquier valor no contemplado: solo C.
  return [CBTE_TIPO_C];
}

/**
 * Codigo AFIP de condicion frente al IVA del RECEPTOR (CondicionIVAReceptorId,
 * obligatorio por RG 5616) a partir de Client.ivaCondition (mismos valores que
 * CLIENT_IVA_CONDITIONS del frontend). null = el cliente no la tiene cargada.
 */
export const CONDICION_IVA_RECEPTOR = {
  RESPONSABLE_INSCRIPTO: 1,
  SUJETO_EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
  // "IVA No Responsable" no existe en la tabla de RG 5616: lo mas cercano
  // es 15 (IVA No Alcanzado).
  NO_ALCANZADO: 15,
} as const;

export function condicionIvaReceptorFromClient(ivaCondition?: string | null): number | null {
  const normalized = String(ivaCondition ?? "").trim().toUpperCase();
  switch (normalized) {
    case RESPONSABLE_INSCRIPTO:
      return CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO;
    case "RESPONSABLE MONOTRIBUTO":
      return CONDICION_IVA_RECEPTOR.MONOTRIBUTO;
    case "IVA SUJETO EXENTO":
      return CONDICION_IVA_RECEPTOR.SUJETO_EXENTO;
    case "CONSUMIDOR FINAL":
      return CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL;
    case "IVA NO RESPONSABLE":
      return CONDICION_IVA_RECEPTOR.NO_ALCANZADO;
    default:
      return null;
  }
}

/** Condiciones de receptor que admiten Factura A (RI y monotributistas). */
export const CONDICIONES_FACTURA_A: number[] = [1, 6, 13, 16];

export function cbteTipoLabel(tipo: number): "A" | "B" | "C" {
  if (tipo === CBTE_TIPO_A) return "A";
  if (tipo === CBTE_TIPO_B) return "B";
  return "C";
}
