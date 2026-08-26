import { Request, Response, NextFunction } from "express";
import { PaymentMethod, SupplierAccountMovementType } from "@prisma/client";
import { supplierAccountService } from "../services/supplierAccount.service";
import { asyncHandler, AppError } from "../utils/asyncHandler";
import { getParamAsString } from "../utils/params";
import { optionalRangeAR } from "../utils/dateAR";

function toNumber(value: any) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export const supplierAccountController = {
  getSupplierAccount: asyncHandler(async (req: Request, res: Response) => {
    const supplierId = getParamAsString(req.params.supplierId, "supplierId");
    const result = await supplierAccountService.getSupplierAccount(supplierId);
    res.json(result);
  }),

  getMovements: asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as SupplierAccountMovementType | undefined;

    const { start: fromDate, end: toDate } = optionalRangeAR(
      req.query.fromDate as string | undefined,
      req.query.toDate as string | undefined
    );

    const movements = await supplierAccountService.getMovements({
      supplierId: req.query.supplierId as string | undefined,
      type,
      fromDate,
      toDate,
    });

    res.json(movements);
  }),

  getDebts: asyncHandler(async (_req: Request, res: Response) => {
    const debts = await supplierAccountService.getDebts();
    res.json(debts);
  }),

  getSummary: asyncHandler(async (_req: Request, res: Response) => {
    const summary = await supplierAccountService.getSummary();
    res.json(summary);
  }),

  registerPayment: asyncHandler(async (req: Request, res: Response) => {
    const supplierId = getParamAsString(req.params.supplierId, "supplierId");
    const userId = (req as any).user?.id;

    const amount = toNumber(req.body.amount);
    if (!amount) {
      throw new AppError("MONTO_INVALIDO", "amount es requerido y debe ser mayor a 0", 400);
    }
    if (!req.body.method) {
      throw new AppError("METODO_PAGO_REQUERIDO", "method es requerido", 400);
    }

    const result = await supplierAccountService.registerPayment({
      supplierId,
      amount,
      method: req.body.method as PaymentMethod,
      userId,
      reference: req.body.reference ?? null,
      description: req.body.description ?? null,
    });

    res.status(201).json(result);
  }),

  createAdjustment: asyncHandler(async (req: Request, res: Response) => {
    const supplierId = getParamAsString(req.params.supplierId, "supplierId");
    const userId = (req as any).user?.id;

    const amount = toNumber(req.body.amount);
    if (!amount) {
      throw new AppError("MONTO_INVALIDO", "amount es requerido y debe ser mayor a 0", 400);
    }
    if (!["POSITIVE", "NEGATIVE"].includes(req.body.type)) {
      throw new AppError("TIPO_AJUSTE_INVALIDO", "type debe ser POSITIVE o NEGATIVE", 400);
    }

    const result = await supplierAccountService.createAdjustment({
      supplierId,
      type: req.body.type,
      amount,
      userId,
      reference: req.body.reference ?? null,
      description: req.body.description ?? null,
    });

    res.status(201).json(result);
  }),
};
