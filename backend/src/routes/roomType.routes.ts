import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { roomTypeController } from "../controllers/roomType.controller";

const router = Router();

router.use(authMiddleware);
router.use(requirePlanFeature("hoteleria"));

router.get("/", roomTypeController.getAll);
router.get("/:id", roomTypeController.getById);
router.post("/", requireAnyRole(["ADMIN", "EMPLEADO"]), roomTypeController.create);
router.patch("/:id", requireAnyRole(["ADMIN", "EMPLEADO"]), roomTypeController.update);
router.delete("/:id", requireAnyRole(["ADMIN"]), roomTypeController.remove);

export default router;
