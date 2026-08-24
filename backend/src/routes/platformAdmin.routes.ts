import { Router } from "express";
import { platformAdminController } from "../controllers/platformAdmin.controller";
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

router.get("/mp-plans", platformAuthMiddleware, platformAdminController.listMpPlans);
router.post("/mp-plans/sync", platformAuthMiddleware, platformAdminController.syncMpPlans);

export default router;
