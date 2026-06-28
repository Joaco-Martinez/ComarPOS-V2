import { Router } from "express";
import multer from "multer";
import path from "path";
import { tenantLogoController } from "../controllers/tenantLogo.controller";
import { authMiddleware, requireRole } from "../middleware/auth";

const router = Router();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg", "image/svg+xml"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".svg"];

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const err: any = new Error("Formato de imagen inválido. Usá JPG, PNG, WEBP o SVG.");
      err.status = 400;
      return cb(err);
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      const err: any = new Error("Extensión de imagen inválida. Usá JPG, PNG, WEBP o SVG.");
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

router.post(
  "/logo",
  authMiddleware,
  requireRole("ADMIN"),
  uploadLogoMiddleware,
  tenantLogoController.upload
);

router.get("/logo/:businessId", tenantLogoController.get);

router.delete(
  "/logo/:businessId",
  authMiddleware,
  requireRole("ADMIN"),
  tenantLogoController.remove
);

export default router;
