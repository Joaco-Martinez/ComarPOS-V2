import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { auditLogController } from "../controllers/auditLog.controller";

const router = Router();
router.use(authMiddleware, requireRole("ADMIN"));
router.use(requirePlanFeature("auditoria"));

router.get("/", auditLogController.getAll);
router.get("/:entity/:entityId", auditLogController.getEntityHistory);

export default router;
