import { Request, Response, NextFunction } from "express";
import { financeService } from "../services/finance.service";
import { monthRangeAR, optionalRangeAR, parseDateInputAR, rangeAR } from "../utils/dateAR";
import { getParamAsString } from "../utils/params";
export const financeController = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await financeService.getAll());
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Si te mandan date string desde el front, lo parseamos
      const body: any = { ...req.body };
      if (body.date && typeof body.date === "string") {
        body.date = parseDateInputAR(body.date);
      }

      const updated = await financeService.update(getParamAsString(id, "id"), body);
      res.json(updated);
    } catch (error: any) {
      // Prisma: registro no encontrado => P2025
      if (error?.code === "P2025") {
        return res.status(404).json({ error: "Registro financiero no encontrado" });
      }
      res.status(500).json({ error: error.message });
    }
  },

  async remove(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const deleted = await financeService.remove(getParamAsString(id, "id"));
      res.json({ ok: true, deleted });
    } catch (error: any) {
      if (error?.code === "P2025") {
        return res.status(404).json({ error: "Registro financiero no encontrado" });
      }
      res.status(500).json({ error: error.message });
    }
  },

  async registerCreditNote(req: Request, res: Response) {
    try {
      const { amount, description = "Nota de crédito" } = req.body;
      const userId = (req as any).user?.id || "unknown";

      const financeEntry = await financeService.registerCreditNote(
        amount,
        description,
        userId
      );

      res.json(financeEntry);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body: any = { ...req.body };

      if (body.date && typeof body.date === "string") {
        body.date = parseDateInputAR(body.date);
      }

      res.status(201).json(await financeService.create(body));
    } catch (err) {
      next(err);
    }
  },

  async getIncomeByMonth(req: Request, res: Response, next: NextFunction) {
    try {
      const { year, month } = req.query;
      res.json(await financeService.getIncomeByMonth(Number(year), Number(month)));
    } catch (err) {
      next(err);
    }
  },

  async getIncomeByYear(req: Request, res: Response, next: NextFunction) {
    try {
      const { year } = req.query;
      res.json(await financeService.getIncomeByYear(Number(year)));
    } catch (err) {
      next(err);
    }
  },

  async getIncomeByWeek(req: Request, res: Response, next: NextFunction) {
    try {
      const { year, month, day } = req.query;
      res.json(
        await financeService.getIncomeByWeek(
          Number(year),
          Number(month),
          Number(day)
        )
      );
    } catch (err) {
      next(err);
    }
  },

  async getTopProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const { limit } = req.query;
      res.json(await financeService.getTopProducts(Number(limit) || 5));
    } catch (err) {
      next(err);
    }
  },

  async getWorstProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const { limit } = req.query;
      res.json(await financeService.getWorstProducts(Number(limit) || 5));
    } catch (err) {
      next(err);
    }
  },

  async getIncomeByCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to } = req.query;
      const { start: fromDate, end: toDate } = rangeAR(from as string, to as string);
      res.json(await financeService.getIncomeByCategory(fromDate, toDate));
    } catch (err) {
      next(err);
    }
  },

  async getBestProductMonth(req: Request, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.query;
      const { start: startDate, end: endDate } = monthRangeAR(Number(year), Number(month));
      const product = await financeService.getProductsRange(startDate, endDate, "desc");
      res.json(product[0] ?? null);
    } catch (err) {
      next(err);
    }
  },

  async getWorstProductMonth(req: Request, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.query;
      const { start: startDate, end: endDate } = monthRangeAR(Number(year), Number(month));
      const product = await financeService.getProductsRange(startDate, endDate, "asc");
      res.json(product[0] ?? null);
    } catch (err) {
      next(err);
    }
  },

  async getTopProductsInRange(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to, limit } = req.query;
      const { start: fromDate, end: toDate } = optionalRangeAR(
        from as string | undefined,
        to as string | undefined
      );
      res.json(
        await financeService.getTopProductsInRange(fromDate, toDate, Number(limit) || 5)
      );
    } catch (err) {
      next(err);
    }
  },

  async exportExcel(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to } = req.query;
      const { start: fromDate, end: toDate } = rangeAR(from as string, to as string);
      const buffer = await financeService.exportFinanceReport(fromDate, toDate);

      res.setHeader("Content-Disposition", "attachment; filename=reporte.xlsx");
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  async exportPDF(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to } = req.query;
      const { start: fromDate, end: toDate } = rangeAR(from as string, to as string);
      await financeService.exportFinanceReportPDF(res, fromDate, toDate);
    } catch (err) {
      next(err);
    }
  },
};
