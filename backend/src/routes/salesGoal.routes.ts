import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { salesGoalController } from "../controllers/salesGoal.controller";

const router = Router();
router.use(authMiddleware);

router.get("/", salesGoalController.getAll);
router.get("/:id", salesGoalController.getById);
router.get("/:id/progress", salesGoalController.getProgress);
router.post("/", requireAnyRole(["ADMIN"]), salesGoalController.create);
router.put("/:id", requireAnyRole(["ADMIN"]), salesGoalController.update);
router.delete("/:id", requireAnyRole(["ADMIN"]), salesGoalController.remove);

export default router;
