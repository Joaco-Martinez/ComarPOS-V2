import { pickFields } from "../pickFields";
import { assertLocalDatabase } from "../assertLocalDatabase";

describe("pickFields", () => {
  it("descarta claves no permitidas (ej. tenantId mandado en el body)", () => {
    const body: any = { name: "Prov", tenantId: "otro-tenant", id: "x" };
    expect(pickFields(body, ["name"] as const)).toEqual({ name: "Prov" });
  });

  it("no copia claves undefined", () => {
    expect(pickFields({ name: undefined, cuit: "1" } as any, ["name", "cuit"] as const)).toEqual({ cuit: "1" });
  });
});

describe("assertLocalDatabase", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("deja pasar una base local", () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    expect(() => assertLocalDatabase("test")).not.toThrow();
  });

  it("bloquea una base remota", () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://u:p@tokaido.proxy.rlwy.net:5432/db";
    expect(() => assertLocalDatabase("test")).toThrow(/bloqueado/);
  });

  it("bloquea en produccion aunque el host sea local", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    expect(() => assertLocalDatabase("test")).toThrow(/bloqueado/);
  });

  it("se puede forzar a proposito", () => {
    process.env.DATABASE_URL = "postgresql://u:p@tokaido.proxy.rlwy.net:5432/db";
    process.env.ALLOW_REMOTE_DB_DESTRUCTIVE = "true";
    expect(() => assertLocalDatabase("test")).not.toThrow();
  });
});
