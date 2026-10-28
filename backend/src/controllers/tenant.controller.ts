import { Request, Response, NextFunction } from "express";
import { tenantService } from "../services/tenant.service";

export const tenantController = {
  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await tenantService.getMe();
      res.json({ ok: true, tenant });
    } catch (error) {
      next(error);
    }
  },

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await tenantService.updateMe({
        name: req.body.name,
        ticketBusinessName: req.body.ticketBusinessName,
        ticketCuit: req.body.ticketCuit,
        ticketAddress: req.body.ticketAddress,
        ticketPhone: req.body.ticketPhone,
        ticketEmail: req.body.ticketEmail,
      });

      res.json({ ok: true, tenant });
    } catch (error) {
      next(error);
    }
  },

  async getStockSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await tenantService.getStockSettings();
      res.json({ ok: true, settings });
    } catch (error) {
      next(error);
    }
  },

  async updateStockSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await tenantService.updateStockSettings({
        stockFallbackEnabled: req.body.stockFallbackEnabled,
        stockFallbackLocationIds: req.body.stockFallbackLocationIds,
      });
      res.json({ ok: true, settings });
    } catch (error) {
      next(error);
    }
  },

  async getPaymentSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await tenantService.getPaymentSettings();
      res.json({ ok: true, settings });
    } catch (error) {
      next(error);
    }
  },

  async updatePaymentSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await tenantService.updatePaymentSettings({ adjustments: req.body.adjustments });
      res.json({ ok: true, settings });
    } catch (error) {
      next(error);
    }
  },

  async getStockFallbackLog(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = Number(req.query.limit) || 100;
      const items = await tenantService.getStockFallbackLog(limit);
      res.json({ ok: true, items });
    } catch (error) {
      next(error);
    }
  },
};
