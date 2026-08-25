import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { promotionController } from "../controllers/promotion.controller";

const router = Router();
router.use(authMiddleware);
router.use(requirePlanFeature("promociones"));

router.get("/", promotionController.getAll);
router.get("/active", promotionController.getActive);
router.get("/:id", promotionController.getById);
router.post("/", requireAnyRole(["ADMIN"]), promotionController.create);
router.post("/apply", promotionController.applyToCart);
router.put("/:id", requireAnyRole(["ADMIN"]), promotionController.update);
router.post("/:id/deactivate", requireAnyRole(["ADMIN"]), promotionController.deactivate);
router.delete("/:id", requireAnyRole(["ADMIN"]), promotionController.remove);

export default router;
