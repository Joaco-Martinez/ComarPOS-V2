import { calcularSaldoTecnico } from "../liquidacion.service";

describe("calcularSaldoTecnico", () => {
  it("debito mayor a credito, sin arrastre: da a pagar", () => {
    const result = calcularSaldoTecnico({
      debitoFiscal: 1000,
      creditoFiscal: 400,
      saldoTecnicoAnterior: 0,
    });

    expect(result.saldoTecnico).toBe(600);
    expect(result.resultado).toBe("A_PAGAR");
    expect(result.saldoAFavorProximoPeriodo).toBe(0);
  });

  it("credito mayor a debito, sin arrastre: da a favor y arrastra la diferencia", () => {
    const result = calcularSaldoTecnico({
      debitoFiscal: 400,
      creditoFiscal: 1000,
      saldoTecnicoAnterior: 0,
    });

    expect(result.saldoTecnico).toBe(-600);
    expect(result.resultado).toBe("A_FAVOR");
    expect(result.saldoAFavorProximoPeriodo).toBe(600);
  });

  it("saldo exactamente en cero no queda a pagar ni arrastra nada", () => {
    const result = calcularSaldoTecnico({
      debitoFiscal: 500,
      creditoFiscal: 500,
      saldoTecnicoAnterior: 0,
    });

    expect(result.saldoTecnico).toBe(0);
    expect(result.resultado).toBe("A_FAVOR");
    expect(result.saldoAFavorProximoPeriodo).toBe(0);
  });

  it("arrastre de saldo a favor del periodo anterior reduce lo que hay que pagar", () => {
    const result = calcularSaldoTecnico({
      debitoFiscal: 1000,
      creditoFiscal: 400,
      saldoTecnicoAnterior: 300,
    });

    // 1000 - 400 - 300 = 300 a pagar
    expect(result.saldoTecnico).toBe(300);
    expect(result.resultado).toBe("A_PAGAR");
    expect(result.saldoAFavorProximoPeriodo).toBe(0);
  });

  it("el arrastre puede ser mayor al saldo tecnico del periodo y seguir a favor", () => {
    const result = calcularSaldoTecnico({
      debitoFiscal: 1000,
      creditoFiscal: 400,
      saldoTecnicoAnterior: 900,
    });

    // 1000 - 400 - 900 = -300 -> a favor, se arrastra 300 al siguiente periodo
    expect(result.saldoTecnico).toBe(-300);
    expect(result.resultado).toBe("A_FAVOR");
    expect(result.saldoAFavorProximoPeriodo).toBe(300);
  });

  it("redondea a 2 decimales evitando errores de punto flotante", () => {
    const result = calcularSaldoTecnico({
      debitoFiscal: 100.1,
      creditoFiscal: 33.33,
      saldoTecnicoAnterior: 0.01,
    });

    expect(result.saldoTecnico).toBe(66.76);
  });
});
