import { Request, Response, NextFunction } from "express";
import { stockCountService } from "../services/stockCount.service";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

function userId(req: Request): string {
  return (req as any).user?.id as string;
}

export const stockCountController = {
  getHistory: wrap(async () => stockCountService.getHistory()),

  getById: wrap(async (req) => {
    const c = await stockCountService.getById(req.params.id as string);
    if (!c) throw Object.assign(new Error("Conteo no encontrado"), { status: 404 });
    return c;
  }),

  start: wrap(async (req) =>
    stockCountService.startCount({
      userId: userId(req),
      businessLocationId: req.body.businessLocationId as string,
      notes: req.body.notes,
    })
  ),

  updateItem: wrap(async (req) =>
    stockCountService.updateItem({
      stockCountId: req.params.id as string,
      productId: req.params.productId as string,
      countedStock: req.body.countedStock,
    })
  ),

  complete: wrap(async (req) =>
    stockCountService.completeCount(req.params.id as string, userId(req))
  ),

  cancel: wrap(async (req) => stockCountService.cancelCount(req.params.id as string)),
};
