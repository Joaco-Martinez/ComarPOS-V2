import { Router } from "express";
import { platformAdminController } from "../controllers/platformAdmin.controller";
import { salesLeadController } from "../controllers/salesLead.controller";
import { platformAuthMiddleware } from "../middleware/platformAuth";
import { loginRateLimiter } from "../middleware/rateLimit";

const router = Router();

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

// CRM de prospeccion (doc: visitas a locales en persona) - ver salesLead.service.ts.
router.get("/sales-leads", platformAuthMiddleware, salesLeadController.list);
router.post("/sales-leads", platformAuthMiddleware, salesLeadController.create);
router.patch("/sales-leads/:id", platformAuthMiddleware, salesLeadController.update);
router.delete("/sales-leads/:id", platformAuthMiddleware, salesLeadController.remove);

export default router;
