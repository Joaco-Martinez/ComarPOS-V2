import { Request, Response, NextFunction } from "express";
import { platformAdminService } from "../services/platformAdmin.service";
import { platformTenantService } from "../services/platformTenant.service";
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
        },
        platformAdminId
      );

      res.json({ ok: true, content: tenant });
    } catch (err) {
      next(err);
    }
  },

  async createTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await platformTenantService.createTenant({
        name: req.body.name,
        slug: req.body.slug,
        adminEmail: req.body.adminEmail,
        adminPassword: req.body.adminPassword,
      });

      res.status(201).json({ ok: true, content: tenant });
    } catch (err) {
      next(err);
    }
  },
};
