import { Router } from "express";
import { purchaseController } from "../controllers/purchase.controller";
import { authMiddleware, requireRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

const router = Router();
router.use(authMiddleware);
router.use(requirePlanFeature("compras"));

router.get("/", purchaseController.getAll);
router.get("/:id", purchaseController.getById);

router.post("/", requireRole("ADMIN"), purchaseController.create);

router.patch("/:id/cancel", requireRole("ADMIN"), purchaseController.cancel);

export default router;
