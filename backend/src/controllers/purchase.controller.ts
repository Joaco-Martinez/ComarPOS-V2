import { Request, Response, NextFunction } from "express";
import { purchaseService } from "../services/purchase.service";
import { getParamAsString } from "../utils/params";
import { logAudit } from "../utils/auditLogger";

export const purchaseController = {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await purchaseService.getAll());
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getParamAsString(req.params.id, "id");
      res.json(await purchaseService.getById(id));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      const purchase = await purchaseService.create(req.body, userId);
      logAudit(req, "CREATE", "Purchase", purchase.id, {
        totalAmount: purchase.totalAmount,
        supplierId: purchase.supplierId,
      });
      res.status(201).json(purchase);
    } catch (err) {
      next(err);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getParamAsString(req.params.id, "id");
      const userId = (req as any).user?.id;
      const purchase = await purchaseService.cancel(id, userId);
      logAudit(req, "CANCEL", "Purchase", id);
      res.json(purchase);
    } catch (err) {
      next(err);
    }
  },
};
