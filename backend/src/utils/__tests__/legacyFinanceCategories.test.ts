import { CategoryFinance, FinanceType } from "@prisma/client";
import {
  defaultTypeForLegacyCategory,
  LEGACY_CATEGORY_ACCOUNTS,
  LEGACY_CATEGORY_LABELS,
} from "../legacyFinanceCategories";

describe("defaultTypeForLegacyCategory", () => {
  it("VENTA y COBRANZA son INGRESO", () => {
    expect(defaultTypeForLegacyCategory(CategoryFinance.VENTA)).toBe(FinanceType.INGRESO);
    expect(defaultTypeForLegacyCategory(CategoryFinance.COBRANZA)).toBe(FinanceType.INGRESO);
  });

  it("CompraMercaderia es EGRESO", () => {
    expect(defaultTypeForLegacyCategory(CategoryFinance.CompraMercaderia)).toBe(FinanceType.EGRESO);
  });

  it("el resto de las categorias de gastos operativos son EGRESO", () => {
    const expectedEgreso: CategoryFinance[] = [
      CategoryFinance.AlquilerL1,
      CategoryFinance.AlquilerF1,
      CategoryFinance.Alarma,
      CategoryFinance.Sueldos,
      CategoryFinance.MateriaPrima,
      CategoryFinance.Impuestos,
      CategoryFinance.VEP,
      CategoryFinance.Contadora,
      CategoryFinance.Arca,
      CategoryFinance.Eenvios,
      CategoryFinance.Publicidad,
      CategoryFinance.Otro,
    ];

    for (const category of expectedEgreso) {
      expect(defaultTypeForLegacyCategory(category)).toBe(FinanceType.EGRESO);
    }
  });

  it("no hay ningun valor del enum sin mapear", () => {
    const allCategories = Object.values(CategoryFinance);
    for (const category of allCategories) {
      expect(["INGRESO", "EGRESO"]).toContain(defaultTypeForLegacyCategory(category));
    }
  });
});

describe("LEGACY_CATEGORY_ACCOUNTS", () => {
  it("tiene exactamente una entrada por cada valor del enum CategoryFinance", () => {
    const allCategories = Object.values(CategoryFinance);
    expect(LEGACY_CATEGORY_ACCOUNTS).toHaveLength(allCategories.length);
    const categoriesInList = LEGACY_CATEGORY_ACCOUNTS.map((a) => a.category).sort();
    expect(categoriesInList).toEqual([...allCategories].sort());
  });

  it("cada entrada usa el label de LEGACY_CATEGORY_LABELS y el type derivado del mapeo", () => {
    for (const entry of LEGACY_CATEGORY_ACCOUNTS) {
      expect(entry.label).toBe(LEGACY_CATEGORY_LABELS[entry.category]);
      expect(entry.type).toBe(defaultTypeForLegacyCategory(entry.category));
    }
  });

  it("no tiene labels vacios ni duplicados", () => {
    const labels = LEGACY_CATEGORY_ACCOUNTS.map((a) => a.label);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
