import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { exportController } from "../controllers/export.controller";

const router = Router();

router.use(authMiddleware);
router.use(requireAnyRole(["ADMIN", "CONTADOR"]));

// GET /exports/sales?fromDate=&toDate=&status=
router.get("/sales", exportController.sales);

// GET /exports/inventory
router.get("/inventory", exportController.inventory);

// GET /exports/purchases?fromDate=&toDate=
router.get("/purchases", exportController.purchases);

// GET /exports/finance?fromDate=&toDate=
router.get("/finance", exportController.finance);

export default router;
