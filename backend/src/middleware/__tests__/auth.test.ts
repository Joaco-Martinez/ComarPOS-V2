// Unit tests del authMiddleware: Prisma y el contexto de tenant mockeados,
// no tocan la DB.
process.env.JWT_SECRET = "x".repeat(64);

const findUnique = jest.fn();
jest.mock("../../prisma", () => ({
  __esModule: true,
  default: { user: { findUnique: (...args: any[]) => findUnique(...args), update: jest.fn(() => Promise.resolve()) } },
}));
jest.mock("../tenant", () => ({
  resolveTenantById: jest.fn(async () => null),
  isSuspensionExempt: () => true,
  getTenantBlock: () => null,
}));
jest.mock("../../services/tenantAccess.service", () => ({ resolveTenantAccessCached: jest.fn() }));

import jwt from "jsonwebtoken";
import { authMiddleware, invalidateUserState } from "../auth";

function run(url: string, payload: object) {
  const token = jwt.sign(payload, process.env.JWT_SECRET as string);
  const req: any = { originalUrl: url, cookies: { token }, headers: {} };
  return new Promise<{ status?: number; nextCalled: boolean; req: any }>((resolve) => {
    const res: any = {
      status(code: number) {
        return { json: () => resolve({ status: code, nextCalled: false, req }) };
      },
    };
    authMiddleware(req, res, () => resolve({ nextCalled: true, req }));
  });
}

beforeEach(() => {
  invalidateUserState();
  findUnique.mockReset();
});

describe("authMiddleware", () => {
  it("un CLIENTE no puede usar rutas internas del negocio", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "CLIENTE" });
    const r = await run("/sales", { userId: "u1", role: "CLIENTE", tenantId: "t1" });
    expect(r.status).toBe(403);
  });

  it("un CLIENTE sigue pudiendo usar el portal (/auth, /catalog, /tienda)", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "CLIENTE" });
    for (const url of ["/auth/me", "/catalog/checkout-whatsapp", "/tienda/mi-negocio/orders"]) {
      invalidateUserState();
      const r = await run(url, { userId: "u1", role: "CLIENTE", tenantId: "t1" });
      expect(r.nextCalled).toBe(true);
    }
  });

  it("un CLIENTE no puede entrar a /tienda-online (panel de admin)", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "CLIENTE" });
    const r = await run("/tienda-online/config", { userId: "u1", role: "CLIENTE", tenantId: "t1" });
    expect(r.status).toBe(403);
  });

  it("rechaza el token de un usuario desactivado", async () => {
    findUnique.mockResolvedValue({ isActive: false, role: "ADMIN" });
    const r = await run("/sales", { userId: "u1", role: "ADMIN", tenantId: "t1" });
    expect(r.status).toBe(401);
  });

  it("rechaza el token de un usuario borrado", async () => {
    findUnique.mockResolvedValue(null);
    const r = await run("/sales", { userId: "u1", role: "ADMIN", tenantId: "t1" });
    expect(r.status).toBe(401);
  });

  it("usa el rol actual de la DB, no el del token", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "EMPLEADO" });
    const r = await run("/sales", { userId: "u1", role: "ADMIN", tenantId: "t1" });
    expect(r.nextCalled).toBe(true);
    expect(r.req.user.role).toBe("EMPLEADO");
  });

  it("un token de plataforma (sin userId) no sirve como sesion de negocio", async () => {
    const r = await run("/sales", { platformAdminId: "p1", type: "platform" });
    expect(r.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
