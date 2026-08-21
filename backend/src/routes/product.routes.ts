import { Router } from "express";
import { productController, upload } from "../controllers/product.controller";
import { authMiddleware, requireRole } from "../middleware/auth";

const router = Router();

// Movimientos
router.get("/movements", authMiddleware, productController.getMovements);

// Stock UNIT
router.post("/transfer", authMiddleware, productController.transferStock);
router.post("/add-stock", authMiddleware, productController.addStock);

// Stock KG
router.post(
  "/:id/transfer-kg",
  authMiddleware,
  requireRole("ADMIN"),
  productController.transferStockKg
);

router.post(
  "/:id/add-stock-kg",
  authMiddleware,
  requireRole("ADMIN"),
  productController.addStockKg
);

// SKU
router.get("/sku/:sku", authMiddleware, productController.getBySku);

// CRUD
router.get("/", authMiddleware, productController.getAll);

// multer va ANTES que authMiddleware a proposito: el contexto de tenant que
// setea authMiddleware (AsyncLocalStorage, ver src/context/tenantContext.ts)
// se pierde en requests multipart/form-data que no traen ningun archivo -
// busboy/multer terminan de leer esos campos por fuera del async context que
// arma authMiddleware si multer corre despues. Corriendo multer primero, el
// contexto que arma authMiddleware ya no tiene ningun stream/callback de
// multer atravesandolo y llega intacto al controller/service.
router.post(
  "/",
  upload.single("image"),
  authMiddleware,
  requireRole("ADMIN"),
  productController.create
);

// Producto compuesto: definir/actualizar componentes de una promo
router.put(
  "/:id/components",
  authMiddleware,
  requireRole("ADMIN"),
  productController.updateComponents
);

// Actualizar imagen (multer antes de authMiddleware, ver comentario en POST "/")
router.patch(
  "/:id/image",
  upload.single("image"),
  authMiddleware,
  requireRole("ADMIN"),
  productController.updateImage
);

// Dinámicas
router.get("/:id", authMiddleware, productController.getById);

// multer antes de authMiddleware (ver comentario en POST "/"): el form de
// edicion manda FormData siempre, con o sin imagen nueva.
router.put(
  "/:id",
  upload.single("image"),
  authMiddleware,
  requireRole("ADMIN"),
  productController.update
);

router.delete(
  "/:id",
  authMiddleware,
  requireRole("ADMIN"),
  productController.delete
);

export default router;