import { Router } from "express";
import { supplierAccountController } from "../controllers/supplierAccount.controller";
import { authMiddleware, requireRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

// Cuenta corriente de PROVEEDORES -- mirror de account.routes.ts (cuenta
// corriente de clientes), montado en app.ts bajo /accounts/suppliers para
// quedar al lado de /accounts/clients/:clientId con la misma forma de URL.
// Gateado por el feature "proveedores" (el mismo que ya gatea el modulo de
// Proveedores en general) en vez de crear un PlanFeatureKey nuevo.
const router = Router();
router.use(authMiddleware);
router.use(requirePlanFeature("proveedores"));

router.get("/movements", supplierAccountController.getMovements);
router.get("/debts", supplierAccountController.getDebts);
router.get("/summary", supplierAccountController.getSummary);

router.get("/:supplierId", supplierAccountController.getSupplierAccount);

router.post("/:supplierId/payment", supplierAccountController.registerPayment);

router.post(
  "/:supplierId/adjustment",
  requireRole("ADMIN"),
  supplierAccountController.createAdjustment
);

export default router;
