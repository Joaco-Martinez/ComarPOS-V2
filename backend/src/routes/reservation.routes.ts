import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { reservationController } from "../controllers/reservation.controller";

const router = Router();

router.use(authMiddleware);
router.use(requirePlanFeature("hoteleria"));

router.get("/", reservationController.getAll);
// Antes de "/:id" -- si no, "availability" matchea como si fuera un id.
router.get("/availability", reservationController.getAvailability);
router.get("/:id", reservationController.getById);
router.post("/", requireAnyRole(["ADMIN", "EMPLEADO"]), reservationController.create);
router.patch("/:id", requireAnyRole(["ADMIN", "EMPLEADO"]), reservationController.update);
router.patch("/:id/status", requireAnyRole(["ADMIN", "EMPLEADO"]), reservationController.setStatus);
router.post("/:id/check-in", requireAnyRole(["ADMIN", "EMPLEADO"]), reservationController.checkIn);
router.post("/:id/checkout", requireAnyRole(["ADMIN", "EMPLEADO"]), reservationController.checkout);
router.delete("/:id", requireAnyRole(["ADMIN"]), reservationController.remove);

export default router;
