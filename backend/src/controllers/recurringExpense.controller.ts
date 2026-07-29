import { Request, Response, NextFunction } from "express";
import { recurringExpenseService } from "../services/recurringExpense.service";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

export const recurringExpenseController = {
  getAll: wrap(async () => recurringExpenseService.getAll()),

  create: wrap(async (req) => recurringExpenseService.create(req.body)),

  update: wrap(async (req) => recurringExpenseService.update(req.params.id as string, req.body)),

  remove: wrap(async (req) => recurringExpenseService.remove(req.params.id as string)),

  processDue: wrap(async () => recurringExpenseService.processDueForCurrentTenant()),
};
