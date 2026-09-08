import { Router } from "express";
import multer from "multer";
import path from "path";
import { platformAdminController } from "../controllers/platformAdmin.controller";
import { salesLeadController } from "../controllers/salesLead.controller";
import { printboxFirmwareController } from "../controllers/printboxFirmware.controller";
import { platformAuthMiddleware } from "../middleware/platformAuth";
import { loginRateLimiter } from "../middleware/rateLimit";

const router = Router();

// El .bin mas grande de las dos variantes hoy ronda 1.2MB (ver
// printbox/README.md) -- 4MB de margen alcanza y sobra, y de paso pone un
// techo sensato aunque alguien suba cualquier cosa por error.
const uploadFirmware = multer({
  dest: "uploads/",
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".bin") {
      const err: any = new Error("El firmware tiene que ser un archivo .bin (el que genera `pio run` en printbox/.pio/build/<env>/firmware.bin).");
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

function uploadFirmwareMiddleware(req: any, res: any, next: any) {
  uploadFirmware.single("firmware")(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") err.message = "El .bin no puede superar los 4MB";
      err.status = err.status || 400;
      return next(err);
    }
    next();
  });
}

router.post("/auth/login", loginRateLimiter, platformAdminController.login);
router.post("/auth/logout", platformAdminController.logout);
router.get("/auth/me", platformAuthMiddleware, platformAdminController.me);

router.get("/tenants", platformAuthMiddleware, platformAdminController.listTenants);
router.get("/tenants/:id", platformAuthMiddleware, platformAdminController.getTenantById);
router.patch(
  "/tenants/:id/subscription",
  platformAuthMiddleware,
  platformAdminController.updateSubscription
);
router.post("/tenants", platformAuthMiddleware, platformAdminController.createTenant);
// Cuenta demo de 7 dias (distinta de POST /tenants, que crea gratis pero
// ACTIVA sin trial) - ver platformTenant.service.ts#createDemoTenant. Sin
// rate limiter propio: lo llama un super-admin autenticado, no un visitante
// anonimo (a diferencia de /trial-signup).
router.post("/tenants/demo", platformAuthMiddleware, platformAdminController.createDemoTenant);
// Borrado REAL en cascada, no reversible - ver
// platformTenant.service.ts#deleteTenant.
router.delete("/tenants/:id", platformAuthMiddleware, platformAdminController.deleteTenant);
router.post(
  "/tenants/:id/impersonate",
  platformAuthMiddleware,
  platformAdminController.impersonateTenant
);
router.patch(
  "/tenants/:id/feature-overrides",
  platformAuthMiddleware,
  platformAdminController.updateTenantFeatureOverride
);
router.patch(
  "/tenants/:id/pos-checkout-modal",
  platformAuthMiddleware,
  platformAdminController.updateTenantPosCheckoutModal
);

router.get("/mp-plans", platformAuthMiddleware, platformAdminController.listMpPlans);
router.post("/mp-plans/sync", platformAuthMiddleware, platformAdminController.syncMpPlans);

router.get("/plans", platformAuthMiddleware, platformAdminController.listPlans);
router.patch(
  "/plan-features/:planId",
  platformAuthMiddleware,
  platformAdminController.updatePlanFeature
);
router.patch(
  "/plan-price/:planId",
  platformAuthMiddleware,
  platformAdminController.updatePlanPrice
);

// Catalogo de firmware OTA del PrintBox (global, ver
// printboxFirmware.service.ts) -- publicar sube el .bin compilado a mano
// con `pio run` y lo registra; los ESP32 emparejados lo descubren solos via
// GET /printbox/devices/:id/firmware-check.
router.get("/printbox-firmware", platformAuthMiddleware, printboxFirmwareController.list);
router.post(
  "/printbox-firmware",
  platformAuthMiddleware,
  uploadFirmwareMiddleware,
  printboxFirmwareController.publish
);
router.delete("/printbox-firmware/:id", platformAuthMiddleware, printboxFirmwareController.remove);

// CRM de prospeccion (doc: visitas a locales en persona) - ver salesLead.service.ts.
router.get("/sales-leads", platformAuthMiddleware, salesLeadController.list);
router.post("/sales-leads", platformAuthMiddleware, salesLeadController.create);
router.patch("/sales-leads/:id", platformAuthMiddleware, salesLeadController.update);
router.delete("/sales-leads/:id", platformAuthMiddleware, salesLeadController.remove);

export default router;
