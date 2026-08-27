import { Request, Response, NextFunction } from "express";
import { reservationService } from "../services/reservation.service";

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

export const reservationController = {
  getAll: wrap(async (req) =>
    reservationService.getAll({
      status: req.query.status as string | undefined,
      roomId: req.query.roomId as string | undefined,
      search: req.query.search as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    })
  ),

  getAvailability: wrap(async (req) =>
    reservationService.getAvailability({
      businessLocationId: req.query.businessLocationId as string | undefined,
      roomTypeId: req.query.roomTypeId as string | undefined,
      from: req.query.from as string,
      to: req.query.to as string,
    })
  ),

  getById: wrap(async (req) => reservationService.getById(req.params.id as string)),

  create: wrap(async (req) =>
    reservationService.create({
      ...req.body,
      userId: userId(req),
      checkInDate: new Date(req.body.checkInDate),
      checkOutDate: new Date(req.body.checkOutDate),
    })
  ),

  update: wrap(async (req) =>
    reservationService.update(req.params.id as string, {
      ...req.body,
      checkInDate: req.body.checkInDate !== undefined ? new Date(req.body.checkInDate) : undefined,
      checkOutDate: req.body.checkOutDate !== undefined ? new Date(req.body.checkOutDate) : undefined,
    })
  ),

  setStatus: wrap(async (req) => reservationService.setStatus(req.params.id as string, req.body.status)),

  checkIn: wrap(async (req) => reservationService.checkIn(req.params.id as string)),

  checkout: wrap(async (req) => reservationService.checkout(req.params.id as string, req.body, userId(req))),

  remove: wrap(async (req) => reservationService.remove(req.params.id as string)),
};
