import { Request, Response, NextFunction } from "express";
import { platformAdminService } from "../services/platformAdmin.service";
import { platformTenantService } from "../services/platformTenant.service";
import { mpPlanService } from "../services/billing/mpPlan.service";
import { planFeatureConfigService } from "../services/planFeatureConfig.service";
import { PlanFeatureKey } from "../config/billing";
import { getParamAsString } from "../utils/params";

export const platformAdminController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await platformAdminService.login(email, password, res);

      res.json({ ok: true, content: result });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await platformAdminService.logout(res);

      res.json({ ok: true, content: result });
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const admin = await platformAdminService.me(req);

      res.json({ ok: true, content: admin });
    } catch (err) {
      res.clearCookie("platform_token", { path: "/" });
      next(err);
    }
  },

  async listTenants(req: Request, res: Response, next: NextFunction) {
    try {
      const tenants = await platformTenantService.listTenants();

      res.json({ ok: true, content: tenants });
    } catch (err) {
      next(err);
    }
  },

  async getTenantById(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await platformTenantService.getTenantById(
        getParamAsString(req.params.id, "id")
      );

      res.json({ ok: true, content: tenant });
    } catch (err) {
      next(err);
    }
  },

  async updateSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const platformAdminId = (req as any).platformAdmin?.id;
      const tenant = await platformTenantService.updateSubscription(
        getParamAsString(req.params.id, "id"),
        {
          status: req.body.status,
          note: req.body.note,
          paidUntil: req.body.paidUntil,
          trialEndsAt: req.body.trialEndsAt,
          planId: req.body.planId,
        },
        platformAdminId
      );

      res.json({ ok: true, content: tenant });
    } catch (err) {
      next(err);
    }
  },

  async updateTenantFeatureOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const feature = req.body.feature as PlanFeatureKey;
      const enabled = Boolean(req.body.enabled);

      const featureOverrides = await platformTenantService.setTenantFeatureOverride(
        getParamAsString(req.params.id, "id"),
        feature,
        enabled
      );

      res.json({ ok: true, content: { featureOverrides } });
    } catch (err) {
      next(err);
    }
  },

  async createTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const platformAdminId = (req as any).platformAdmin?.id;
      const tenant = await platformTenantService.createTenant(
        {
          name: req.body.name,
          slug: req.body.slug,
          adminEmail: req.body.adminEmail,
          adminPassword: req.body.adminPassword,
          planId: req.body.planId,
        },
        platformAdminId
      );

      res.status(201).json({ ok: true, content: tenant });
    } catch (err) {
      next(err);
    }
  },

  async impersonateTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const platformAdminId = (req as any).platformAdmin?.id;
      const user = await platformTenantService.impersonate(
        getParamAsString(req.params.id, "id"),
        platformAdminId,
        res
      );

      res.json({ ok: true, content: user });
    } catch (err) {
      next(err);
    }
  },

  // Precios/features CRUDOS (sin el ajuste de "precio de lanzamiento" que
  // aplica /billing/plans para mostrar) -- lo que edita el super-admin tiene
  // que ser el numero real guardado, no el que se ve pisado en la landing
  // una vez que LAUNCH_PRICE_ENDS_AT ya paso.
  async listPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await planFeatureConfigService.getAllEffectivePlans();
      res.json({ ok: true, content: plans });
    } catch (err) {
      next(err);
    }
  },

  async updatePlanFeature(req: Request, res: Response, next: NextFunction) {
    try {
      const planId = getParamAsString(req.params.planId, "planId");
      const feature = req.body.feature as PlanFeatureKey;
      const enabled = Boolean(req.body.enabled);

      const features = await planFeatureConfigService.setFeature(planId, feature, enabled);

      res.json({ ok: true, content: { planId, features } });
    } catch (err) {
      next(err);
    }
  },

  async updatePlanPrice(req: Request, res: Response, next: NextFunction) {
    try {
      const planId = getParamAsString(req.params.planId, "planId");
      const priceArs = Number(req.body.priceArs);
      const regularPriceArs = Number(req.body.regularPriceArs);

      const plan = await planFeatureConfigService.setPrice(planId, priceArs, regularPriceArs);

      res.json({ ok: true, content: plan });
    } catch (err) {
      next(err);
    }
  },

  async listMpPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await mpPlanService.list();
      res.json({ ok: true, content: plans });
    } catch (err) {
      next(err);
    }
  },

  async syncMpPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await mpPlanService.syncPlans();
      res.json({ ok: true, content: plans });
    } catch (err) {
      next(err);
    }
  },
};
