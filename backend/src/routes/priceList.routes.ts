import { Router } from "express";
import { priceListController } from "../controllers/priceList.controller";
import { authMiddleware, requireRole } from "../middleware/auth";

const router = Router();

router.get("/", authMiddleware, priceListController.getAll);
router.get("/:id", authMiddleware, priceListController.getById);

router.post("/", authMiddleware, requireRole("ADMIN"), priceListController.create);
router.put("/:id", authMiddleware, requireRole("ADMIN"), priceListController.update);
router.delete("/:id", authMiddleware, requireRole("ADMIN"), priceListController.remove);

router.post(
  "/:id/bulk-apply",
  authMiddleware,
  requireRole("ADMIN"),
  priceListController.bulkApply
);

router.put(
  "/:id/items/:productId",
  authMiddleware,
  requireRole("ADMIN"),
  priceListController.setItemPrice
);
router.delete(
  "/:id/items/:productId",
  authMiddleware,
  requireRole("ADMIN"),
  priceListController.removeItem
);

export default router;
