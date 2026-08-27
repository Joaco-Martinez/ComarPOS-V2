import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { roomController } from "../controllers/room.controller";

const router = Router();

router.use(authMiddleware);
router.use(requirePlanFeature("hoteleria"));

router.get("/", roomController.getAll);
router.get("/:id", roomController.getById);
router.post("/", requireAnyRole(["ADMIN", "EMPLEADO"]), roomController.create);
router.patch("/:id", requireAnyRole(["ADMIN", "EMPLEADO"]), roomController.update);
router.patch("/:id/status", requireAnyRole(["ADMIN", "EMPLEADO"]), roomController.setStatus);
router.delete("/:id", requireAnyRole(["ADMIN"]), roomController.remove);

export default router;
