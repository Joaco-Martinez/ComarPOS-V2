import { Router } from "express";
import {
  regenerarFacturaPDFController,
  descargarFacturaPDFController,
  obtenerTodasLasFacturasController,
} from "../controllers/factura-pdf.controller";
import { authMiddleware, requireAnyRole } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/all", requireAnyRole(["ADMIN", "CONTADOR"]), obtenerTodasLasFacturasController);
router.post("/:saleId/regenerar", requireAnyRole(["ADMIN", "CONTADOR"]), regenerarFacturaPDFController);
router.get("/:saleId/descargar", descargarFacturaPDFController);

export default router;