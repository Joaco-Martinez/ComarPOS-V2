import { Router } from "express";
import { businessLocationController } from "../controllers/businessLocation.controller";
import { authMiddleware, requireRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

const router = Router();

// GET queda sin gatear por plan a proposito: POS/Stock/Compras/Conteo de
// Stock lo usan como dato de referencia (elegir sucursal/deposito) aunque el
// modulo "Sucursales" (crear/editar/eliminar) este apagado para ese plan --
// gatear tambien la lectura les rompería el selector de sucursal.
router.post(
  "/",
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("sucursales"),
  businessLocationController.create
);

router.get("/", authMiddleware, businessLocationController.getAll);

router.get("/:id", authMiddleware, businessLocationController.getOne);

router.put(
  "/:id",
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("sucursales"),
  businessLocationController.update
);

router.patch(
  "/:id/default",
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("sucursales"),
  businessLocationController.setDefault
);

router.delete(
  "/:id",
  authMiddleware,
  requireRole("ADMIN"),
  requirePlanFeature("sucursales"),
  businessLocationController.remove
);

export default router;