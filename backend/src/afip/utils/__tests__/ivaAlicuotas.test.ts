import { calcularIvaPorAlicuota } from "../ivaAlicuotas";

const sum = (ns: number[]) => Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100;

describe("calcularIvaPorAlicuota", () => {
  it("todo al 21%", () => {
    const r = calcularIvaPorAlicuota([{ subtotal: 1210, ivaRate: 21 }], 1210);
    expect(r).toEqual({ neto: 1000, iva: 210, alicuotas: [{ rate: 21, id: 5, baseImp: 1000, importe: 210 }] });
  });

  it("mezcla 10,5% y 21% separa cada alicuota", () => {
    const r = calcularIvaPorAlicuota(
      [
        { subtotal: 1105, ivaRate: 10.5 },
        { subtotal: 1210, ivaRate: 21 },
      ],
      2315
    );
    expect(r.alicuotas).toEqual([
      { rate: 10.5, id: 4, baseImp: 1000, importe: 105 },
      { rate: 21, id: 5, baseImp: 1000, importe: 210 },
    ]);
    expect(r.neto).toBe(2000);
    expect(r.iva).toBe(315);
  });

  it("prorratea un descuento de la venta y cuadra exacto con el total", () => {
    const r = calcularIvaPorAlicuota(
      [
        { subtotal: 999.99, ivaRate: 10.5 },
        { subtotal: 333.33, ivaRate: 21 },
        { subtotal: 100, ivaRate: 0 },
      ],
      1234.57
    );
    expect(sum(r.alicuotas.map((a) => a.baseImp))).toBe(r.neto);
    expect(sum(r.alicuotas.map((a) => a.importe))).toBe(r.iva);
    expect(sum([r.neto, r.iva])).toBe(1234.57);
    expect(r.alicuotas.find((a) => a.rate === 0)).toMatchObject({ id: 3, importe: 0 });
  });

  it("sin items cae al 21% sobre el total", () => {
    const r = calcularIvaPorAlicuota([], 121);
    expect(r).toEqual({ neto: 100, iva: 21, alicuotas: [{ rate: 21, id: 5, baseImp: 100, importe: 21 }] });
  });

  it("rechaza alicuotas que AFIP no admite", () => {
    expect(() => calcularIvaPorAlicuota([{ subtotal: 100, ivaRate: 19 }], 100)).toThrow(/no admitida/);
  });
});
