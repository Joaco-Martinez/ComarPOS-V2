import { Request, Response, NextFunction } from "express";
import { trialSignupService } from "../services/trialSignup.service";

export const trialSignupController = {
  async signup(req: Request, res: Response, next: NextFunction) {
    try {
      const { businessName, adminName, adminEmail, adminPassword, phone, planId, businessType, presetSelection } = req.body;

      const { tenant } = await trialSignupService.signup({
        businessName,
        adminName,
        adminEmail,
        adminPassword,
        phone,
        planId,
        businessType,
        presetSelection,
      });

      res.status(201).json({
        ok: true,
        content: { tenantSlug: tenant.slug, tenantName: tenant.name, trialEndsAt: tenant.trialEndsAt },
      });
    } catch (err) {
      next(err);
    }
  },
};
