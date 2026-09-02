import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { purchaseOrderController } from "../controllers/purchaseOrder.controller";

const router = Router();
router.use(authMiddleware);
router.use(requirePlanFeature("ordenesCompra"));

router.get("/", purchaseOrderController.getAll);
router.get("/:id", purchaseOrderController.getById);
router.get("/:id/pdf", purchaseOrderController.getPdf);
router.post("/", requireAnyRole(["ADMIN", "EMPLEADO"]), purchaseOrderController.create);
router.patch("/:id/status", requireAnyRole(["ADMIN"]), purchaseOrderController.updateStatus);
router.post("/:id/receive", requireAnyRole(["ADMIN", "EMPLEADO"]), purchaseOrderController.receiveItems);
router.delete("/:id", requireAnyRole(["ADMIN"]), purchaseOrderController.remove);

export default router;
