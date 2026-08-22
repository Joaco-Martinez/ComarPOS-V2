import prisma from "../prisma";
import { currentTenantId } from "../context/tenantContext";

// Ids de los pasos de la guia de arranque (ver frontend app/[tenant]/guia).
// Se mantienen acá (no en el frontend) para poder validar que un stepId
// existe antes de guardarlo.
export const ONBOARDING_STEPS = [
  "empresa",
  "arca",
  "categorias",
  "productos",
  "sucursales",
  "usuarios",
  "pwa",
  "primera-venta",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

class OnboardingService {
  async getChecklist(): Promise<Record<string, boolean>> {
    const tenantId = currentTenantId();
    if (!tenantId) return {};

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { onboardingChecklist: true },
    });

    return (tenant?.onboardingChecklist as Record<string, boolean> | null) ?? {};
  }

  async setStep(stepId: string, done: boolean): Promise<Record<string, boolean>> {
    if (!ONBOARDING_STEPS.includes(stepId as OnboardingStepId)) {
      throw new Error(`Paso de onboarding invalido: ${stepId}`);
    }

    const tenantId = currentTenantId();
    if (!tenantId) throw new Error("No hay tenant en contexto");

    const current = await this.getChecklist();
    const next = { ...current, [stepId]: done };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { onboardingChecklist: next },
    });

    return next;
  }
}

export default new OnboardingService();
