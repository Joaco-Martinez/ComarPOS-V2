import { Request, Response, NextFunction } from "express";
import { salesLeadService } from "../services/salesLead.service";
import { getParamAsString } from "../utils/params";

export const salesLeadController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const leads = await salesLeadService.list();
      res.json({ ok: true, content: leads });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const platformAdminId = (req as any).platformAdmin?.id;
      const lead = await salesLeadService.create(req.body, platformAdminId);
      res.status(201).json({ ok: true, content: lead });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await salesLeadService.update(getParamAsString(req.params.id, "id"), req.body);
      res.json({ ok: true, content: lead });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await salesLeadService.delete(getParamAsString(req.params.id, "id"));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
};
