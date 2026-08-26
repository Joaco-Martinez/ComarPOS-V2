import { buildProfitAndLoss, type ProfitAndLossInput } from "../profitAndLoss.service";

function input(overrides: Partial<ProfitAndLossInput> = {}): ProfitAndLossInput {
  return {
    revenue: 0,
    cogs: 0,
    expensesByCategory: [],
    otherIncomeByCategory: [],
    ...overrides,
  };
}

describe("buildProfitAndLoss", () => {
  it("calcula utilidad bruta y resultado neto con el caso feliz", () => {
    const result = buildProfitAndLoss(
      input({
        revenue: 100000,
        cogs: 60000,
        expensesByCategory: [
          { category: "AlquilerL1", amount: 15000 },
          { category: "Sueldos", amount: 10000 },
        ],
        otherIncomeByCategory: [{ category: "Otro", amount: 2000 }],
      })
    );

    expect(result.revenue).toBe(100000);
    expect(result.cogs).toBe(60000);
    expect(result.grossProfit).toBe(40000);
    expect(result.grossMarginPercent).toBe(40);
    expect(result.operatingExpenses).toBe(25000);
    expect(result.otherIncome).toBe(2000);
    // netProfit = grossProfit + otherIncome - operatingExpenses
    expect(result.netProfit).toBe(40000 + 2000 - 25000);
    expect(result.netProfit).toBe(17000);
  });

  it("agrupa y ordena expensesByCategory de mayor a menor, con abs() de montos negativos", () => {
    const result = buildProfitAndLoss(
      input({
        revenue: 10000,
        cogs: 4000,
        expensesByCategory: [
          { category: "Impuestos", amount: -500 }, // Finance a veces guarda EGRESO en negativo
          { category: "Sueldos", amount: 3000 },
        ],
      })
    );

    expect(result.expensesByCategory).toEqual([
      { category: "Sueldos", amount: 3000, percentOfRevenue: 30 },
      { category: "Impuestos", amount: 500, percentOfRevenue: 5 },
    ]);
    expect(result.operatingExpenses).toBe(3500);
  });

  it("no divide por cero cuando no hay ingresos (revenue = 0)", () => {
    const result = buildProfitAndLoss(
      input({
        revenue: 0,
        cogs: 0,
        expensesByCategory: [{ category: "Otro", amount: 100 }],
      })
    );

    expect(result.grossMarginPercent).toBe(0);
    expect(result.netMarginPercent).toBe(0);
    expect(result.netProfit).toBe(-100);
  });

  it("un período sin gastos ni otros ingresos deja utilidad neta igual a la bruta", () => {
    const result = buildProfitAndLoss(input({ revenue: 5000, cogs: 3000 }));

    expect(result.grossProfit).toBe(2000);
    expect(result.otherIncome).toBe(0);
    expect(result.operatingExpenses).toBe(0);
    expect(result.netProfit).toBe(2000);
  });

  it("redondea a 2 decimales evitando errores de punto flotante", () => {
    const result = buildProfitAndLoss(
      input({
        revenue: 100.1,
        cogs: 33.33,
        expensesByCategory: [{ category: "Otro", amount: 0.1 + 0.2 }],
      })
    );

    expect(result.cogs).toBe(33.33);
    expect(result.grossProfit).toBe(66.77);
    expect(result.operatingExpenses).toBe(0.3);
  });
});
