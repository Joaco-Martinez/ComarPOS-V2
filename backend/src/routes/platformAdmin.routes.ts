import { Router } from "express";
import { platformAdminController } from "../controllers/platformAdmin.controller";
import { platformAuthMiddleware } from "../middleware/platformAuth";

const router = Router();

router.post("/auth/login", platformAdminController.login);
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

export default router;
