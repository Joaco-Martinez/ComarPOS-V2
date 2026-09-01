import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

const DEFAULT_POINTS_PER_PESO = 0.01; // 1 point per $100 spent
const DEFAULT_PESO_VALUE_PER_POINT = 1; // 1 point = $1 ARS

export const loyaltyService = {
  async getSettings() {
    const tenantId = currentTenantId();
    if (!tenantId) {
      return { pointsPerPeso: DEFAULT_POINTS_PER_PESO, pesoValuePerPoint: DEFAULT_PESO_VALUE_PER_POINT };
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { loyaltyPointsPerAmount: true, loyaltyPointValueArs: true },
    });
    return {
      pointsPerPeso: tenant?.loyaltyPointsPerAmount ?? DEFAULT_POINTS_PER_PESO,
      pesoValuePerPoint: tenant?.loyaltyPointValueArs ?? DEFAULT_PESO_VALUE_PER_POINT,
    };
  },

  async updateSettings(data: { pointsPerPeso?: number; pesoValuePerPoint?: number }) {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error("No hay negocio en contexto");

    const update: Record<string, number> = {};
    if (data.pointsPerPeso !== undefined) {
      if (!Number.isFinite(data.pointsPerPeso) || data.pointsPerPeso <= 0) {
        throw new Error("Los puntos por peso gastado deben ser un número mayor a 0.");
      }
      update.loyaltyPointsPerAmount = data.pointsPerPeso;
    }
    if (data.pesoValuePerPoint !== undefined) {
      if (!Number.isFinite(data.pesoValuePerPoint) || data.pesoValuePerPoint <= 0) {
        throw new Error("El valor en pesos de cada punto debe ser un número mayor a 0.");
      }
      update.loyaltyPointValueArs = data.pesoValuePerPoint;
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: update,
      select: { loyaltyPointsPerAmount: true, loyaltyPointValueArs: true },
    });
    return { pointsPerPeso: tenant.loyaltyPointsPerAmount, pesoValuePerPoint: tenant.loyaltyPointValueArs };
  },

  async getOrCreateAccount(clientId: string) {
    const scope = tenantScope();
    const existing = await prisma.loyaltyAccount.findFirst({ where: { clientId, ...scope } });
    if (existing) return existing;

    const client = await prisma.client.findFirst({ where: { id: clientId, ...scope } });
    if (!client) throw new Error("Cliente no encontrado.");

    return prisma.loyaltyAccount.create({ data: { clientId, tenantId: currentTenantId() } });
  },

  async getAccount(clientId: string) {
    const account = await prisma.loyaltyAccount.findFirst({
      where: { clientId, ...tenantScope() },
      include: {
        client: { select: { id: true, nombre: true, apellido: true } },
        transactions: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!account) throw new Error("El cliente no tiene cuenta de fidelización.");
    return account;
  },

  async earnPoints(data: { clientId: string; saleId: string; totalAmount: number }) {
    const account = await loyaltyService.getOrCreateAccount(data.clientId);
    const { pointsPerPeso } = await loyaltyService.getSettings();
    const points = Math.floor(data.totalAmount * pointsPerPeso);
    if (points <= 0) return null;

    await prisma.$transaction(async (tx) => {
      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: { points: { increment: points }, totalEarned: { increment: points } },
      });
      await tx.loyaltyTransaction.create({
        data: {
          loyaltyAccountId: account.id,
          type: "EARN",
          points,
          description: `Compra #${data.saleId.slice(0, 8)}`,
          reference: data.saleId,
        },
      });
    });

    return { pointsEarned: points, newBalance: account.points + points };
  },

  async redeemPoints(data: { clientId: string; points: number; saleId?: string }) {
    const account = await loyaltyService.getOrCreateAccount(data.clientId);
    if (data.points <= 0) throw new Error("Los puntos a canjear deben ser mayores a 0.");
    if (account.points < data.points) {
      throw new Error(`Puntos insuficientes. Disponibles: ${account.points}, solicitados: ${data.points}.`);
    }

    const { pesoValuePerPoint } = await loyaltyService.getSettings();
    const discountAmount = data.points * pesoValuePerPoint;

    await prisma.$transaction(async (tx) => {
      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: { points: { decrement: data.points }, totalRedeemed: { increment: data.points } },
      });
      await tx.loyaltyTransaction.create({
        data: {
          loyaltyAccountId: account.id,
          type: "REDEEM",
          points: -data.points,
          description: data.saleId ? `Canje en venta #${data.saleId.slice(0, 8)}` : "Canje de puntos",
          reference: data.saleId ?? null,
        },
      });
    });

    return { pointsRedeemed: data.points, discountAmount, newBalance: account.points - data.points };
  },

  async adjustPoints(data: { clientId: string; points: number; reason: string; userId: string }) {
    const account = await loyaltyService.getOrCreateAccount(data.clientId);
    const newBalance = account.points + data.points;
    if (newBalance < 0) throw new Error("El ajuste resultaría en saldo negativo.");

    await prisma.$transaction(async (tx) => {
      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: { points: { increment: data.points } },
      });
      await tx.loyaltyTransaction.create({
        data: {
          loyaltyAccountId: account.id,
          type: "ADJUSTMENT",
          points: data.points,
          description: `Ajuste manual: ${data.reason}`,
          reference: data.userId,
        },
      });
    });

    return { adjustment: data.points, newBalance };
  },

  async expireOldPoints(monthsThreshold = 12) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsThreshold);

    // Find accounts with no earn transactions newer than cutoff
    const staleAccounts = await prisma.loyaltyAccount.findMany({
      where: {
        points: { gt: 0 },
        ...tenantScope(),
        transactions: {
          none: {
            type: "EARN",
            createdAt: { gte: cutoff },
          },
        },
      },
    });

    let expired = 0;
    for (const account of staleAccounts) {
      await prisma.$transaction(async (tx) => {
        await tx.loyaltyTransaction.create({
          data: {
            loyaltyAccountId: account.id,
            type: "EXPIRE",
            points: -account.points,
            description: `Puntos vencidos por inactividad (>${monthsThreshold} meses)`,
          },
        });
        await tx.loyaltyAccount.update({
          where: { id: account.id },
          data: { points: 0 },
        });
      });
      expired += account.points;
    }

    return { accountsAffected: staleAccounts.length, pointsExpired: expired };
  },

  async convertPointsToARS(points: number) {
    const { pesoValuePerPoint } = await loyaltyService.getSettings();
    return points * pesoValuePerPoint;
  },

  async estimatePointsForAmount(amount: number) {
    const { pointsPerPeso } = await loyaltyService.getSettings();
    return Math.floor(amount * pointsPerPeso);
  },
};
