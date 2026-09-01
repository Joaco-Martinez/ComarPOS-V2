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
};
