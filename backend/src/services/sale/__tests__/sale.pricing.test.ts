// resolveSaleItems hace una sola query (prisma.product.findMany); se mockea el
// cliente para testear el armado de items sin tocar la DB.
jest.mock("../../../prisma", () => ({
  __esModule: true,
  default: { product: { findMany: jest.fn() } },
}));

import prisma from "../../../prisma";
import { round2, isDeliverySaleItem, shouldDiscountStock, resolveSaleItems } from "../sale.pricing";
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
    expect(isDeliverySaleItem(item({ productSku: "ENVIOFLETE2" }))).toBe(true);
    // Snapshot de ventas viejas, de antes de que los SKUs quedaran sin guiones.
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
    expect(shouldDiscountStock(item({ productSku: "ENVIOFLETE2", isService: false }))).toBe(false);
  });

  it("un producto marcado sin stock (unlimitedStock) no descuenta stock", () => {
    expect(shouldDiscountStock(item({ unlimitedStock: true }))).toBe(false);
  });
});

describe("resolveSaleItems", () => {
  const findMany = prisma.product.findMany as unknown as jest.Mock;

  function dbProduct(overrides: Record<string, unknown> = {}) {
    return {
      id: "p1",
      name: "Producto",
      sku: "SKU-1",
      type: "SIMPLE",
      saleUnit: "UNIT",
      isService: false,
      unlimitedStock: false,
      ivaRate: 21,
      price: 100,
      pricePerKg: null,
      purchasePrice: 50,
      clientPrice: null,
      wholesalePrice: null,
      clientPricePerKg: null,
      wholesalePricePerKg: null,
      components: [],
      ...overrides,
    };
  }

  it("pide ivaRate en el select de la query", async () => {
    findMany.mockResolvedValue([dbProduct()]);
    await resolveSaleItems([{ productId: "p1", quantity: 1 }] as any, null as any);
    expect(findMany.mock.calls[0][0].select.ivaRate).toBe(true);
  });

  it("guarda el IVA real del producto (10,5% y 27%), no siempre 21%", async () => {
    findMany.mockResolvedValue([
      dbProduct({ id: "p105", ivaRate: 10.5 }),
      dbProduct({ id: "p27", ivaRate: 27 }),
      dbProduct({ id: "p0", ivaRate: 0 }),
    ]);

    const items = await resolveSaleItems(
      [
        { productId: "p105", quantity: 1 },
        { productId: "p27", quantity: 2 },
        { productId: "p0", quantity: 1 },
      ] as any,
      null as any
    );

    expect(items.map((i) => i.ivaRate)).toEqual([10.5, 27, 0]);
  });
});
