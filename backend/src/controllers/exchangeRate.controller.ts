import { Request, Response, NextFunction } from "express";
import { exchangeRateService } from "../services/exchangeRate.service";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === "string" ? v : undefined;
}

export const exchangeRateController = {
  getCurrent: wrap(async (req) =>
    exchangeRateService.getCurrentRate(q(req, "currency"))
  ),

  getAll: wrap(async () => exchangeRateService.getAllCurrencies()),

  getHistory: wrap(async (req) => {
    const fromStr = q(req, "from");
    const toStr = q(req, "to");
    return exchangeRateService.getHistory(
      q(req, "currency"),
      fromStr ? new Date(fromStr) : undefined,
      toStr ? new Date(toStr) : undefined
    );
  }),

  addRate: wrap(async (req) => exchangeRateService.addRate(req.body)),

  convert: wrap(async (req) => {
    const amountStr = q(req, "amount");
    const amount = amountStr ? parseFloat(amountStr) : NaN;
    if (isNaN(amount)) throw Object.assign(new Error("amount inválido"), { status: 400 });
    return exchangeRateService.convertFromARS(amount, q(req, "currency"));
  }),
};
