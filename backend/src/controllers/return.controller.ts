import { Request, Response, NextFunction } from "express";
import { returnService } from "../services/return.service";
import { logAudit } from "../utils/auditLogger";

function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

export const returnController = {
  processReturn: wrap(async (req, res) => {
    const saleId = req.params.saleId as string;
    const userId = (req as any).user?.id as string;
    const { refundMethod, notes } = req.body;

    const result = await returnService.processReturn(saleId, userId, { refundMethod, notes });
    logAudit(req, "RETURN", "Sale", saleId, { refundMethod });
    res.json({ ok: true, sale: result });
  }),

  getReturns: wrap(async (req, res) => {
    const { fromDate, toDate, page, limit } = req.query;
    const result = await returnService.getReturnedSales({
      fromDate: fromDate ? new Date(fromDate as string) : undefined,
      toDate: toDate ? new Date(toDate as string) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(result);
  }),
};
