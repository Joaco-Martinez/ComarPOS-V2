/**
 * Rutas AFIP / ARCA.
 *
 * Toda la lógica de negocio fue extraída a:
 *   - afip.controller.ts  → handlers de cada endpoint
 *   - utils/afipMappers.ts → helpers de mapeo de datos (funciones puras)
 *
 * Doc auditoria: seccion 3 (auth), 4.3 (modularizacion AFIP), 8 (swagger).
 */
import express from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import {
  tokenController,
  pruebaController,
  facturarController,
  notaCreditoController,
  pendingAfipController,
  facturaBySaleController,
} from "./afip.controller";

const router = express.Router();

// Toda la ruta /afip requiere autenticacion y rol fiscal (doc seccion 3 y 7)
router.use(authMiddleware, requireAnyRole(["ADMIN", "CONTADOR"]));

// Swagger: ver src/docs/afip.yaml
router.get("/token", tokenController);
router.get("/prueba", pruebaController);
router.post("/facturar", facturarController);
router.post("/nota-credito", notaCreditoController);
router.get("/pending-afip", pendingAfipController);
router.get("/factura-by-sale/:saleId", facturaBySaleController);

export default router;
