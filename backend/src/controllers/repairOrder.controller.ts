import { Request, Response, NextFunction } from "express";
import { repairOrderService } from "../services/repairOrder.service";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await fn(req, res));
    } catch (err) {
      next(err);
    }
  };
}

function userId(req: Request): string | undefined {
  return (req as any).user?.id as string | undefined;
}

export const repairOrderController = {
  getAll: wrap(async (req) =>
    repairOrderService.getAll({
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    })
  ),

  getById: wrap(async (req) => repairOrderService.getById(req.params.id as string)),

  create: wrap(async (req) =>
    repairOrderService.create({
      ...req.body,
      userId: userId(req),
      estimatedDeliveryDate: req.body.estimatedDeliveryDate ? new Date(req.body.estimatedDeliveryDate) : null,
    })
  ),

  update: wrap(async (req) =>
    repairOrderService.update(req.params.id as string, {
      ...req.body,
      estimatedDeliveryDate:
        req.body.estimatedDeliveryDate !== undefined
          ? req.body.estimatedDeliveryDate
            ? new Date(req.body.estimatedDeliveryDate)
            : null
          : undefined,
    })
  ),

  addItem: wrap(async (req) => repairOrderService.addItem(req.params.id as string, req.body)),

  updateItem: wrap(async (req) =>
    repairOrderService.updateItem(req.params.id as string, req.params.itemId as string, req.body)
  ),

  removeItem: wrap(async (req) =>
    repairOrderService.removeItem(req.params.id as string, req.params.itemId as string)
  ),

  setStatus: wrap(async (req) => repairOrderService.setStatus(req.params.id as string, req.body.status)),

  createApprovalLink: wrap(async (req) => repairOrderService.createApprovalLink(req.params.id as string)),

  checkout: wrap(async (req) => repairOrderService.checkout(req.params.id as string, req.body, userId(req))),

  remove: wrap(async (req) => repairOrderService.remove(req.params.id as string)),

  // --- Publico (sin login) ---

  getPublicByToken: wrap(async (req) => repairOrderService.getByToken(req.params.token as string)),

  approvePublic: wrap(async (req) => repairOrderService.approveByToken(req.params.token as string)),

  rejectPublic: wrap(async (req) =>
    repairOrderService.rejectByToken(req.params.token as string, req.body?.reason)
  ),
};
