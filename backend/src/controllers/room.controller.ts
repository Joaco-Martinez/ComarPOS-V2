import { Request, Response, NextFunction } from "express";
import { roomService } from "../services/room.service";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await fn(req, res));
    } catch (err) {
      next(err);
    }
  };
}

export const roomController = {
  getAll: wrap(async (req) =>
    roomService.getAll({
      businessLocationId: req.query.businessLocationId as string | undefined,
      roomTypeId: req.query.roomTypeId as string | undefined,
      status: req.query.status as string | undefined,
      includeInactive: req.query.includeInactive === "true",
    })
  ),

  getById: wrap(async (req) => roomService.getById(req.params.id as string)),

  create: wrap(async (req) => roomService.create(req.body)),

  update: wrap(async (req) => roomService.update(req.params.id as string, req.body)),

  setStatus: wrap(async (req) => roomService.setStatus(req.params.id as string, req.body.status)),

  remove: wrap(async (req) => roomService.remove(req.params.id as string)),
};
