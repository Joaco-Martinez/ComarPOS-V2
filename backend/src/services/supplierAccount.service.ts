import prisma from "../prisma";
import { PaymentMethod, SupplierAccountMovementType, CategoryFinance, FinanceType } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { ProveedorNoEncontradoError, AppError } from "../utils/asyncHandler";

/**
 * Cuenta corriente de PROVEEDORES -- espejo de account.service.ts (cuenta
 * corriente de clientes), ver ese archivo para el patron original. La
 * diferencia principal es el sentido de la deuda: aca positivo = nosotros le
 * debemos plata al proveedor (en Client.currentBalance positivo = el
 * cliente nos debe a nosotros). No hay creditLimit/isAccountEnabled: la
 * cuenta de proveedor no es un "fiado" que se habilita, la deuda nace sola
 * de las compras (ver hook en purchase.service.ts).
 */

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function assertPositiveAmount(amount: number) {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError("MONTO_INVALIDO", "El monto debe ser mayor a 0", 400);
  }

  return round2(value);
}

/**
 * Funciones puras previousBalance -> newBalance por tipo de movimiento
 * (testeadas en __tests__/supplierAccount.test.ts sin tocar la DB, mismo
 * criterio que sale.pricing.ts / backend/CLAUDE.md).
 */
export function computeCompraBalance(previousBalance: number, amount: number) {
  const previous = round2(previousBalance);
  return { previousBalance: previous, newBalance: round2(previous + amount) };
}

export function computePagoBalance(previousBalance: number, amount: number) {
  // Clampeado a 0: si se registra un pago mayor a la deuda actual, el saldo
  // queda en 0 (no pasa a negativo/"a favor nuestro"). A diferencia de
  // Client.creditAccount (que si permite negativo para representar saldo a
  // favor del cliente), aca no existe hoy un concepto de "el proveedor nos
  // debe a nosotros", asi que un pago de mas simplemente satura en 0.
  const previous = round2(previousBalance);
  return { previousBalance: previous, newBalance: round2(Math.max(previous - amount, 0)) };
}

export function computeAjusteBalance(
  previousBalance: number,
  amount: number,
  direction: "POSITIVE" | "NEGATIVE"
) {
  const previous = round2(previousBalance);
  const newBalance =
    direction === "POSITIVE"
      ? round2(previous + amount)
      : round2(Math.max(previous - amount, 0));
  return { previousBalance: previous, newBalance };
}

/**
 * Version "tx" de addDebt, pensada para ser llamada DENTRO de la misma
 * transaccion que crea/completa la Purchase (ver purchase.service.ts#create)
 * en vez de abrir una transaccion propia. No valida tenantScope contra la
 * request (el caller ya esta operando sobre una Purchase de este tenant);
 * si necesitas validar un supplierId "suelto" desde afuera de una compra,
 * usa `addDebt` en su lugar.
 */
export async function addSupplierDebtTx(
  tx: any,
  data: {
    supplierId: string;
    amount: number;
    purchaseId?: string | null;
    userId?: string | null;
    description?: string | null;
    reference?: string | null;
  }
) {
  const amount = assertPositiveAmount(data.amount);

  const supplier = await tx.supplier.findFirst({
    where: { id: data.supplierId, ...tenantScope() },
    select: { id: true, currentBalance: true },
  });

  if (!supplier) {
    throw new ProveedorNoEncontradoError();
  }

  // Idempotencia: si ya existe un movimiento COMPRA para esta Purchase (ej.
  // reintento del hook, doble-click, etc.), no duplicar la deuda.
  if (data.purchaseId) {
    const existing = await tx.supplierAccountMovement.findFirst({
      where: { purchaseId: data.purchaseId, type: SupplierAccountMovementType.COMPRA },
      select: { id: true },
    });
    if (existing) return null;
  }

  const { previousBalance, newBalance } = computeCompraBalance(supplier.currentBalance, amount);

  await tx.supplier.update({
    where: { id: data.supplierId },
    data: { currentBalance: newBalance },
  });

  return tx.supplierAccountMovement.create({
    data: {
      supplierId: data.supplierId,
      purchaseId: data.purchaseId ?? null,
      userId: data.userId ?? null,
      type: SupplierAccountMovementType.COMPRA,
      amount,
      previousBalance,
      newBalance,
      paymentMethod: null,
      reference: data.reference ?? null,
      description: data.description ?? "Deuda generada por compra",
    },
  });
}

