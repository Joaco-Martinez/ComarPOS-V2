import prisma from "../prisma";
import {
  AccountMovementType,
  CategoryFinance,
  FinanceType,
  PaymentMethod,
} from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function assertPositiveAmount(amount: number) {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("El monto debe ser mayor a 0");
  }

  return round2(value);
}

export const accountService = {
  async getClientAccount(clientId: string) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, ...tenantScope() },
      include: {
        accountMovements: {
          orderBy: {
            date: "desc",
          },
          include: {
            sale: {
              select: {
                id: true,
                total: true,
                status: true,
                createdAt: true,
              },
            },
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      throw new Error("Cliente no encontrado");
    }

    return {
      client: {
        id: client.id,
        nombre: client.nombre,
        apellido: client.apellido,
        dni: client.dni,
        telefono: client.telefono,
        gmail: client.gmail,
        category: client.category,
        currentBalance: client.currentBalance,
        creditLimit: client.creditLimit,
        isAccountEnabled: client.isAccountEnabled,
      },
      balance: client.currentBalance,
      movements: client.accountMovements,
    };
  },

  async getMovements(filters?: {
    clientId?: string;
    type?: AccountMovementType;
    fromDate?: Date;
    toDate?: Date;
  }) {
    const date: any = {};

    if (filters?.fromDate) date.gte = filters.fromDate;
    if (filters?.toDate) date.lte = filters.toDate;

    return prisma.accountMovement.findMany({
      where: {
        clientId: filters?.clientId,
        type: filters?.type,
        ...(Object.keys(date).length > 0 ? { date } : {}),
        client: { tenantId: currentTenantId() },
      },
      include: {
        client: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            telefono: true,
            gmail: true,
            currentBalance: true,
          },
        },
        sale: {
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });
  },

  async getDebtors() {
    return prisma.client.findMany({
      where: {
        currentBalance: {
          gt: 0,
        },
        ...tenantScope(),
      },
      orderBy: {
        currentBalance: "desc",
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        dni: true,
        telefono: true,
        gmail: true,
        category: true,
        currentBalance: true,
        creditLimit: true,
        isAccountEnabled: true,
      },
    });
  },

  async addDebt(data: {
    clientId: string;
    amount: number;
    saleId?: string | null;
    userId?: string | null;
    description?: string | null;
    reference?: string | null;
  }) {
    const amount = assertPositiveAmount(data.amount);

    return prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: {
          id: data.clientId,
          ...tenantScope(),
        },
        select: {
          id: true,
          currentBalance: true,
          isAccountEnabled: true,
          creditLimit: true,
        },
      });

      if (!client) {
        throw new Error("Cliente no encontrado");
      }

      if (!client.isAccountEnabled) {
        throw new Error("La cuenta corriente de este cliente está deshabilitada");
      }

      const previousBalance = round2(client.currentBalance);
      const newBalance = round2(previousBalance + amount);

      if (
        client.creditLimit !== null &&
        client.creditLimit !== undefined &&
        client.creditLimit > 0 &&
        newBalance > client.creditLimit
      ) {
        throw new Error(
          `La deuda supera el límite de crédito del cliente. Límite: ${client.creditLimit}`
        );
      }

      await tx.client.update({
        where: {
          id: data.clientId,
        },
        data: {
          currentBalance: newBalance,
        },
      });

      return tx.accountMovement.create({
        data: {
          clientId: data.clientId,
          saleId: data.saleId ?? null,
          userId: data.userId ?? null,
          type: AccountMovementType.DEBT,
          amount,
          previousBalance,
          newBalance,
          paymentMethod: null,
          reference: data.reference ?? null,
          description: data.description ?? "Deuda generada por venta",
        },
        include: {
          client: true,
          sale: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });
  },

  async registerPayment(data: {
    clientId: string;
    amount: number;
    method: PaymentMethod;
    userId?: string | null;
    reference?: string | null;
    description?: string | null;
    createFinance?: boolean;
  }) {
    const amount = assertPositiveAmount(data.amount);

    if (data.method === PaymentMethod.CUENTA_CORRIENTE) {
      throw new Error("Un abono no puede pagarse con CUENTA_CORRIENTE");
    }

    return prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: {
          id: data.clientId,
          ...tenantScope(),
        },
        select: {
          id: true,
          currentBalance: true,
        },
      });

      if (!client) {
        throw new Error("Cliente no encontrado");
      }

      const previousBalance = round2(client.currentBalance);
      const newBalance = round2(Math.max(previousBalance - amount, 0));

      await tx.client.update({
        where: {
          id: data.clientId,
        },
        data: {
          currentBalance: newBalance,
        },
      });

      const movement = await tx.accountMovement.create({
        data: {
          clientId: data.clientId,
          userId: data.userId ?? null,
          saleId: null,
          type: AccountMovementType.PAYMENT,
          amount,
          previousBalance,
          newBalance,
          paymentMethod: data.method,
          reference: data.reference ?? null,
          description: data.description ?? "Abono de cuenta corriente",
        },
        include: {
          client: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (data.createFinance !== false) {
        await tx.finance.create({
          data: {
            type: FinanceType.INGRESO,
            amount,
            category: CategoryFinance.COBRANZA,
            paymentMethod: data.method,
            description:
              data.description ??
              `Abono cuenta corriente cliente ${movement.client.nombre} ${movement.client.apellido}`,
            date: new Date(),
            tenantId: currentTenantId(),
          },
        });
      }

      return movement;
    });
  },

  async createAdjustment(data: {
    clientId: string;
    type: "POSITIVE" | "NEGATIVE";
    amount: number;
    userId?: string | null;
    reference?: string | null;
    description?: string | null;
  }) {
    const amount = assertPositiveAmount(data.amount);

    return prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: {
          id: data.clientId,
          ...tenantScope(),
        },
        select: {
          id: true,
          currentBalance: true,
        },
      });

      if (!client) {
        throw new Error("Cliente no encontrado");
      }

      const previousBalance = round2(client.currentBalance);

      const isPositive = data.type === "POSITIVE";
      const newBalance = isPositive
        ? round2(previousBalance + amount)
        : round2(Math.max(previousBalance - amount, 0));

      await tx.client.update({
        where: {
          id: data.clientId,
        },
        data: {
          currentBalance: newBalance,
        },
      });

      return tx.accountMovement.create({
        data: {
          clientId: data.clientId,
          userId: data.userId ?? null,
          saleId: null,
          type: isPositive
            ? AccountMovementType.ADJUSTMENT_POSITIVE
            : AccountMovementType.ADJUSTMENT_NEGATIVE,
          amount,
          previousBalance,
          newBalance,
          paymentMethod: null,
          reference: data.reference ?? null,
          description:
            data.description ??
            (isPositive
              ? "Ajuste positivo de cuenta corriente"
              : "Ajuste negativo de cuenta corriente"),
        },
        include: {
          client: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });
  },

  async updateClientAccountConfig(
    clientId: string,
    data: {
      creditLimit?: number | null;
      isAccountEnabled?: boolean;
    }
  ) {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        ...tenantScope(),
      },
    });

    if (!client) {
      throw new Error("Cliente no encontrado");
    }

    const updateData: any = {};

    if (data.creditLimit !== undefined) {
      updateData.creditLimit =
        data.creditLimit === null ? null : Number(data.creditLimit);
    }

    if (data.isAccountEnabled !== undefined) {
      updateData.isAccountEnabled = data.isAccountEnabled;
    }

    return prisma.client.update({
      where: {
        id: clientId,
      },
      data: updateData,
      select: {
        id: true,
        nombre: true,
        apellido: true,
        dni: true,
        telefono: true,
        gmail: true,
        currentBalance: true,
        creditLimit: true,
        isAccountEnabled: true,
      },
    });
  },
};