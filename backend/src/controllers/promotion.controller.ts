import { Request, Response, NextFunction } from "express";
import { promotionService } from "../services/promotion.service";
import { logAudit } from "../utils/auditLogger";
import { parseDateInputAR } from "../utils/dateAR";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

export const promotionController = {
  getAll: wrap(async () => promotionService.getAll()),

  getActive: wrap(async () => promotionService.getActive()),

  getById: wrap(async (req) => {
    const p = await promotionService.getById(req.params.id as string);
    if (!p) throw Object.assign(new Error("Promoción no encontrada"), { status: 404 });
    return p;
  }),

  create: wrap(async (req) => {
    const { startsAt, endsAt, ...rest } = req.body;
    const p = await promotionService.create({
      ...rest,
      startsAt: parseDateInputAR(startsAt) as Date,
      endsAt: parseDateInputAR(endsAt) as Date,
    });
    logAudit(req, "CREATE", "Promotion", p.id, { name: p.name });
    return p;
  }),

  update: wrap(async (req) => {
    const { startsAt, endsAt, ...rest } = req.body;
    const data = {
      ...rest,
      ...(startsAt !== undefined ? { startsAt: parseDateInputAR(startsAt) } : {}),
      ...(endsAt !== undefined ? { endsAt: parseDateInputAR(endsAt) } : {}),
    };
    const p = await promotionService.update(req.params.id as string, data);
    logAudit(req, "UPDATE", "Promotion", req.params.id as string, req.body);
    return p;
  }),

  deactivate: wrap(async (req) => {
    const p = await promotionService.deactivate(req.params.id as string);
    logAudit(req, "DEACTIVATE", "Promotion", req.params.id as string);
    return p;
  }),

  remove: wrap(async (req) => {
    const p = await promotionService.remove(req.params.id as string);
    logAudit(req, "DELETE", "Promotion", req.params.id as string);
    return p;
  }),

  applyToCart: wrap(async (req) => promotionService.applyToCart(req.body)),
};
