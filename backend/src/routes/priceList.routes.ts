import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { priceListController } from "../controllers/priceList.controller";

const router = Router();
router.use(authMiddleware);

router.get("/", priceListController.getAll);
router.get("/:id", priceListController.getById);
router.post("/", requireAnyRole(["ADMIN"]), priceListController.create);
router.put("/:id", requireAnyRole(["ADMIN"]), priceListController.update);
router.delete("/:id", requireAnyRole(["ADMIN"]), priceListController.remove);
router.put("/:id/items", requireAnyRole(["ADMIN"]), priceListController.setAllItems);
router.post("/:id/items", requireAnyRole(["ADMIN"]), priceListController.upsertItem);
router.delete("/:id/items/:productId", requireAnyRole(["ADMIN"]), priceListController.removeItem);
router.put("/clients/:clientId", requireAnyRole(["ADMIN"]), priceListController.assignToClient);
router.get("/clients/:clientId/price/:productId", priceListController.getPriceForClient);

export default router;
