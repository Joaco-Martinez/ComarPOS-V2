import {
  round2,
  assertPositiveAmount,
  computeCompraBalance,
  computePagoBalance,
  computeAjusteBalance,
} from "../supplierAccount.service";

describe("round2", () => {
  it("redondea a 2 decimales evitando errores de punto flotante", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(10.1 + 0.2)).toBe(10.3);
    expect(round2(100)).toBe(100);
  });
});

describe("assertPositiveAmount", () => {
  it("acepta montos positivos y los redondea a 2 decimales", () => {
    expect(assertPositiveAmount(10.005)).toBe(10.01);
  });

  it("rechaza 0, negativos, NaN e infinito", () => {
    expect(() => assertPositiveAmount(0)).toThrow();
    expect(() => assertPositiveAmount(-5)).toThrow();
    expect(() => assertPositiveAmount(NaN)).toThrow();
    expect(() => assertPositiveAmount(Infinity)).toThrow();
  });
});

describe("computeCompraBalance", () => {
  it("aumenta la deuda con el proveedor por el monto de la compra", () => {
    expect(computeCompraBalance(100, 50)).toEqual({
      previousBalance: 100,
      newBalance: 150,
    });
  });

  it("funciona desde saldo 0", () => {
    expect(computeCompraBalance(0, 250.5)).toEqual({
      previousBalance: 0,
      newBalance: 250.5,
    });
  });
});

describe("computePagoBalance", () => {
  it("reduce la deuda por el monto pagado", () => {
    expect(computePagoBalance(100, 40)).toEqual({
      previousBalance: 100,
      newBalance: 60,
    });
  });

  it("clampea a 0 si se paga mas de lo que se debe (no permite saldo negativo)", () => {
    expect(computePagoBalance(100, 150)).toEqual({
      previousBalance: 100,
      newBalance: 0,
    });
  });

  it("saldo exacto queda en 0", () => {
    expect(computePagoBalance(100, 100)).toEqual({
      previousBalance: 100,
      newBalance: 0,
    });
  });
});

describe("computeAjusteBalance", () => {
  it("un ajuste POSITIVE aumenta la deuda", () => {
    expect(computeAjusteBalance(100, 30, "POSITIVE")).toEqual({
      previousBalance: 100,
      newBalance: 130,
    });
  });

  it("un ajuste NEGATIVE reduce la deuda y clampea a 0", () => {
    expect(computeAjusteBalance(100, 30, "NEGATIVE")).toEqual({
      previousBalance: 100,
      newBalance: 70,
    });
    expect(computeAjusteBalance(100, 500, "NEGATIVE")).toEqual({
      previousBalance: 100,
      newBalance: 0,
    });
  });
});
