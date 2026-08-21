import { Router } from "express";
import { tenantController } from "../controllers/tenant.controller";
import { authMiddleware, requireRole } from "../middleware/auth";

const router = Router();

// Datos self-service del propio negocio (nombre fiscal/CUIT/direccion/telefono
// para tickets y facturas) - no confundir con /platform-admin/tenants, que es
// el panel cross-tenant del super-admin de la plataforma.
router.get("/me", authMiddleware, tenantController.getMe);
router.patch("/me", authMiddleware, requireRole("ADMIN"), tenantController.updateMe);

export default router;
