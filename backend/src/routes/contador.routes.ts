import { Router } from "express";
import { contadorController } from "../controllers/contador.controller";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

// Reporte para el contador: lectura de todo lo fiscal del periodo (no
// cierra ni modifica nada), asi que tambien lo puede ver el rol CONTADOR.
const router = Router();
router.use(authMiddleware);
router.use(requireAnyRole(["ADMIN", "CONTADOR"]));
router.use(requirePlanFeature("facturacion"));

router.get("/reporte", contadorController.getReport);
router.get("/reporte.pdf", contadorController.downloadPdf);
router.get("/reporte.docx", contadorController.downloadDocx);

export default router;