/**
 * Reversa (parcial o total) la deuda COMPRA que una Purchase genero, cuando
 * esa Purchase se cancela (ver purchase.service.ts#cancel). Espejo de
 * reverseAccountDebtFromSale (sale.payment.ts): suma cuanto ya se reverso
 * antes para esta Purchase (por si se llama mas de una vez) y solo reversa
 * el remanente, para que sea seguro de re-ejecutar.
 */
export async function reverseSupplierDebtForPurchaseTx(
  tx: any,
  purchase: { id: string; supplierId: string | null; totalAmount: number }
) {
  if (!purchase.supplierId || purchase.totalAmount <= 0) return null;

  const originalDebt = await tx.supplierAccountMovement.findFirst({
    where: { purchaseId: purchase.id, type: SupplierAccountMovementType.COMPRA },
    select: { amount: true },
  });

  // Si esta Purchase nunca genero deuda de proveedor (ej. se cancela una
  // compra anterior a este feature, o no tenia supplierId al crearse), no
  // hay nada que reversar.
  if (!originalDebt) return null;

  const previousReversals = await tx.supplierAccountMovement.findMany({
    where: { purchaseId: purchase.id, type: SupplierAccountMovementType.AJUSTE_NEGATIVO },
    select: { amount: true },
  });
  const alreadyReversed = round2(
    previousReversals.reduce((sum: number, m: { amount: number }) => sum + m.amount, 0)
  );
  const remaining = round2(Math.max(originalDebt.amount - alreadyReversed, 0));

  if (remaining <= 0) return null;

  const supplier = await tx.supplier.findFirst({
    where: { id: purchase.supplierId, ...tenantScope() },
    select: { id: true, currentBalance: true },
  });
  if (!supplier) return null;

  const { previousBalance, newBalance } = computeAjusteBalance(
    supplier.currentBalance,
    remaining,
    "NEGATIVE"
  );

  await tx.supplier.update({
    where: { id: purchase.supplierId },
    data: { currentBalance: newBalance },
  });

  return tx.supplierAccountMovement.create({
    data: {
      supplierId: purchase.supplierId,
      purchaseId: purchase.id,
      userId: null,
      type: SupplierAccountMovementType.AJUSTE_NEGATIVO,
      amount: remaining,
      previousBalance,
      newBalance,
      paymentMethod: null,
      reference: null,
      description: "Reversión de deuda por cancelación de compra",
    },
  });
}

