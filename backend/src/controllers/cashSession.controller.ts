import { Request, Response, NextFunction } from "express";
import { cashSessionService } from "../services/cashSession.service";
import { logAudit } from "../utils/auditLogger";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

function userId(req: Request): string {
  return (req as any).user?.id as string;
}

function p(req: Request, key: string): string {
  return req.params[key] as string;
}

function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === "string" ? v : undefined;
}

export const cashSessionController = {
  open: wrap(async (req) => {
    const s = await cashSessionService.openSession({
      userId: userId(req),
      businessLocationId: req.body.businessLocationId,
      openingBalance: req.body.openingBalance ?? 0,
      notes: req.body.notes,
    });
    logAudit(req, "OPEN", "CashSession", s.id, { openingBalance: s.openingBalance });
    return s;
  }),

  getOpen: wrap(async (req) => cashSessionService.getOpenSession(userId(req))),

  addMovement: wrap(async (req) =>
    cashSessionService.addMovement({
      sessionId: p(req, "id"),
      type: req.body.type,
      amount: req.body.amount,
      description: req.body.description,
      reference: req.body.reference,
    })
  ),

  getSummary: wrap(async (req) => cashSessionService.getSessionSummary(p(req, "id"))),

  close: wrap(async (req) => {
    const s = await cashSessionService.closeSession({
      sessionId: p(req, "id"),
      actualBalance: req.body.actualBalance,
      closeNotes: req.body.closeNotes,
    });
    logAudit(req, "CLOSE", "CashSession", p(req, "id"), {
      actualBalance: req.body.actualBalance,
      difference: s.difference,
    });
    return s;
  }),

  getHistory: wrap(async (req) =>
    cashSessionService.getHistory({
      businessLocationId: q(req, "businessLocationId"),
      userId: q(req, "userId"),
    })
  ),

  getById: wrap(async (req) => cashSessionService.getSessionSummary(p(req, "id"))),
};
