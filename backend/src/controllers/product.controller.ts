import { Request, Response, NextFunction } from "express";
import { productService } from "../services/product.service";
import multer from "multer";
import path from "path";
import { getParamAsString } from "../utils/params";
import { optionalRangeAR } from "../utils/dateAR";
import { logAudit } from "../utils/auditLogger";

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Formato de imagen inválido. Usá JPG, PNG o WEBP."));
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];

    if (!allowedExtensions.includes(ext)) {
      return cb(new Error("Extensión de imagen inválida. Usá JPG, PNG o WEBP."));
    }

    cb(null, true);
  },
});

const toNumberOrUndefined = (v: any) =>
  v === undefined || v === null || v === "" ? undefined : Number(v);

function parseJsonArray(value: any) {
  if (!value) return undefined;

  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function normalizeBoolean(value: any) {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return Boolean(value);
}

export const productController = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page =
        req.query.page !== undefined ? Number(req.query.page) : undefined;

      const limit =
        req.query.limit !== undefined ? Number(req.query.limit) : undefined;

      const search =
        typeof req.query.search === "string" ? req.query.search : undefined;

      const categoryId =
        typeof req.query.categoryId === "string"
          ? req.query.categoryId
          : undefined;

      const sort =
        typeof req.query.sort === "string" ? req.query.sort : undefined;

      const products = await productService.getAll({
        page,
        limit,
        search,
        categoryId,
        sort,
      });

      res.json(products);
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await productService.getById(
        getParamAsString(req.params.id, "id")
      );

      if (!product) {
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      res.json(product);
    } catch (err) {
      next(err);
    }
  },

  create: [
    upload.single("image"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const newProduct = await productService.create({
          name: req.body.name,
          description: req.body.description,

          type: req.body.type,
          isService: normalizeBoolean(req.body.isService),

          categoryId: req.body.categoryId,
          category: req.body.category,

          price: req.body.price,
          wholesalePrice: req.body.wholesalePrice,
          clientPrice: req.body.clientPrice,
          purchasePrice: req.body.purchasePrice,
          ivaRate: req.body.ivaRate,

          saleUnit: req.body.saleUnit,

          pricePerKg: req.body.pricePerKg,
          clientPricePerKg: req.body.clientPricePerKg,
          wholesalePricePerKg: req.body.wholesalePricePerKg,

          sku: req.body.sku,

          stockLocal: req.body.stockLocal,
          stockDeposito: req.body.stockDeposito,

          stockLocalKg: req.body.stockLocalKg,
          stockDepositoKg: req.body.stockDepositoKg,

          minStock: req.body.minStock,
          minStockDeposito: req.body.minStockDeposito,
          minStockKg: req.body.minStockKg,
          minStockDepositoKg: req.body.minStockDepositoKg,

          file: req.file,

          components: parseJsonArray(req.body.components),
          boxContents: parseJsonArray(req.body.boxContents),
        });

        if ((newProduct as any)?.statusCode) {
          return res
            .status((newProduct as any).statusCode)
            .json({ message: (newProduct as any).message });
        }

        logAudit(req, "CREATE", "Product", (newProduct as any).id, { name: (newProduct as any).name });
        res.status(201).json(newProduct);
      } catch (err) {
        next(err);
      }
    },
  ],

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body ?? {};
      const cleanBody: any = {};

      if (body.name !== undefined) cleanBody.name = String(body.name);

      if (body.description !== undefined) {
        cleanBody.description = String(body.description);
      }

      if (body.type !== undefined) cleanBody.type = body.type;
      if (body.categoryId !== undefined) cleanBody.categoryId = body.categoryId;
      if (body.sku !== undefined) cleanBody.sku = String(body.sku);
      if (body.saleUnit !== undefined) cleanBody.saleUnit = body.saleUnit;

      if (body.imageUrl !== undefined) cleanBody.imageUrl = body.imageUrl;
      if (body.imageId !== undefined) cleanBody.imageId = body.imageId;

      if (body.isActive !== undefined) {
        cleanBody.isActive = normalizeBoolean(body.isActive);
      }

      if (body.isService !== undefined) {
        cleanBody.isService = normalizeBoolean(body.isService);
      }

      if (body.price !== undefined) {
        cleanBody.price = toNumberOrUndefined(body.price);
      }

      if (body.clientPrice !== undefined) {
        cleanBody.clientPrice = toNumberOrUndefined(body.clientPrice);
      }

      if (body.wholesalePrice !== undefined) {
        cleanBody.wholesalePrice = toNumberOrUndefined(body.wholesalePrice);
      }

      if (body.purchasePrice !== undefined) {
        cleanBody.purchasePrice = toNumberOrUndefined(body.purchasePrice);
      }

      if (body.ivaRate !== undefined) {
        cleanBody.ivaRate = toNumberOrUndefined(body.ivaRate);
      }

      if (body.pricePerKg !== undefined) {
        cleanBody.pricePerKg = toNumberOrUndefined(body.pricePerKg);
      }

      if (body.clientPricePerKg !== undefined) {
        cleanBody.clientPricePerKg = toNumberOrUndefined(body.clientPricePerKg);
      }

      if (body.wholesalePricePerKg !== undefined) {
        cleanBody.wholesalePricePerKg = toNumberOrUndefined(body.wholesalePricePerKg);
      }

      if (body.stockLocal !== undefined) {
        cleanBody.stockLocal = toNumberOrUndefined(body.stockLocal);
      }

      if (body.stockDeposito !== undefined) {
        cleanBody.stockDeposito = toNumberOrUndefined(body.stockDeposito);
      }

      if (body.minStock !== undefined) {
        cleanBody.minStock = toNumberOrUndefined(body.minStock);
      }

      if (body.minStockDeposito !== undefined) {
        cleanBody.minStockDeposito = toNumberOrUndefined(body.minStockDeposito);
      }

      if (body.stockLocalKg !== undefined) {
        cleanBody.stockLocalKg = toNumberOrUndefined(body.stockLocalKg);
      }

      if (body.stockDepositoKg !== undefined) {
        cleanBody.stockDepositoKg = toNumberOrUndefined(body.stockDepositoKg);
      }

      if (body.minStockKg !== undefined) {
        cleanBody.minStockKg = toNumberOrUndefined(body.minStockKg);
      }

      if (body.minStockDepositoKg !== undefined) {
        cleanBody.minStockDepositoKg = toNumberOrUndefined(body.minStockDepositoKg);
      }

      const updated = await productService.update(
        getParamAsString(req.params.id, "id"),
        cleanBody
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getParamAsString(req.params.id, "id");
      await productService.delete(id);
      logAudit(req, "DELETE", "Product", id);
      res.json({ message: "Producto eliminado" });
    } catch (err) {
      next(err);
    }
  },

  async transferStock(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, from, quantity } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ message: "No autorizado" });
      }

      const updated = await productService.transferStock(
        productId,
        from,
        Number(quantity),
        userId
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async addStock(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, to, quantity } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ message: "No autorizado" });
      }

      const updated = await productService.addStock(
        productId,
        to,
        Number(quantity),
        userId
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async transferStockKg(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { from, quantityKg } = req.body;

      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ message: "No autorizado" });
      }

      const updated = await productService.transferStockKg(
        getParamAsString(id, "id"),
        from,
        Number(quantityKg),
        userId
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async addStockKg(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { to, quantityKg } = req.body;

      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ message: "No autorizado" });
      }

      const updated = await productService.addStockKg(
        getParamAsString(id, "id"),
        to,
        Number(quantityKg),
        userId
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async updateComponents(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const components = Array.isArray(req.body.components)
        ? req.body.components
        : parseJsonArray(req.body.components);

      if (!Array.isArray(components)) {
        return res.status(400).json({
          message: "Se requiere un array 'components'",
        });
      }

      const result = await productService.updateComponents(
        getParamAsString(id, "id"),
        components
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async getBySku(req: Request, res: Response) {
    try {
      const { sku } = req.params;

      if (!sku) {
        return res.status(400).json({ message: "SKU requerido" });
      }

      const product = await productService.getBySku(
        getParamAsString(sku, "sku")
      );

      if (!product) {
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      return res.status(200).json(product);
    } catch (error) {
      console.error("Error getBySku:", error);
      return res.status(500).json({
        message: "Error interno del servidor",
      });
    }
  },

  async getMovements(req: Request, res: Response, next: NextFunction) {
    try {
      const { start: fromDate, end: toDate } = optionalRangeAR(
        req.query.fromDate as string | undefined,
        req.query.toDate as string | undefined
      );

      const movements = await productService.getMovements({
        productId: req.query.productId as string | undefined,
        userId: req.query.userId as string | undefined,
        fromDate,
        toDate,
      });

      res.json(movements);
    } catch (err) {
      next(err);
    }
  },

  updateImage: [
    upload.single("image"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            message: "Debe enviar una imagen.",
          });
        }

        const updatedProduct = await productService.updateImage(
          getParamAsString(req.params.id, "id"),
          req.file
        );

        res.json({
          message: "Imagen actualizada correctamente",
          content: updatedProduct,
        });
      } catch (err) {
        next(err);
      }
    },
  ],
};