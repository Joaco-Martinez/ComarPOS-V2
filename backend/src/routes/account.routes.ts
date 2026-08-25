import { Router } from "express";
import { accountController } from "../controllers/account.controller";
import { authMiddleware, requireRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

const router = Router();
router.use(authMiddleware);
router.use(requirePlanFeature("cuentasCorrientes"));

router.get("/movements", accountController.getMovements);
router.get("/debtors", accountController.getDebtors);

router.get("/clients/:clientId", accountController.getClientAccount);

router.post("/clients/:clientId/payment", accountController.registerPayment);

router.post(
  "/clients/:clientId/adjustment",
  requireRole("ADMIN"),
  accountController.createAdjustment
);

router.patch(
  "/clients/:clientId/config",
  requireRole("ADMIN"),
  accountController.updateClientAccountConfig
);

export default router;