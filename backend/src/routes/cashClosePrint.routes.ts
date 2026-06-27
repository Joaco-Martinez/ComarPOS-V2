import { Router } from "express";
import { printCashCloseController } from "../controllers/cashClosePrint.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

// POST /cash-close/print
router.post("/print", printCashCloseController);

export default router;
