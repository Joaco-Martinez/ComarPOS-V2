import { Request, Response, NextFunction } from "express";
import { exportService } from "../services/export.service";
import { SaleStatus } from "@prisma/client";

function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

function parseDate(value: any): Date | undefined {
  if (!value || typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function sendExcel(res: Response, buffer: ArrayBuffer, filename: string) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}

export const exportController = {
  sales: wrap(async (req, res) => {
    const fromDate = parseDate(req.query.fromDate);
    const toDate = parseDate(req.query.toDate);
    const status = req.query.status as SaleStatus | undefined;

    const buffer = await exportService.exportSales({ fromDate, toDate, status });
    const date = new Date().toISOString().slice(0, 10);
    sendExcel(res, buffer, `ventas_${date}.xlsx`);
  }),

  inventory: wrap(async (_req, res) => {
    const buffer = await exportService.exportInventory();
    const date = new Date().toISOString().slice(0, 10);
    sendExcel(res, buffer, `inventario_${date}.xlsx`);
  }),

  purchases: wrap(async (req, res) => {
    const fromDate = parseDate(req.query.fromDate);
    const toDate = parseDate(req.query.toDate);

    const buffer = await exportService.exportPurchases({ fromDate, toDate });
    const date = new Date().toISOString().slice(0, 10);
    sendExcel(res, buffer, `compras_${date}.xlsx`);
  }),

  finance: wrap(async (req, res) => {
    const fromDate = parseDate(req.query.fromDate);
    const toDate = parseDate(req.query.toDate);

    const buffer = await exportService.exportFinance({ fromDate, toDate });
    const date = new Date().toISOString().slice(0, 10);
    sendExcel(res, buffer, `finanzas_${date}.xlsx`);
  }),
};
