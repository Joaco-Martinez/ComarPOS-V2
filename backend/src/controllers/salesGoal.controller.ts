import { Request, Response, NextFunction } from "express";
import { salesGoalService } from "../services/salesGoal.service";
import { logAudit } from "../utils/auditLogger";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

export const salesGoalController = {
  getAll: wrap(async () => salesGoalService.getAllWithProgress()),

  getById: wrap(async (req) => {
    const g = await salesGoalService.getById(req.params.id as string);
    if (!g) throw Object.assign(new Error("Meta no encontrada"), { status: 404 });
    return g;
  }),

  getProgress: wrap(async (req) => salesGoalService.getProgress(req.params.id as string)),

  create: wrap(async (req) => {
    const { periodStart, periodEnd, ...rest } = req.body;
    const g = await salesGoalService.create({
      ...rest,
      periodStart: new Date(periodStart as string),
      periodEnd: new Date(periodEnd as string),
    });
    logAudit(req, "CREATE", "SalesGoal", g.id, { title: g.title, metric: g.metric });
    return g;
  }),

  update: wrap(async (req) => {
    const g = await salesGoalService.update(req.params.id as string, req.body);
    logAudit(req, "UPDATE", "SalesGoal", req.params.id as string, req.body);
    return g;
  }),

  remove: wrap(async (req) => {
    const g = await salesGoalService.remove(req.params.id as string);
    logAudit(req, "DELETE", "SalesGoal", req.params.id as string);
    return g;
  }),
};
