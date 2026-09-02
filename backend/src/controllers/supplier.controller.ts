import { Request, Response, NextFunction } from "express";
import { supplierService } from "../services/supplier.service";
import { logAudit } from "../utils/auditLogger";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

function sendServiceResponse(res: Response, result: any) {
  if (result?.statusCode) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  return res.json(result);
}

export const supplierController = {
  getAll: wrap(async () => supplierService.getAll()),

  getById: wrap(async (req) => {
    const s = await supplierService.getById(req.params.id as string);
    if (!s) throw Object.assign(new Error("Proveedor no encontrado"), { status: 404 });
    return s;
  }),

  create: wrap(async (req) => {
    const s = await supplierService.create(req.body);
    logAudit(req, "CREATE", "Supplier", s.id, { name: s.name });
    return s;
  }),

  update: wrap(async (req) => {
    const s = await supplierService.update(req.params.id as string, req.body);
    logAudit(req, "UPDATE", "Supplier", s.id, req.body);
    return s;
  }),

  remove: wrap(async (req) => {
    const s = await supplierService.remove(req.params.id as string);
    logAudit(req, "DELETE", "Supplier", req.params.id as string);
    return s;
  }),

  getPurchaseHistory: wrap(async (req) => supplierService.getPurchaseHistory(req.params.id as string)),

  async bulkPriceUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await supplierService.bulkPriceUpdate(req.params.id as string, Number(req.body.percentage));
      if (!(result as any)?.statusCode) {
        logAudit(req, "UPDATE", "Supplier", req.params.id as string, { bulkPriceUpdate: req.body.percentage });
      }
      return sendServiceResponse(res, result);
    } catch (err) {
      next(err);
    }
  },
};
