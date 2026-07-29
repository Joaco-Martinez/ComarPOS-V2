import { Request, Response, NextFunction } from "express";
import { auditLogService } from "../services/auditLog.service";
import { startOfDayAR, endOfDayAR } from "../utils/dateAR";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === "string" ? v : undefined;
}

export const auditLogController = {
  getAll: wrap(async (req) => {
    const fromStr = q(req, "from");
    const toStr = q(req, "to");
    const limitStr = q(req, "limit");
    const offsetStr = q(req, "offset");
    return auditLogService.getAll({
      userId: q(req, "userId"),
      entity: q(req, "entity"),
      entityId: q(req, "entityId"),
      from: fromStr ? startOfDayAR(fromStr) : undefined,
      to: toStr ? endOfDayAR(toStr) : undefined,
      limit: limitStr ? parseInt(limitStr, 10) : undefined,
      offset: offsetStr ? parseInt(offsetStr, 10) : undefined,
    });
  }),

  getEntityHistory: wrap(async (req) =>
    auditLogService.getEntityHistory(req.params.entity as string, req.params.entityId as string)
  ),
};
