import {
  normalizeVariantOptions,
  buildCombinations,
  buildVariantLabel,
  buildVariantName,
  buildVariantSku,
  abbreviateValue,
  uniqueSku,
  remapAttributes,
  diffVariants,
  variantSyncData,
  pricesDifferFromParent,
  costDiffersFromParent,
  priceRange,
  MAX_VARIANT_COMBINATIONS,
} from "../product.variants.helpers";

const talleColor = [
  { name: "Talle", values: ["S", "M", "L"] },
  { name: "Color", values: ["Rojo", "Negro"] },
];

describe("normalizeVariantOptions", () => {
  it("limpia espacios, saca valores vacios y repetidos (sin importar mayusculas)", () => {
    expect(
      normalizeVariantOptions([{ name: "  Talle ", values: ["S", " m ", "", "M", "s"] }])
    ).toEqual([{ name: "Talle", values: ["S", "m"] }]);
  });

  it("acepta el JSON string que llega por FormData", () => {
    expect(normalizeVariantOptions(JSON.stringify(talleColor))).toEqual(talleColor);
  });

  it("rechaza sin opciones, sin nombre, sin valores u opciones repetidas", () => {
    expect(() => normalizeVariantOptions([])).toThrow(/al menos una opción/);
    expect(() => normalizeVariantOptions([{ name: "", values: ["S"] }])).toThrow(/nombre/);
    expect(() => normalizeVariantOptions([{ name: "Talle", values: [" "] }])).toThrow(/al menos un valor/);
    expect(() =>
      normalizeVariantOptions([
        { name: "Talle", values: ["S"] },
        { name: "talle", values: ["M"] },
      ])
    ).toThrow(/repetida/);
    expect(() => normalizeVariantOptions("no-json")).toThrow(/formato/);
  });

  it("rechaza si las combinaciones superan el maximo", () => {
    const values = Array.from({ length: 15 }, (_, i) => `V${i}`);
    expect(() =>
      normalizeVariantOptions([
        { name: "A", values },
        { name: "B", values },
      ])
    ).toThrow(String(MAX_VARIANT_COMBINATIONS));
  });
});

describe("buildCombinations", () => {
  it("arma el producto cartesiano en el orden de las opciones", () => {
    const combos = buildCombinations(talleColor);
    expect(combos).toHaveLength(6);
    expect(combos[0]).toEqual({ Talle: "S", Color: "Rojo" });
    expect(combos[5]).toEqual({ Talle: "L", Color: "Negro" });
  });
});

describe("label, nombre y SKU", () => {
  it("arma el label y el nombre de la variante", () => {
    const label = buildVariantLabel({ Color: "Rojo", Talle: "M" }, talleColor);
    expect(label).toBe("M / Rojo");
    expect(buildVariantName(" Remera  lisa ", label)).toBe("Remera lisa - M / Rojo");
  });

  it("abrevia los valores para el SKU", () => {
    expect(abbreviateValue("XL")).toBe("XL");
    expect(abbreviateValue("Rojo")).toBe("ROJO");
    expect(abbreviateValue("Negro")).toBe("NEG");
    expect(abbreviateValue("Molienda fina")).toBe("MOL");
    expect(abbreviateValue("Café")).toBe("CAFE");
    expect(abbreviateValue("  ")).toBe("X");
  });

  it("arma el SKU desde el SKU del padre, o null si el padre no tiene", () => {
    expect(buildVariantSku("REM", { Talle: "M", Color: "Negro" }, talleColor)).toBe("REMMNEG");
    expect(buildVariantSku(null, { Talle: "M" }, talleColor)).toBeNull();
  });

  it("evita SKUs repetidos agregando un sufijo", () => {
    const taken = new Set(["REMMNEG"]);
    expect(uniqueSku("REMMNEG", taken)).toBe("REMMNEG2");
    expect(uniqueSku("REMMNEG", taken)).toBe("REMMNEG3");
  });
});

describe("remapAttributes / diffVariants", () => {
  it("mantiene el valor si se renombra una opcion", () => {
    const next = [{ name: "Tamaño", values: ["S", "M"] }];
    expect(remapAttributes({ Talle: "m" }, [{ name: "Talle", values: ["S", "M"] }], next)).toEqual({ Tamaño: "M" });
  });

  it("agregar un valor crea las combinaciones faltantes y quitar uno marca las que sobran", () => {
    const existing = buildCombinations(talleColor).map((attrs, i) => ({ id: `v${i}`, variantAttributes: attrs }));

    const added = diffVariants(existing, talleColor, [
      { name: "Talle", values: ["S", "M", "L", "XL"] },
      talleColor[1],
    ]);
    expect(added.keep).toHaveLength(6);
    expect(added.remove).toHaveLength(0);
    expect(added.create).toEqual([
      { Talle: "XL", Color: "Rojo" },
      { Talle: "XL", Color: "Negro" },
    ]);

    const removed = diffVariants(existing, talleColor, [{ name: "Talle", values: ["S", "M"] }, talleColor[1]]);
    expect(removed.remove.map((v) => v.variantAttributes)).toEqual([
      { Talle: "L", Color: "Rojo" },
      { Talle: "L", Color: "Negro" },
    ]);
    expect(removed.create).toHaveLength(0);
  });
});

describe("propagacion de precio con customPrice/customCost", () => {
  const parent = {
    name: "Remera",
    description: "Algodón",
    categoryId: "cat1",
    supplierId: "sup1",
    ivaRate: 10.5,
    saleUnit: "UNIT",
    isService: false,
    unlimitedStock: false,
    price: 1000,
    clientPrice: 1000,
    wholesalePrice: 900,
    pricePerKg: null,
    clientPricePerKg: null,
    wholesalePricePerKg: null,
    purchasePrice: 500,
  };

  it("una variante sin personalizar copia precio y costo del padre", () => {
    const data = variantSyncData(parent, { variantLabel: "M / Rojo", customPrice: false, customCost: false });
    expect(data).toMatchObject({
      name: "Remera - M / Rojo",
      price: 1000,
      wholesalePrice: 900,
      purchasePrice: 500,
      ivaRate: 10.5,
      categoryId: "cat1",
    });
  });

  it("una variante con precio/costo propio no se pisa, pero si hereda lo demas", () => {
    const data = variantSyncData(parent, { variantLabel: "XL", customPrice: true, customCost: true });
    expect(data).not.toHaveProperty("price");
    expect(data).not.toHaveProperty("purchasePrice");
    expect(data).toMatchObject({ name: "Remera - XL", ivaRate: 10.5, supplierId: "sup1" });
  });

  it("detecta si el precio o el costo difieren del padre", () => {
    expect(pricesDifferFromParent(parent, { price: 1000 })).toBe(false);
    expect(pricesDifferFromParent(parent, { price: 1200 })).toBe(true);
    expect(pricesDifferFromParent(parent, { wholesalePrice: 900.001 })).toBe(false);
    expect(costDiffersFromParent(parent, 500)).toBe(false);
    expect(costDiffersFromParent(parent, 550)).toBe(true);
    expect(costDiffersFromParent(parent, undefined)).toBe(false);
  });

  it("calcula el rango de precios", () => {
    expect(priceRange([1000, 1200, null, 900])).toEqual({ min: 900, max: 1200 });
    expect(priceRange([])).toBeNull();
  });
});
