import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { notaCreditoController } from "../controllers/notaCredito.controller";

const router = Router();

router.use(authMiddleware);

router.post("/:saleId/emitir", requireAnyRole(["ADMIN", "EMPLEADO"]), notaCreditoController.generar);

export default router;
