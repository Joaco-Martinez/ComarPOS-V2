import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { returnController } from "../controllers/return.controller";

const router = Router();

router.use(authMiddleware);
router.use(requirePlanFeature("devoluciones"));

// POST /returns/:saleId — process a full return of a completed sale
router.post("/:saleId", requireAnyRole(["ADMIN", "EMPLEADO"]), returnController.processReturn);

// GET /returns — list cancelled (returned) sales
router.get("/", requireAnyRole(["ADMIN", "CONTADOR"]), returnController.getReturns);

export default router;
