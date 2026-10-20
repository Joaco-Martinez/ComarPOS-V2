import { parseGroupBy, groupKeyFor, displayProductFor, sumByGroup } from "../variantGrouping";

const parent = { id: "remera", name: "Remera", sku: "REM" };
const m = { id: "v-m", name: "Remera - M", sku: "REM-M", parentId: "remera", variantLabel: "M", parent };
const l = { id: "v-l", name: "Remera - L", sku: "REM-L", parentId: "remera", variantLabel: "L", parent };
const pan = { id: "pan", name: "Pan", sku: "PAN", parentId: null, parent: null };

const items = [
  { product: m, revenue: 1000, profit: 400, qty: 1 },
  { product: l, revenue: 2400, profit: 900, qty: 2 },
  { product: m, revenue: 1000, profit: 400, qty: 1 },
  { product: pan, revenue: 500, profit: 100, qty: 5 },
];

describe("variantGrouping", () => {
  it("parsea el modo (default: por variante)", () => {
    expect(parseGroupBy("product")).toBe("product");
    expect(parseGroupBy(undefined)).toBe("variant");
    expect(parseGroupBy("cualquiera")).toBe("variant");
  });

  it("agrupa por parentId, o por el propio id si no tiene padre", () => {
    expect(groupKeyFor(m, "product")).toBe("remera");
    expect(groupKeyFor(m, "variant")).toBe("v-m");
    expect(groupKeyFor(pan, "product")).toBe("pan");
  });

  it("muestra el padre en modo producto y padre + variante en modo variante", () => {
    expect(displayProductFor(m, "product")).toMatchObject({ id: "remera", name: "Remera", sku: "REM", variantLabel: null });
    expect(displayProductFor(m, "variant")).toMatchObject({ id: "v-m", name: "Remera - M", parentName: "Remera", variantLabel: "M" });
  });

  it("agrupado por producto suma cantidades, ingresos y ganancia de todas las variantes", () => {
    const rows = sumByGroup(items, (i) => i.product, (i) => ({ revenue: i.revenue, profit: i.profit, qty: i.qty }), "product");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ product: { name: "Remera" }, values: { revenue: 4400, profit: 1700, qty: 4 } });
    expect(rows[1]).toMatchObject({ product: { name: "Pan" }, values: { revenue: 500, profit: 100, qty: 5 } });
  });

  it("por variante deja una fila por variante", () => {
    const rows = sumByGroup(items, (i) => i.product, (i) => ({ qty: i.qty }), "variant");
    expect(rows.map((r) => [r.product.name, r.values.qty])).toEqual([
      ["Remera - M", 2],
      ["Remera - L", 2],
      ["Pan", 5],
    ]);
  });
});
