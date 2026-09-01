import { Request, Response, NextFunction } from "express";
import { loyaltyService } from "../services/loyalty.service";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

function userId(req: Request): string {
  return (req as any).user?.id as string;
}

export const loyaltyController = {
  getSettings: wrap(async () => loyaltyService.getSettings()),

  updateSettings: wrap(async (req) =>
    loyaltyService.updateSettings({
      pointsPerPeso: req.body.pointsPerPeso !== undefined ? Number(req.body.pointsPerPeso) : undefined,
      pesoValuePerPoint: req.body.pesoValuePerPoint !== undefined ? Number(req.body.pesoValuePerPoint) : undefined,
    })
  ),

  getAccount: wrap(async (req) =>
    loyaltyService.getAccount(req.params.clientId as string)
  ),

  earn: wrap(async (req) =>
    loyaltyService.earnPoints({
      clientId: req.params.clientId as string,
      saleId: req.body.saleId,
      totalAmount: req.body.totalAmount,
    })
  ),

  redeem: wrap(async (req) =>
    loyaltyService.redeemPoints({
      clientId: req.params.clientId as string,
      points: req.body.points,
      saleId: req.body.saleId,
    })
  ),

  adjust: wrap(async (req) =>
    loyaltyService.adjustPoints({
      clientId: req.params.clientId as string,
      points: req.body.points,
      reason: req.body.reason,
      userId: userId(req),
    })
  ),

  expireOld: wrap(async (req) =>
    loyaltyService.expireOldPoints(req.body.monthsThreshold)
  ),

  estimatePoints: wrap(async (req) => {
    const amount = parseFloat(req.query.amount as string);
    const estimatedPoints = await loyaltyService.estimatePointsForAmount(amount);
    return {
      amount,
      estimatedPoints,
      arsValue: await loyaltyService.convertPointsToARS(estimatedPoints),
    };
  }),
};
