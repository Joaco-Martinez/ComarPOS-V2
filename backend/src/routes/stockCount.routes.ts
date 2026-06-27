import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { stockCountController } from "../controllers/stockCount.controller";

const router = Router();
router.use(authMiddleware);

router.get("/", requireAnyRole(["ADMIN", "CONTADOR"]), stockCountController.getHistory);
router.get("/:id", stockCountController.getById);
router.post("/", stockCountController.start);
router.put("/:id/items/:productId", stockCountController.updateItem);
router.post("/:id/complete", stockCountController.complete);
router.post("/:id/cancel", stockCountController.cancel);

export default router;
