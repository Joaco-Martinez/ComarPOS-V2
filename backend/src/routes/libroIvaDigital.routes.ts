import { Router } from "express";
import { libroIvaDigitalController } from "../controllers/libroIvaDigital.controller";
import { authMiddleware, requireRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN"));
router.use(requirePlanFeature("facturacion"));

router.get("/resumen", libroIvaDigitalController.getResumen);
router.get("/compras-cbte.csv", libroIvaDigitalController.downloadComprasCbte);
router.get("/compras-alicuotas.csv", libroIvaDigitalController.downloadComprasAlicuotas);
router.get("/ventas-cbte.csv", libroIvaDigitalController.downloadVentasCbte);
router.get("/ventas-alicuotas.csv", libroIvaDigitalController.downloadVentasAlicuotas);

router.get("/liquidacion", libroIvaDigitalController.getLiquidacion);
router.post("/liquidacion/cerrar", libroIvaDigitalController.cerrarLiquidacion);
router.post("/liquidacion/reabrir", libroIvaDigitalController.reabrirLiquidacion);

export default router;
