/**
 * Crea (una sola vez) los 3 planes de config/billing.ts como
 * "preapproval_plan" reales del lado de Mercado Pago, para que aparezcan
 * en su dashboard con nombre/precio propios. Idempotente: si un plan ya
 * tiene un mpPlanId guardado, no lo vuelve a crear -- MP no tiene un
 * "upsert por nombre", así que sin este guardado cada click duplicaría los
 * 3 planes del lado de MP.
 */
import prisma from "../../prisma";
import { PLANS } from "../../config/billing";
import { mercadoPagoClient } from "./mercadoPago.service";

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/login$/, "").replace(/\/$/, "");

export const mpPlanService = {
  async list() {
    return prisma.mpPreapprovalPlan.findMany();
  },

  async syncPlans() {
    const results = [];

    for (const plan of PLANS) {
      let record = await prisma.mpPreapprovalPlan.findUnique({ where: { planId: plan.id } });

      if (!record) {
        const mpPlan = await mercadoPagoClient.createPreapprovalPlan({
          reason: `ComarPOS - Plan ${plan.name}`,
          amount: plan.priceArs,
          backUrl: `${FRONTEND_URL}/suscripcion`,
        });

        record = await prisma.mpPreapprovalPlan.create({
          data: { planId: plan.id, mpPlanId: mpPlan.id, status: mpPlan.status },
        });
      }

      results.push({ ...plan, mpPlanId: record.mpPlanId, mpStatus: record.status });
    }

    return results;
  },
};
