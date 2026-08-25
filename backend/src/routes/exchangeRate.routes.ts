import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { exchangeRateController } from "../controllers/exchangeRate.controller";

const router = Router();
router.use(authMiddleware);
router.use(requirePlanFeature("tipoCambio"));

router.get("/", exchangeRateController.getAll);
router.get("/current", exchangeRateController.getCurrent);
router.get("/history", requireAnyRole(["ADMIN", "CONTADOR"]), exchangeRateController.getHistory);
router.get("/convert", exchangeRateController.convert);
router.post("/", requireAnyRole(["ADMIN", "CONTADOR"]), exchangeRateController.addRate);
router.delete("/:id", requireAnyRole(["ADMIN", "CONTADOR"]), exchangeRateController.remove);

export default router;
