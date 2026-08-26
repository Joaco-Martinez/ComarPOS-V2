import { CategoryFinance, FinanceType } from "@prisma/client";

/**
 * Mapea cada valor legacy de CategoryFinance (enum fijo hardcodeado, pensado
 * originalmente para un unico negocio) al FinanceType (INGRESO/EGRESO) con el
 * que se siembra su FinanceAccount equivalente en el plan de cuentas
 * configurable por tenant (ver modelo FinanceAccount en schema.prisma).
 *
 * Criterio (documentado a pedido, no es arbitrario): sigue el uso real que ya
 * tienen estas categorias en el codigo existente, no una interpretacion
 * nueva.
 *   - VENTA: finance.service.ts#registerIncomeFromSale la crea como type:
 *     "INGRESO" (el ingreso de una venta cobrada).
 *   - COBRANZA: account.service.ts la crea como type: "INGRESO" (cobro de
 *     una cuenta corriente de cliente).
 *   - CompraMercaderia: purchase.service.ts la crea como type: "EGRESO"
 *     (compra a proveedor).
 *   - El resto (AlquilerL1, AlquilerF1, Alarma, Sueldos, MateriaPrima,
 *     Impuestos, VEP, Contadora, Arca, Eenvios, Publicidad, Otro): son
 *     gastos operativos del negocio, siempre cargados a mano como EGRESO
 *     desde la pantalla de Finanzas (frontend/app/[tenant]/finanzas/page.tsx)
 *     -- ninguna los usa como ingreso en el codigo actual.
 *
 * Usada tanto por financeAccount.service.ts (seedDefaultAccountsForTenant,
 * para tenants nuevos) como espejada a mano en la migracion SQL
 * 20260826200000_add_finance_account (que no puede importar TS, corre en la
 * base directamente) -- si se toca este mapeo, actualizar tambien esa
 * migracion para tenants creados despues.
 */
export function defaultTypeForLegacyCategory(category: CategoryFinance): FinanceType {
  switch (category) {
    case CategoryFinance.VENTA:
    case CategoryFinance.COBRANZA:
      return FinanceType.INGRESO;
    default:
      return FinanceType.EGRESO;
  }
}

/** Nombre legible para la FinanceAccount sembrada a partir de cada categoria legacy. */
export const LEGACY_CATEGORY_LABELS: Record<CategoryFinance, string> = {
  VENTA: "Venta",
  COBRANZA: "Cobranza",
  CompraMercaderia: "Compra mercadería",
  AlquilerL1: "Alquiler local 1",
  AlquilerF1: "Alquiler frío 1",
  Alarma: "Alarma",
  Sueldos: "Sueldos",
  MateriaPrima: "Materia prima",
  Impuestos: "Impuestos",
  VEP: "VEP",
  Contadora: "Contadora",
  Arca: "ARCA",
  Eenvios: "E-envíos",
  Publicidad: "Publicidad",
  Otro: "Otro",
};

/** Lista lista-para-insertar: una entrada por cada valor de CategoryFinance. */
export const LEGACY_CATEGORY_ACCOUNTS: { category: CategoryFinance; label: string; type: FinanceType }[] = (
  Object.keys(LEGACY_CATEGORY_LABELS) as CategoryFinance[]
).map((category) => ({
  category,
  label: LEGACY_CATEGORY_LABELS[category],
  type: defaultTypeForLegacyCategory(category),
}));
