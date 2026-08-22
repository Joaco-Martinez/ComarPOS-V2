import { Request, Response } from "express";
import onboardingService from "../services/onboarding.service";

export const getOnboardingChecklist = async (req: Request, res: Response) => {
  try {
    const checklist = await onboardingService.getChecklist();
    res.json(checklist);
  } catch (error) {
    console.error("Error al obtener checklist de onboarding:", error);
    res.status(500).json({ error: "Error al obtener checklist de onboarding" });
  }
};

export const setOnboardingStep = async (req: Request, res: Response) => {
  try {
    const stepId = req.params.stepId as string;
    const { done } = req.body;
    const checklist = await onboardingService.setStep(stepId, Boolean(done));
    res.json(checklist);
  } catch (error: any) {
    console.error("Error al actualizar checklist de onboarding:", error);
    res.status(400).json({ error: error?.message ?? "Error al actualizar checklist de onboarding" });
  }
};
