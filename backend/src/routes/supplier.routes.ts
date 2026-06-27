import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { supplierController } from "../controllers/supplier.controller";

const router = Router();
router.use(authMiddleware);

router.get("/", requireAnyRole(["ADMIN", "CONTADOR"]), supplierController.getAll);
router.get("/:id", requireAnyRole(["ADMIN", "CONTADOR"]), supplierController.getById);
router.get("/:id/purchase-history", requireAnyRole(["ADMIN", "CONTADOR"]), supplierController.getPurchaseHistory);
router.post("/", requireAnyRole(["ADMIN"]), supplierController.create);
router.put("/:id", requireAnyRole(["ADMIN"]), supplierController.update);
router.delete("/:id", requireAnyRole(["ADMIN"]), supplierController.remove);

export default router;
