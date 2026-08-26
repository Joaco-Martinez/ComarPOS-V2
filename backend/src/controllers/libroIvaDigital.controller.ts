import { Request, Response, NextFunction } from "express";
import { monthRangeAR } from "../utils/dateAR";
import {
  getComprasLibroIvaDigital,
  comprasCbteToCsv,
  comprasAlicuotasToCsv,
} from "../services/libroIvaDigital/compras.service";
import {
  getVentasLibroIvaDigital,
  ventasCbteToCsv,
  ventasAlicuotasToCsv,
} from "../services/libroIvaDigital/ventas.service";

function parsePeriod(req: Request) {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error("Indicá year y month (ej. ?year=2026&month=8)");
  }
  return monthRangeAR(year, month);
}

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // BOM para que Excel abra bien los acentos.
  res.send("﻿" + csv);
}

export const libroIvaDigitalController = {
  async getResumen(req: Request, res: Response, next: NextFunction) {
    try {
      const { start, end } = parsePeriod(req);
      const [compras, ventas] = await Promise.all([
        getComprasLibroIvaDigital({ from: start, to: end }),
        getVentasLibroIvaDigital({ from: start, to: end }),
      ]);
      res.json({
        compras: {
          cantidad: compras.cbte.length,
          total: compras.cbte.reduce((s, r) => s + r.importeTotal, 0),
          conDatosFaltantes: compras.cbte.filter((r) => r.missingFields.length > 0).length,
        },
        ventas: {
          cantidad: ventas.cbte.length,
          total: ventas.cbte.reduce((s, r) => s + r.importeTotal, 0),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async downloadComprasCbte(req: Request, res: Response, next: NextFunction) {
    try {
      const { start, end } = parsePeriod(req);
      const { cbte } = await getComprasLibroIvaDigital({ from: start, to: end });
      sendCsv(res, `libro_iva_compras_${req.query.year}_${req.query.month}.csv`, comprasCbteToCsv(cbte));
    } catch (err) {
      next(err);
    }
  },

  async downloadComprasAlicuotas(req: Request, res: Response, next: NextFunction) {
    try {
      const { start, end } = parsePeriod(req);
      const { alicuotas } = await getComprasLibroIvaDigital({ from: start, to: end });
      sendCsv(res, `libro_iva_compras_alicuotas_${req.query.year}_${req.query.month}.csv`, comprasAlicuotasToCsv(alicuotas));
    } catch (err) {
      next(err);
    }
  },

  async downloadVentasCbte(req: Request, res: Response, next: NextFunction) {
    try {
      const { start, end } = parsePeriod(req);
      const { cbte } = await getVentasLibroIvaDigital({ from: start, to: end });
      sendCsv(res, `libro_iva_ventas_${req.query.year}_${req.query.month}.csv`, ventasCbteToCsv(cbte));
    } catch (err) {
      next(err);
    }
  },

  async downloadVentasAlicuotas(req: Request, res: Response, next: NextFunction) {
    try {
      const { start, end } = parsePeriod(req);
      const { alicuotas } = await getVentasLibroIvaDigital({ from: start, to: end });
      sendCsv(res, `libro_iva_ventas_alicuotas_${req.query.year}_${req.query.month}.csv`, ventasAlicuotasToCsv(alicuotas));
    } catch (err) {
      next(err);
    }
  },
};
