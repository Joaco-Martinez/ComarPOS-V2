import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { recurringExpenseController } from "../controllers/recurringExpense.controller";

const router = Router();
router.use(authMiddleware, requireAnyRole(["ADMIN", "CONTADOR"]));

router.get("/", recurringExpenseController.getAll);
router.post("/", recurringExpenseController.create);
router.put("/:id", recurringExpenseController.update);
router.delete("/:id", recurringExpenseController.remove);
router.post("/process", recurringExpenseController.processDue);

export default router;
