import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { loyaltyController } from "../controllers/loyalty.controller";

const router = Router();
router.use(authMiddleware);

router.get("/estimate", loyaltyController.estimatePoints);
router.get("/:clientId", loyaltyController.getAccount);
router.post("/:clientId/earn", loyaltyController.earn);
router.post("/:clientId/redeem", loyaltyController.redeem);
router.post("/:clientId/adjust", requireAnyRole(["ADMIN"]), loyaltyController.adjust);
router.post("/expire", requireAnyRole(["ADMIN"]), loyaltyController.expireOld);

export default router;
