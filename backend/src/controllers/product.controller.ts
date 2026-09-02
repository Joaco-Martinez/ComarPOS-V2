import { Request, Response, NextFunction } from "express";
import { productService } from "../services/product.service";
import multer from "multer";
import path from "path";
import { getParamAsString } from "../utils/params";
import { optionalRangeAR } from "../utils/dateAR";
import { logAudit } from "../utils/auditLogger";

// Se exporta para que product.routes.ts la monte ANTES de authMiddleware
// (ver comentario ahi) - no antojadizo, es la forma de evitar que el
// contexto de tenant (AsyncLocalStorage) se pierda en requests
// multipart/form-data sin ningun archivo adjunto.
export const upload = multer({
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

  // El middleware `upload.single("image")` se monta en product.routes.ts
  // ANTES de este handler (y antes de authMiddleware, ver comentario ahi).
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const newProduct = await productService.create({
        name: req.body.name,
        description: req.body.description,

        type: req.body.type,
        isService: normalizeBoolean(req.body.isService),
        unlimitedStock: normalizeBoolean(req.body.unlimitedStock),

        categoryId: req.body.categoryId,
        category: req.body.category,
        supplierId: req.body.supplierId,

        price: req.body.price,
        wholesalePrice: req.body.wholesalePrice,
        purchasePrice: req.body.purchasePrice,
        ivaRate: req.body.ivaRate,

        saleUnit: req.body.saleUnit,

        pricePerKg: req.body.pricePerKg,
        wholesalePricePerKg: req.body.wholesalePricePerKg,

        sku: req.body.sku,

        file: req.file,

        components: parseJsonArray(req.body.components),
        boxContents: parseJsonArray(req.body.boxContents),
        initialStock: parseJsonArray(req.body.initialStock),
        userId: (req as any).user?.id,
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
      if (body.supplierId !== undefined) cleanBody.supplierId = body.supplierId;
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

      if (body.unlimitedStock !== undefined) {
        cleanBody.unlimitedStock = normalizeBoolean(body.unlimitedStock);
      }

      if (body.price !== undefined) {
        cleanBody.price = toNumberOrUndefined(body.price);
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

      if (body.wholesalePricePerKg !== undefined) {
        cleanBody.wholesalePricePerKg = toNumberOrUndefined(body.wholesalePricePerKg);
      }

      let updated = await productService.update(
        getParamAsString(req.params.id, "id"),
        cleanBody
      );

      // El form de edicion manda la imagen nueva (si el usuario eligio una)
      // en el mismo request que el resto de los campos - ver `upload.single`
      // montado en product.routes.ts antes de authMiddleware.
      if (req.file) {
        updated = await productService.updateImage(updated.id, req.file);
      }

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
      const { productId, fromLocationId, toLocationId, quantity, reason } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ message: "No autorizado" });
      }

      const updated = await productService.transferStock(
        productId,
        fromLocationId,
        toLocationId,
        Number(quantity),
        userId,
        reason
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async addStock(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, businessLocationId, quantity, reason } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ message: "No autorizado" });
      }

      const updated = await productService.addStock(
        productId,
        businessLocationId,
        Number(quantity),
        userId,
        reason
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async transferStockKg(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { fromLocationId, toLocationId, quantityKg, reason } = req.body;

      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ message: "No autorizado" });
      }

      const updated = await productService.transferStockKg(
        getParamAsString(id, "id"),
        fromLocationId,
        toLocationId,
        Number(quantityKg),
        userId,
        reason
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async addStockKg(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { businessLocationId, quantityKg, reason } = req.body;

      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ message: "No autorizado" });
      }

      const updated = await productService.addStockKg(
        getParamAsString(id, "id"),
        businessLocationId,
        Number(quantityKg),
        userId,
        reason
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async setStockMin(req: Request, res: Response, next: NextFunction) {
    try {
      const { id, businessLocationId } = req.params;
      const { minQuantity, minQuantityKg } = req.body;

      const updated = await productService.setStockMin(
        getParamAsString(id, "id"),
        getParamAsString(businessLocationId, "businessLocationId"),
        minQuantity === undefined || minQuantity === null || minQuantity === "" ? null : Number(minQuantity),
        minQuantityKg === undefined || minQuantityKg === null || minQuantityKg === "" ? null : Number(minQuantityKg)
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

  // El middleware `upload.single("image")` se monta en product.routes.ts
  // ANTES de este handler (y antes de authMiddleware, ver comentario ahi).
  async updateImage(req: Request, res: Response, next: NextFunction) {
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
};