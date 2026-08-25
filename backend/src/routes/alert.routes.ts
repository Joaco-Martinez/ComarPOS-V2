import { Router } from "express";
import { getAlerts, checkAllStockAlerts, resolveAlert } from "../controllers/alert.controller";
import { authMiddleware } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

const router = Router();

router.use(authMiddleware);
router.use(requirePlanFeature("alertas"));

router.get("/", getAlerts);
router.patch("/:id/resolve", resolveAlert);
router.post("/check-stock", checkAllStockAlerts);

export default router;