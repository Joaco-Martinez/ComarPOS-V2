import { Request, Response, NextFunction } from "express";
import { financeAccountService } from "../services/financeAccount.service";
import { getParamAsString } from "../utils/params";

export const financeAccountController = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { includeInactive, type } = req.query;
      const accounts = await financeAccountService.getAll({
        includeInactive: includeInactive === "true" || includeInactive === "1",
        type: type === "INGRESO" || type === "EGRESO" ? type : undefined,
      });
      res.json(accounts);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, type } = req.body;
      const account = await financeAccountService.create({ name, type });
      res.status(201).json(account);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, type, isActive } = req.body;
      const account = await financeAccountService.update(getParamAsString(id, "id"), { name, type, isActive });
      res.json(account);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await financeAccountService.remove(getParamAsString(id, "id"));
      res.json({ ok: true, account: result });
    } catch (err) {
      next(err);
    }
  },
};
