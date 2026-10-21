import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/asyncHandler";
import { getContadorReport, buildContadorPdf, buildContadorDocx } from "../services/libroIvaDigital/contador.service";

function parseParams(req: Request) {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError("PERIODO_INVALIDO", "Indicá year y month (ej. ?year=2026&month=10)", 400);
  }
  const raw = req.query.arcaConfigId;
  return { year, month, arcaConfigId: typeof raw === "string" && raw ? raw : undefined };
}

const fileName = (year: number, month: number, ext: string) => `reporte_contador_${year}_${String(month).padStart(2, "0")}.${ext}`;

export const contadorController = {
  async getReport(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await getContadorReport(parseParams(req)));
    } catch (err) {
      next(err);
    }
  },

  async downloadPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const params = parseParams(req);
      const buffer = await buildContadorPdf(await getContadorReport(params));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName(params.year, params.month, "pdf")}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  async downloadDocx(req: Request, res: Response, next: NextFunction) {
    try {
      const params = parseParams(req);
      const buffer = await buildContadorDocx(await getContadorReport(params));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName(params.year, params.month, "docx")}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
};
