import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

export const exchangeRateService = {
  async addRate(data: { currency: string; rate: number; source?: string }) {
    if (data.rate <= 0) throw new Error("El tipo de cambio debe ser mayor a 0.");
    return prisma.exchangeRate.create({
      data: {
        currency: data.currency.toUpperCase(),
        rate: data.rate,
        source: data.source ?? "manual",
        tenantId: currentTenantId(),
      },
    });
  },

  async getCurrentRate(currency = "USD") {
    return prisma.exchangeRate.findFirst({
      where: { currency: currency.toUpperCase(), ...tenantScope() },
      orderBy: { date: "desc" },
    });
  },

  async getHistory(currency?: string, from?: Date, to?: Date) {
    return prisma.exchangeRate.findMany({
      where: {
        ...(currency ? { currency: currency.toUpperCase() } : {}),
        ...tenantScope(),
        ...(from || to
          ? { date: { ...(from && { gte: from }), ...(to && { lte: to }) } }
          : {}),
      },
      orderBy: { date: "desc" },
    });
  },

  async remove(id: string) {
    const existing = await prisma.exchangeRate.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Tipo de cambio no encontrado.");
    return prisma.exchangeRate.delete({ where: { id } });
  },

  async getAllCurrencies() {
    const scope = tenantScope();
    const rates = await prisma.exchangeRate.findMany({
      where: { ...scope },
      orderBy: { date: "desc" },
    });
    // Return latest rate per currency
    const seen = new Set<string>();
    return rates.filter((r) => {
      if (seen.has(r.currency)) return false;
      seen.add(r.currency);
      return true;
    });
  },

  // Convert ARS amount to a foreign currency using latest rate
  async convertFromARS(arsAmount: number, toCurrency = "USD") {
    const rate = await exchangeRateService.getCurrentRate(toCurrency);
    if (!rate) throw new Error(`No hay tipo de cambio registrado para ${toCurrency}.`);
    return {
      originalARS: arsAmount,
      currency: toCurrency,
      rate: rate.rate,
      converted: Math.round((arsAmount / rate.rate) * 100) / 100,
      rateDate: rate.date,
    };
  },
};
