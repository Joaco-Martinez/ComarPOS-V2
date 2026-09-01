import { Router } from "express";
import multer from "multer";
import path from "path";
import { storefrontAdminController } from "../controllers/storefrontAdmin.controller";
import { authMiddleware, requireRole, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

const router = Router();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 8 * 1024 * 1024 },
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

function uploadBannerMiddleware(req: any, res: any, next: any) {
  upload.single("banner")(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        err.message = "La imagen no puede superar los 8MB";
      }
      err.status = err.status || 400;
      return next(err);
    }
    next();
  });
}

router.get(
  "/config",
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.getConfig
);

router.put(
  "/config",
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.updateConfig
);

// multer va ANTES que authMiddleware a proposito (mismo motivo que
// tenantLogo.routes.ts/product.routes.ts): el contexto de tenant se pierde
// si corre antes de que multer procese el body multipart/form-data.
router.post(
  "/banner",
  uploadBannerMiddleware,
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.uploadBanner
);

router.delete(
  "/banner",
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.removeBanner
);

// Pedidos: ADMIN y EMPLEADO pueden verlos/procesarlos (operativa del dia a
// dia, igual que el resto de las ventas) - solo la configuracion/banner de
// arriba es exclusiva de ADMIN.
router.get(
  "/orders",
  authMiddleware,
  requireAnyRole(["ADMIN", "EMPLEADO"]),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.getOrders
);

router.get(
  "/orders/:id",
  authMiddleware,
  requireAnyRole(["ADMIN", "EMPLEADO"]),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.getOrderById
);

router.post(
  "/orders/:id/confirm-transfer",
  authMiddleware,
  requireAnyRole(["ADMIN", "EMPLEADO"]),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.confirmTransfer
);

router.post(
  "/orders/:id/reject-transfer",
  authMiddleware,
  requireAnyRole(["ADMIN", "EMPLEADO"]),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.rejectTransfer
);

router.post(
  "/orders/:id/cancel",
  authMiddleware,
  requireAnyRole(["ADMIN", "EMPLEADO"]),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.cancelOrder
);

router.post(
  "/orders/:id/convert-to-sale",
  authMiddleware,
  requireAnyRole(["ADMIN", "EMPLEADO"]),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.convertToSale
);

// Credenciales de Mercado Pago: exclusivo de ADMIN (mismo criterio que
// config/banner, no operativa del dia a dia).
router.get(
  "/mp-config",
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.getMpConfig
);

router.put(
  "/mp-config",
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.saveMpConfig
);

router.delete(
  "/mp-config",
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("tiendaOnline"),
  storefrontAdminController.removeMpConfig
);

export default router;
