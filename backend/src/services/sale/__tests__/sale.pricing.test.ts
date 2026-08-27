import { round2, isDeliverySaleItem, shouldDiscountStock } from "../sale.pricing";
import type { ResolvedSaleItem } from "../sale.types";

function item(overrides: Partial<ResolvedSaleItem> = {}): ResolvedSaleItem {
  return {
    productId: "p1",
    productName: "Producto",
    productSku: null,
    productType: "SIMPLE" as any,
    saleUnit: "UNIT" as any,
    isService: false,
    quantity: 1,
    quantityKg: null,
    price: 100,
    ivaRate: 21,
    priceType: "PRICE" as any,
    subtotal: 100,
    purchasePriceSnapshot: 0,
    costTotal: 0,
    profit: 100,
    components: [],
    ...overrides,
  } as ResolvedSaleItem;
}

describe("round2", () => {
  it("redondea a 2 decimales evitando errores de punto flotante", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(10.1 + 0.2)).toBe(10.3);
    expect(round2(100)).toBe(100);
  });
});

describe("isDeliverySaleItem", () => {
  it("reconoce el SKU de envio sin importar mayusculas/acentos", () => {
    expect(isDeliverySaleItem(item({ productSku: "ENVIO-FLETE2" }))).toBe(true);
    expect(isDeliverySaleItem(item({ productSku: "envio-flete2" }))).toBe(true);
  });

  it("un producto normal no es de envio", () => {
    expect(isDeliverySaleItem(item({ productSku: "PAN-001" }))).toBe(false);
    expect(isDeliverySaleItem(item({ productSku: null }))).toBe(false);
  });
});

describe("shouldDiscountStock", () => {
  it("un producto normal si descuenta stock", () => {
    expect(shouldDiscountStock(item())).toBe(true);
  });

  it("un servicio no descuenta stock", () => {
    expect(shouldDiscountStock(item({ isService: true }))).toBe(false);
  });

  it("el item de envio no descuenta stock aunque no sea isService", () => {
    expect(shouldDiscountStock(item({ productSku: "ENVIO-FLETE2", isService: false }))).toBe(false);
  });

  it("un producto marcado sin stock (unlimitedStock) no descuenta stock", () => {
    expect(shouldDiscountStock(item({ unlimitedStock: true }))).toBe(false);
  });
});
