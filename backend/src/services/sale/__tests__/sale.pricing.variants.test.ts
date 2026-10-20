// resolveSaleItems hace una sola query (prisma.product.findMany); se mockea el
// cliente para testear el rechazo de padres de variantes sin tocar la DB.
jest.mock("../../../prisma", () => ({
  __esModule: true,
  default: { product: { findMany: jest.fn() } },
}));

import prisma from "../../../prisma";
import { resolveSaleItems } from "../sale.pricing";

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
    hasVariants: false,
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

describe("resolveSaleItems con variantes", () => {
  it("pide hasVariants en la query", async () => {
    findMany.mockResolvedValue([dbProduct()]);
    await resolveSaleItems([{ productId: "p1", quantity: 1 }] as any, null as any);
    expect(findMany.mock.calls[0][0].select.hasVariants).toBe(true);
  });

  it("rechaza el padre de un producto con variantes", async () => {
    findMany.mockResolvedValue([dbProduct({ id: "parent", name: "Remera", hasVariants: true, sku: null })]);
    await expect(
      resolveSaleItems([{ productId: "parent", quantity: 1 }] as any, null as any)
    ).rejects.toThrow("Elegí una variante de Remera");
  });

  it("vende la variante con su nombre completo como snapshot", async () => {
    findMany.mockResolvedValue([
      dbProduct({ id: "v1", name: "Remera - M / Rojo", sku: "REM-M-ROJO", price: 1200 }),
    ]);
    const [item] = await resolveSaleItems([{ productId: "v1", quantity: 2 }] as any, null as any);
    expect(item.productName).toBe("Remera - M / Rojo");
    expect(item.productSku).toBe("REM-M-ROJO");
    expect(item.subtotal).toBe(2400);
  });
});
