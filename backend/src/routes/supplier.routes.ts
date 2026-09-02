import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { supplierController } from "../controllers/supplier.controller";

const router = Router();
router.use(authMiddleware);

// GET queda sin gatear: Compras y Ordenes de Compra lo usan como dato de
// referencia (elegir proveedor) aunque el modulo "Proveedores" (crear/
// editar/eliminar) este apagado para ese plan.
router.get("/", requireAnyRole(["ADMIN", "CONTADOR"]), supplierController.getAll);
router.get("/:id", requireAnyRole(["ADMIN", "CONTADOR"]), supplierController.getById);
router.get("/:id/purchase-history", requireAnyRole(["ADMIN", "CONTADOR"]), supplierController.getPurchaseHistory);
router.post("/", requireAnyRole(["ADMIN"]), requirePlanFeature("proveedores"), supplierController.create);
router.put("/:id", requireAnyRole(["ADMIN"]), requirePlanFeature("proveedores"), supplierController.update);
router.delete("/:id", requireAnyRole(["ADMIN"]), requirePlanFeature("proveedores"), supplierController.remove);
router.post(
  "/:id/bulk-price-update",
  requireAnyRole(["ADMIN"]),
  requirePlanFeature("proveedores"),
  supplierController.bulkPriceUpdate
);

export default router;
