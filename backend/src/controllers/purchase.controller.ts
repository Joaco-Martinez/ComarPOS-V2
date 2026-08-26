import { Request, Response, NextFunction } from "express";
import { purchaseService } from "../services/purchase.service";
import { getParamAsString } from "../utils/params";
import { logAudit } from "../utils/auditLogger";
import { monthRangeAR } from "../utils/dateAR";
import {
  getComprasLibroIvaDigital,
  comprasCbteToCsv,
  comprasAlicuotasToCsv,
} from "../services/libroIvaDigital/compras.service";

function parsePeriod(req: Request) {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error("Indicá year y month (ej. ?year=2026&month=8)");
  }
  return monthRangeAR(year, month);
}

export const purchaseController = {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await purchaseService.getAll());
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getParamAsString(req.params.id, "id");
      res.json(await purchaseService.getById(id));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      const purchase = await purchaseService.create(req.body, userId);
      logAudit(req, "CREATE", "Purchase", purchase.id, {
        totalAmount: purchase.totalAmount,
        supplierId: purchase.supplierId,
      });
      res.status(201).json(purchase);
    } catch (err) {
      next(err);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getParamAsString(req.params.id, "id");
      const userId = (req as any).user?.id;
      const purchase = await purchaseService.cancel(id, userId);
      logAudit(req, "CANCEL", "Purchase", id);
      res.json(purchase);
    } catch (err) {
      next(err);
    }
  },

  async getLibroIvaDigitalCompras(req: Request, res: Response, next: NextFunction) {
    try {
      const { start, end } = parsePeriod(req);
      const data = await getComprasLibroIvaDigital({ from: start, to: end });
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async downloadLibroIvaDigitalComprasCbte(req: Request, res: Response, next: NextFunction) {
    try {
      const { start, end } = parsePeriod(req);
      const { cbte } = await getComprasLibroIvaDigital({ from: start, to: end });
      const csv = comprasCbteToCsv(cbte);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="compras_cbte_${req.query.year}_${req.query.month}.csv"`);
      res.send("﻿" + csv);
    } catch (err) {
      next(err);
    }
  },

  async downloadLibroIvaDigitalComprasAlicuotas(req: Request, res: Response, next: NextFunction) {
    try {
      const { start, end } = parsePeriod(req);
      const { alicuotas } = await getComprasLibroIvaDigital({ from: start, to: end });
      const csv = comprasAlicuotasToCsv(alicuotas);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="compras_alicuotas_${req.query.year}_${req.query.month}.csv"`);
      res.send("﻿" + csv);
    } catch (err) {
      next(err);
    }
  },
};
