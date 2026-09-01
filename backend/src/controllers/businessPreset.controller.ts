import { Request, Response, NextFunction } from "express";
import { businessPresetService } from "../services/businessPreset.service";

export const businessPresetController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, content: businessPresetService.list() });
    } catch (err) {
      next(err);
    }
  },
};
