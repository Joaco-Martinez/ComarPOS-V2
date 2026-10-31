// Precio de la tienda online con lista de precios (link ?lista=<id> o lista
// del cliente). Se mockea prisma: resolvePrice es pura y
// resolveStorefrontPriceList hace una sola query.
jest.mock("../../prisma", () => ({
  __esModule: true,
  default: { priceList: { findFirst: jest.fn() } },
}));
jest.mock("../sale.service", () => ({ saleService: {} }));
jest.mock("../whatsapp.service", () => ({ whatsappService: {} }));

import prisma from "../../prisma";
import { resolvePrice, resolveStorefrontPriceList } from "../catalog.service";

const findFirst = (prisma as any).priceList.findFirst as jest.Mock;

const unitProduct = { saleUnit: "UNIT", price: 1000, wholesalePrice: 800, pricePerKg: null, wholesalePricePerKg: null };
const kgProduct = { saleUnit: "KG", price: 0, wholesalePrice: 0, pricePerKg: 5000, wholesalePricePerKg: 4000 };

describe("resolvePrice con lista de precios", () => {
  it("sin lista usa el precio minorista", () => {
    expect(resolvePrice(unitProduct, "Price" as any).price).toBe(1000);
  });

  it("la lista pisa el precio minorista (UNIT)", () => {
    expect(resolvePrice(unitProduct, "Price" as any, { price: 750, pricePerKg: null }).price).toBe(750);
  });

  it("la lista pisa el precio por kg (KG)", () => {
    expect(resolvePrice(kgProduct, "Price" as any, { price: 0, pricePerKg: 4500 }).price).toBe(4500);
  });

  it("un producto sin precio en la lista sigue con el minorista", () => {
    expect(resolvePrice(unitProduct, "Price" as any, null).price).toBe(1000);
    expect(resolvePrice(kgProduct, "Price" as any, { price: 10, pricePerKg: null }).price).toBe(5000);
  });

  it("cliente Mayorista sigue con el precio mayorista (la lista solo pisa el minorista)", () => {
    expect(resolvePrice(unitProduct, "Mayorista" as any, { price: 750, pricePerKg: null }).price).toBe(800);
  });
});

describe("resolveStorefrontPriceList", () => {
  beforeEach(() => findFirst.mockReset());

  it("devuelve la lista del link si es valida", async () => {
    findFirst.mockResolvedValueOnce({ id: "L1", name: "Mayorista", isDefault: false });
    await expect(resolveStorefrontPriceList("L1", "L2")).resolves.toEqual({ id: "L1", name: "Mayorista" });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("si la del link no existe, usa la del cliente", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "L2", name: "Revendedor", isDefault: false });
    await expect(resolveStorefrontPriceList("nope", "L2")).resolves.toEqual({ id: "L2", name: "Revendedor" });
  });

  it("la lista principal (Minorista) no aplica override", async () => {
    findFirst.mockResolvedValueOnce({ id: "D", name: "Minorista", isDefault: true });
    await expect(resolveStorefrontPriceList("D")).resolves.toBeNull();
  });

  it("sin ids no consulta la base", async () => {
    await expect(resolveStorefrontPriceList(undefined, null)).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
