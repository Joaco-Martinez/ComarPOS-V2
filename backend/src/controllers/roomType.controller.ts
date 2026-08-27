import { Request, Response, NextFunction } from "express";
import { roomTypeService } from "../services/roomType.service";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await fn(req, res));
    } catch (err) {
      next(err);
    }
  };
}

export const roomTypeController = {
  getAll: wrap(async (req) => roomTypeService.getAll({ includeInactive: req.query.includeInactive === "true" })),

  getById: wrap(async (req) => roomTypeService.getById(req.params.id as string)),

  create: wrap(async (req) => roomTypeService.create(req.body)),

  update: wrap(async (req) => roomTypeService.update(req.params.id as string, req.body)),

  remove: wrap(async (req) => roomTypeService.remove(req.params.id as string)),
};
