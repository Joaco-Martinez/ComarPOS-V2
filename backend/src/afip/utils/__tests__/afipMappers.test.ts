import { normalizarDocumento, detectarTipoDocumento, mapProductsFromSaleOrBody } from "../afipMappers";

describe("normalizarDocumento", () => {
  it("saca todo lo que no sea digito", () => {
    expect(normalizarDocumento("20-11111111-2")).toBe("20111111112");
    expect(normalizarDocumento("30.111.111.2")).toBe("301111112");
  });

  it("valores nulos/undefined dan string vacio", () => {
    expect(normalizarDocumento(null)).toBe("");
    expect(normalizarDocumento(undefined)).toBe("");
  });
});

describe("detectarTipoDocumento", () => {
  it("detecta CUIT valido (empieza con 30)", () => {
    const doc = detectarTipoDocumento("30-71111111-8");
    expect(doc).not.toBeNull();
    expect(doc?.tipoDoc).toBe(80);
    expect(doc?.label).toBe("CUIT");
  });

  it("detecta CUIL valido (persona fisica, empieza con 20)", () => {
    const doc = detectarTipoDocumento("20111111112");
    expect(doc).not.toBeNull();
    expect(doc?.tipoDoc).toBe(80);
    expect(doc?.label).toBe("CUIL");
  });

  it("detecta DNI (7-8 digitos)", () => {
    const doc = detectarTipoDocumento("30111222");
    expect(doc).not.toBeNull();
    expect(doc?.label).toBe("DNI");
  });

  it("documento vacio o sin digitos devuelve null", () => {
    expect(detectarTipoDocumento("")).toBeNull();
    expect(detectarTipoDocumento("abc")).toBeNull();
    expect(detectarTipoDocumento(null)).toBeNull();
  });

  it("numeros que no matchean CUIT/CUIL/DNI caen al fallback CUIT", () => {
    const doc = detectarTipoDocumento("123");
    expect(doc).toEqual({ tipoDoc: 80, nroDoc: 123, label: "CUIT" });
  });
});

describe("mapProductsFromSaleOrBody", () => {
  it("usa el nombre guardado en la venta (con la variante) antes que el nombre actual del producto", () => {
    const sale = {
      items: [
        { productNameSnapshot: "Remera - M / Rojo", product: { name: "Remera - M / Rojo (renombrada)" }, quantity: 2, price: 1000 },
        { product: { name: "Pan" }, quantity: 1, price: 500 },
      ],
    };
    const result = mapProductsFromSaleOrBody({}, sale);
    expect(result.map((r) => r.descripcion)).toEqual(["Remera - M / Rojo", "Pan"]);
    expect(result[0].subtotal).toBe(2000);
  });
});
