import prisma from "../prisma";
import { FinanceType, Prisma } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { AppError } from "../utils/asyncHandler";
import { LEGACY_CATEGORY_ACCOUNTS } from "../utils/legacyFinanceCategories";

type TxClient = Prisma.TransactionClient | typeof prisma;

export const financeAccountService = {
  // Por default solo trae cuentas activas (lo que necesita el selector del
  // formulario de carga de Finance). includeInactive=true es para la propia
  // pantalla de gestion del plan de cuentas, que necesita mostrar tambien las
  // desactivadas.
  async getAll(opts?: { includeInactive?: boolean; type?: FinanceType }) {
    return prisma.financeAccount.findMany({
      where: {
        ...tenantScope(),
        ...(opts?.includeInactive ? {} : { isActive: true }),
        ...(opts?.type ? { type: opts.type } : {}),
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  },

  async create(data: { name: string; type: FinanceType }) {
    const name = data.name?.trim();
    if (!name) {
      throw new AppError("FINANCE_ACCOUNT_NAME_REQUIRED", "El nombre de la cuenta es obligatorio", 400);
    }
    if (data.type !== "INGRESO" && data.type !== "EGRESO") {
      throw new AppError("FINANCE_ACCOUNT_TYPE_INVALID", "El tipo debe ser INGRESO o EGRESO", 400);
    }

    const tenantId = currentTenantId();
    const dup = await prisma.financeAccount.findFirst({
      where: { name, type: data.type, ...tenantScope() },
    });
    if (dup) {
      throw new AppError("FINANCE_ACCOUNT_DUPLICATE", "Ya existe una cuenta con ese nombre y tipo", 409);
    }

    return prisma.financeAccount.create({
      data: { name, type: data.type, tenantId, isSystem: false, isActive: true },
    });
  },

  async update(id: string, data: { name?: string; type?: FinanceType; isActive?: boolean }) {
    const existing = await prisma.financeAccount.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new AppError("FINANCE_ACCOUNT_NOT_FOUND", "Cuenta no encontrada", 404);

    const cleanData: Prisma.FinanceAccountUpdateInput = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new AppError("FINANCE_ACCOUNT_NAME_REQUIRED", "El nombre de la cuenta es obligatorio", 400);
      cleanData.name = name;
    }
    if (data.type !== undefined) {
      if (data.type !== "INGRESO" && data.type !== "EGRESO") {
        throw new AppError("FINANCE_ACCOUNT_TYPE_INVALID", "El tipo debe ser INGRESO o EGRESO", 400);
      }
      cleanData.type = data.type;
    }
    if (data.isActive !== undefined) cleanData.isActive = data.isActive;

    return prisma.financeAccount.update({ where: { id }, data: cleanData });
  },

  // No hay borrado fisico para una cuenta que ya tiene movimientos: se
  // desactiva (isActive=false) en vez de eliminarse, para no perder
  // trazabilidad de los Finance historicos que la referencian. Una cuenta
  // sin movimientos asociados si se borra fisicamente (por ejemplo, si se
  // creo por error y todavia no se uso).
  async remove(id: string) {
    const existing = await prisma.financeAccount.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new AppError("FINANCE_ACCOUNT_NOT_FOUND", "Cuenta no encontrada", 404);

    const inUse = await prisma.finance.count({ where: { financeAccountId: id } });
    if (inUse > 0) {
      return prisma.financeAccount.update({ where: { id }, data: { isActive: false } });
    }

    return prisma.financeAccount.delete({ where: { id } });
  },

  // Siembra el plan de cuentas default (una FinanceAccount isSystem=true por
  // cada categoria legacy, ver utils/legacyFinanceCategories.ts) para un
  // tenant que todavia no tiene ninguna cuenta propia. Pensado para tenants
  // nuevos (createTenant.ts, trialSignup.service.ts) -- los tenants que ya
  // existian al momento de la migracion 20260826200000_add_finance_account
  // ya la tienen sembrada por esa migracion SQL, asi que el chequeo de
  // "existing > 0" tambien los deja sin tocar si esto se llegara a invocar
  // de nuevo sobre ellos.
  async seedDefaultAccountsForTenant(tenantId: string, tx: TxClient = prisma) {
    const existing = await tx.financeAccount.count({ where: { tenantId } });
    if (existing > 0) return;

    await tx.financeAccount.createMany({
      data: LEGACY_CATEGORY_ACCOUNTS.map((c) => ({
        tenantId,
        name: c.label,
        type: c.type,
        isSystem: true,
        isActive: true,
      })),
    });
  },
};
