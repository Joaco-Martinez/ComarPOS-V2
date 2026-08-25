import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { repairOrderController } from "../controllers/repairOrder.controller";

const router = Router();

// Rutas publicas (sin login): el cliente aprueba/rechaza el presupuesto de
// su reparacion desde un link con token, sin necesitar una cuenta. Van
// montadas ANTES de authMiddleware para no exigir sesion.
router.get("/public/:token", repairOrderController.getPublicByToken);
router.get("/public/:token/pdf", repairOrderController.getPublicPdf);
router.post("/public/:token/approve", repairOrderController.approvePublic);
router.post("/public/:token/reject", repairOrderController.rejectPublic);

router.use(authMiddleware);
router.use(requirePlanFeature("servicios"));

router.get("/", repairOrderController.getAll);
router.get("/:id", repairOrderController.getById);
router.post("/", requireAnyRole(["ADMIN", "EMPLEADO"]), repairOrderController.create);
router.patch("/:id", requireAnyRole(["ADMIN", "EMPLEADO"]), repairOrderController.update);
router.patch("/:id/status", requireAnyRole(["ADMIN", "EMPLEADO"]), repairOrderController.setStatus);
router.post("/:id/items", requireAnyRole(["ADMIN", "EMPLEADO"]), repairOrderController.addItem);
router.patch("/:id/items/:itemId", requireAnyRole(["ADMIN", "EMPLEADO"]), repairOrderController.updateItem);
router.delete("/:id/items/:itemId", requireAnyRole(["ADMIN", "EMPLEADO"]), repairOrderController.removeItem);
router.post("/:id/approval-link", requireAnyRole(["ADMIN", "EMPLEADO"]), repairOrderController.createApprovalLink);
router.get("/:id/pdf", repairOrderController.getPdf);
router.post("/:id/checkout", requireAnyRole(["ADMIN", "EMPLEADO"]), repairOrderController.checkout);
router.delete("/:id", requireAnyRole(["ADMIN"]), repairOrderController.remove);

export default router;
