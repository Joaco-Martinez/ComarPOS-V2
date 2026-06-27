import { Request, Response, NextFunction } from "express";
import { purchaseOrderService } from "../services/purchaseOrder.service";
import { PurchaseOrderStatus } from "@prisma/client";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

function userId(req: Request): string {
  return (req as any).user?.id as string;
}

export const purchaseOrderController = {
  getAll: wrap(async (req) =>
    purchaseOrderService.getAll(req.query.status as PurchaseOrderStatus | undefined)
  ),

  getById: wrap(async (req) => {
    const o = await purchaseOrderService.getById(req.params.id as string);
    if (!o) throw Object.assign(new Error("Orden de compra no encontrada"), { status: 404 });
    return o;
  }),

  create: wrap(async (req) =>
    purchaseOrderService.create({ ...req.body, userId: userId(req) })
  ),

  updateStatus: wrap(async (req) =>
    purchaseOrderService.updateStatus(req.params.id as string, req.body.status)
  ),

  receiveItems: wrap(async (req) =>
    purchaseOrderService.receiveItems(req.params.id as string, req.body)
  ),

  remove: wrap(async (req) => purchaseOrderService.remove(req.params.id as string)),
};
