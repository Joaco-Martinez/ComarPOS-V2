/**
 * Rutas publicas de la tienda online, montadas en app.ts como
 * app.use("/tienda/:tenantSlug", storefrontTenantMiddleware, storefrontRouter)
 * - storefrontTenantMiddleware ya resolvio el tenant real (no el default) y
 * corrio runWithTenant() antes de llegar acá, asi que todo lo de abajo
 * funciona igual que el resto del sistema (tenantScope()/currentTenantId()).
 *
 * El catalogo (categorias/productos) reusa catalogController tal cual, sin
 * duplicar logica - ya es tenant-scoped internamente.
 */
import { Router } from "express";
import multer from "multer";
import path from "path";
import { storefrontController } from "../controllers/storefront.controller";
import { catalogController } from "../controllers/catalog.controller";
import { optionalStorefrontAuth } from "../middleware/storefrontTenant";
import { loginRateLimiter } from "../middleware/rateLimit";

const router = Router({ mergeParams: true });

router.get("/store", storefrontController.getStore);
router.get("/catalog/categories", catalogController.getCategories);
router.get("/catalog/products", optionalStorefrontAuth, catalogController.getProducts);

// Cuenta obligatoria para comprar: alta de cliente propia de esta tienda
// (tenantId de la URL, no el default) - login/logout/me se resuelven con
// los endpoints globales /auth/*, que ya no dependen del tenant para operar
// (email global unico).
router.post("/auth/register", loginRateLimiter, storefrontController.registerCustomer);

router.post("/orders", optionalStorefrontAuth, storefrontController.createOrder);
router.get("/orders/:publicToken", storefrontController.getOrderByToken);

// El comprobante puede ser una foto o un PDF (recibo bancario).
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg", "application/pdf"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

const uploadProof = multer({
  dest: "uploads/",
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const err: any = new Error("Formato inválido. Usá JPG, PNG, WEBP o PDF.");
      err.status = 400;
      return cb(err);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      const err: any = new Error("Extensión inválida. Usá JPG, PNG, WEBP o PDF.");
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

function uploadProofMiddleware(req: any, res: any, next: any) {
  uploadProof.single("proof")(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") err.message = "El archivo no puede superar los 8MB";
      err.status = err.status || 400;
      return next(err);
    }
    next();
  });
}

router.post("/orders/:publicToken/transfer-proof", uploadProofMiddleware, storefrontController.uploadTransferProof);

export default router;
