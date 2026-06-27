import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { cashSessionController } from "../controllers/cashSession.controller";

const router = Router();
router.use(authMiddleware);

router.get("/", requireAnyRole(["ADMIN", "CONTADOR"]), cashSessionController.getHistory);
router.get("/open", cashSessionController.getOpen);
router.get("/:id", cashSessionController.getById);
router.post("/open", cashSessionController.open);
router.post("/:id/movement", cashSessionController.addMovement);
router.get("/:id/summary", cashSessionController.getSummary);
router.post("/:id/close", cashSessionController.close);

export default router;
