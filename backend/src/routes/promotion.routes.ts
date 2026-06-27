import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { promotionController } from "../controllers/promotion.controller";

const router = Router();
router.use(authMiddleware);

router.get("/", promotionController.getAll);
router.get("/active", promotionController.getActive);
router.get("/:id", promotionController.getById);
router.post("/", requireAnyRole(["ADMIN"]), promotionController.create);
router.post("/apply", promotionController.applyToCart);
router.put("/:id", requireAnyRole(["ADMIN"]), promotionController.update);
router.post("/:id/deactivate", requireAnyRole(["ADMIN"]), promotionController.deactivate);

export default router;
