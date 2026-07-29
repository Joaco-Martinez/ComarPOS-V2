import { getAllowedCbteTipos, cbteTipoLabel, CBTE_TIPO_A, CBTE_TIPO_B, CBTE_TIPO_C } from "../ivaCondition";

describe("getAllowedCbteTipos", () => {
  it("Responsable Inscripto puede emitir A y B, no C", () => {
    const allowed = getAllowedCbteTipos("IVA RESPONSABLE INSCRIPTO");
    expect(allowed).toEqual([CBTE_TIPO_A, CBTE_TIPO_B]);
    expect(allowed).not.toContain(CBTE_TIPO_C);
  });

  it("es insensible a mayusculas/minusculas y espacios extra", () => {
    expect(getAllowedCbteTipos("  iva responsable inscripto  ")).toEqual([CBTE_TIPO_A, CBTE_TIPO_B]);
  });

  it("Monotributo solo puede emitir C", () => {
    expect(getAllowedCbteTipos("RESPONSABLE MONOTRIBUTO")).toEqual([CBTE_TIPO_C]);
  });

  it("Exento solo puede emitir C", () => {
    expect(getAllowedCbteTipos("IVA SUJETO EXENTO")).toEqual([CBTE_TIPO_C]);
  });

  it("sin condicion configurada, default seguro es solo C", () => {
    expect(getAllowedCbteTipos(undefined)).toEqual([CBTE_TIPO_C]);
    expect(getAllowedCbteTipos(null)).toEqual([CBTE_TIPO_C]);
    expect(getAllowedCbteTipos("")).toEqual([CBTE_TIPO_C]);
  });

  it("un valor desconocido tambien cae al default seguro (solo C)", () => {
    expect(getAllowedCbteTipos("ALGO_QUE_NO_EXISTE")).toEqual([CBTE_TIPO_C]);
  });
});

describe("cbteTipoLabel", () => {
  it("mapea los codigos AFIP a A/B/C", () => {
    expect(cbteTipoLabel(1)).toBe("A");
    expect(cbteTipoLabel(6)).toBe("B");
    expect(cbteTipoLabel(11)).toBe("C");
  });

  it("cualquier otro codigo cae a C por default", () => {
    expect(cbteTipoLabel(99)).toBe("C");
  });
});