export const supplierAccountService = {
  async getSupplierAccount(supplierId: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, ...tenantScope() },
      include: {
        accountMovements: {
          orderBy: { date: "desc" },
          include: {
            purchase: {
              select: { id: true, totalAmount: true, status: true, date: true, invoiceNumber: true },
            },
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!supplier) {
      throw new ProveedorNoEncontradoError();
    }

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        cuit: supplier.cuit,
        contactName: supplier.contactName,
        phone: supplier.phone,
        email: supplier.email,
        isActive: supplier.isActive,
        currentBalance: supplier.currentBalance,
      },
      balance: supplier.currentBalance,
      movements: supplier.accountMovements,
    };
  },

  async getMovements(filters?: {
    supplierId?: string;
    type?: SupplierAccountMovementType;
    fromDate?: Date;
    toDate?: Date;
  }) {
    const date: any = {};

    if (filters?.fromDate) date.gte = filters.fromDate;
    if (filters?.toDate) date.lte = filters.toDate;

    return prisma.supplierAccountMovement.findMany({
      where: {
        supplierId: filters?.supplierId,
        type: filters?.type,
        ...(Object.keys(date).length > 0 ? { date } : {}),
        supplier: { tenantId: currentTenantId() },
      },
      include: {
        supplier: {
          select: { id: true, name: true, cuit: true, currentBalance: true },
        },
        purchase: {
          select: { id: true, totalAmount: true, status: true, date: true },
        },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { date: "desc" },
    });
  },

  /** Proveedores a los que les debemos plata, ordenados de mayor a menor deuda. */
  async getDebts() {
    return prisma.supplier.findMany({
      where: { currentBalance: { gt: 0 }, ...tenantScope() },
      orderBy: { currentBalance: "desc" },
      select: {
        id: true,
        name: true,
        cuit: true,
        contactName: true,
        phone: true,
        email: true,
        isActive: true,
        currentBalance: true,
      },
    });
  },

  /**
   * Resumen general de deuda con proveedores. No incluye "proximos
   * vencimientos": ni Purchase ni Supplier tienen hoy una fecha de
   * vencimiento de pago (a diferencia de, por ejemplo, facturas con fecha de
   * vencimiento) -- `upcomingDueDates` queda como array vacio a proposito,
   * documentado aca para que el frontend no tenga que adivinar por que
   * nunca trae datos. Si en el futuro se agrega un campo de vencimiento
   * (ej. en PurchaseOrder o un nuevo campo en Purchase), este es el lugar
   * para completarlo.
   */
  async getSummary() {
    const debtors = await prisma.supplier.findMany({
      where: { currentBalance: { gt: 0 }, ...tenantScope() },
      orderBy: { currentBalance: "desc" },
      select: { id: true, name: true, currentBalance: true },
    });

    const totalDebt = round2(debtors.reduce((sum, s) => sum + s.currentBalance, 0));

    return {
      totalDebt,
      suppliersInDebt: debtors.length,
      topDebts: debtors.slice(0, 10),
      upcomingDueDates: [] as unknown[],
    };
  },

  async addDebt(data: {
    supplierId: string;
    amount: number;
    purchaseId?: string | null;
    userId?: string | null;
    description?: string | null;
    reference?: string | null;
  }) {
    return prisma.$transaction((tx) => addSupplierDebtTx(tx, data));
  },

  async registerPayment(data: {
    supplierId: string;
    amount: number;
    method: PaymentMethod;
    userId?: string | null;
    reference?: string | null;
    description?: string | null;
    createFinance?: boolean;
  }) {
    const amount = assertPositiveAmount(data.amount);

    if (data.method === PaymentMethod.CUENTA_CORRIENTE) {
      throw new AppError(
        "METODO_PAGO_INVALIDO",
        "Un pago a proveedor no puede registrarse con CUENTA_CORRIENTE",
        400
      );
    }

    return prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: data.supplierId, ...tenantScope() },
        select: { id: true, name: true, currentBalance: true },
      });

      if (!supplier) {
        throw new ProveedorNoEncontradoError();
      }

      const { previousBalance, newBalance } = computePagoBalance(supplier.currentBalance, amount);

      await tx.supplier.update({
        where: { id: data.supplierId },
        data: { currentBalance: newBalance },
      });

      const movement = await tx.supplierAccountMovement.create({
        data: {
          supplierId: data.supplierId,
          purchaseId: null,
          userId: data.userId ?? null,
          type: SupplierAccountMovementType.PAGO,
          amount,
          previousBalance,
          newBalance,
          paymentMethod: data.method,
          reference: data.reference ?? null,
          description: data.description ?? "Pago de cuenta corriente a proveedor",
        },
        include: {
          supplier: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });

      if (data.createFinance !== false) {
        await tx.finance.create({
          data: {
            type: FinanceType.EGRESO,
            amount,
            category: CategoryFinance.CompraMercaderia,
            paymentMethod: data.method,
            description: data.description ?? `Pago a proveedor ${supplier.name}`,
            date: new Date(),
            tenantId: currentTenantId(),
          },
        });
      }

      return movement;
    });
  },

  async createAdjustment(data: {
    supplierId: string;
    type: "POSITIVE" | "NEGATIVE";
    amount: number;
    userId?: string | null;
    reference?: string | null;
    description?: string | null;
  }) {
    const amount = assertPositiveAmount(data.amount);

    return prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: data.supplierId, ...tenantScope() },
        select: { id: true, currentBalance: true },
      });

      if (!supplier) {
        throw new ProveedorNoEncontradoError();
      }

      const { previousBalance, newBalance } = computeAjusteBalance(
        supplier.currentBalance,
        amount,
        data.type
      );

      await tx.supplier.update({
        where: { id: data.supplierId },
        data: { currentBalance: newBalance },
      });

      return tx.supplierAccountMovement.create({
        data: {
          supplierId: data.supplierId,
          purchaseId: null,
          userId: data.userId ?? null,
          type:
            data.type === "POSITIVE"
              ? SupplierAccountMovementType.AJUSTE_POSITIVO
              : SupplierAccountMovementType.AJUSTE_NEGATIVO,
          amount,
          previousBalance,
          newBalance,
          paymentMethod: null,
          reference: data.reference ?? null,
          description:
            data.description ??
            (data.type === "POSITIVE"
              ? "Ajuste positivo de cuenta corriente"
              : "Ajuste negativo de cuenta corriente"),
        },
        include: {
          supplier: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });
    });
  },
};
