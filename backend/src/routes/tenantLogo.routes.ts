import { Router } from "express";
import multer from "multer";
import path from "path";
import { tenantLogoController } from "../controllers/tenantLogo.controller";
import { authMiddleware, requireRole } from "../middleware/auth";

const router = Router();

// SVG excluido a propósito: puede llevar <script> embebido (XSS) si se sirve
// directo al navegador.
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const err: any = new Error("Formato de imagen inválido. Usá JPG, PNG o WEBP.");
      err.status = 400;
      return cb(err);
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      const err: any = new Error("Extensión de imagen inválida. Usá JPG, PNG o WEBP.");
      err.status = 400;
      return cb(err);
    }

    cb(null, true);
  },
});

function uploadLogoMiddleware(req: any, res: any, next: any) {
  upload.single("logo")(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        err.message = "La imagen no puede superar los 5MB";
      }
      err.status = err.status || 400;
      return next(err);
    }
    next();
  });
}

// uploadLogoMiddleware (multer) va ANTES que authMiddleware a proposito: el
// contexto de tenant que arma authMiddleware (AsyncLocalStorage, ver
// src/context/tenantContext.ts) se pierde si corre antes que multer procese
// el body multipart/form-data - mismo caso que product.routes.ts.
router.post(
  "/logo",
  uploadLogoMiddleware,
  authMiddleware,
  requireRole("ADMIN"),
  tenantLogoController.upload
);

router.get("/logo/:businessId", tenantLogoController.get);
router.get("/logo/:businessId/escpos", tenantLogoController.getEscposRaster);

router.delete(
  "/logo/:businessId",
  authMiddleware,
  requireRole("ADMIN"),
  tenantLogoController.remove
);

export default router;
