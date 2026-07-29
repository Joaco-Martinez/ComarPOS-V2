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

export function cbteTipoLabel(tipo: number): "A" | "B" | "C" {
  if (tipo === CBTE_TIPO_A) return "A";
  if (tipo === CBTE_TIPO_B) return "B";
  return "C";
}
