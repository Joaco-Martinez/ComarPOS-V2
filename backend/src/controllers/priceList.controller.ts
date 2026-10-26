import { Request, Response, NextFunction } from "express";
import { priceListService } from "../services/priceList.service";
import { priceListPdfService } from "../services/priceListPdf.service";
import { getParamAsString } from "../utils/params";

function normalizeBoolean(value: any): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return Boolean(value);
}

function sendServiceResponse(res: Response, result: any, defaultStatus = 200) {
  if (result?.statusCode) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(defaultStatus).json(result);
}

export const priceListController = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const lists = await priceListService.getAll({ includeInactive });
      res.json(lists);
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const list = await priceListService.getById(getParamAsString(req.params.id, "id"));

      if (!list) {
        return res.status(404).json({ message: "Lista de precios no encontrada" });
      }

      res.json(list);
    } catch (err) {
      next(err);
    }
  },

  async pdf(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await priceListPdfService.exportPdf({
        priceListId: getParamAsString(req.params.id, "id"),
        categoryId: typeof req.query.categoryId === "string" && req.query.categoryId ? req.query.categoryId : undefined,
        withImages: req.query.withImages !== "false",
        withStock: req.query.withStock !== "false",
      });

      if (!result) {
        return res.status(404).json({ message: "Lista de precios no encontrada" });
      }

      const slug = result.listName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="lista-de-precios-${slug || "productos"}.pdf"`);
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await priceListService.create({
        name: req.body.name,
        description: req.body.description,
      });

      return sendServiceResponse(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await priceListService.update(getParamAsString(req.params.id, "id"), {
        name: req.body.name,
        description: req.body.description,
        isActive: normalizeBoolean(req.body.isActive),
      });

      return sendServiceResponse(res, result);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await priceListService.remove(getParamAsString(req.params.id, "id"));
      return sendServiceResponse(res, result);
    } catch (err) {
      next(err);
    }
  },

  async setItemPrice(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await priceListService.setItemPrice(
        getParamAsString(req.params.id, "id"),
        getParamAsString(req.params.productId, "productId"),
        {
          price: Number(req.body.price),
          pricePerKg:
            req.body.pricePerKg === undefined || req.body.pricePerKg === null || req.body.pricePerKg === ""
              ? null
              : Number(req.body.pricePerKg),
        },
        { allVariants: req.query.allVariants === "true" }
      );

      return sendServiceResponse(res, result);
    } catch (err) {
      next(err);
    }
  },

  async bulkApply(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await priceListService.bulkApply(
        getParamAsString(req.params.id, "id"),
        Number(req.body.percentage)
      );

      return sendServiceResponse(res, result);
    } catch (err) {
      next(err);
    }
  },

  async removeItem(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await priceListService.removeItem(
        getParamAsString(req.params.id, "id"),
        getParamAsString(req.params.productId, "productId"),
        { allVariants: req.query.allVariants === "true" }
      );

      return sendServiceResponse(res, result);
    } catch (err) {
      next(err);
    }
  },
};
