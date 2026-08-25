import { Router } from "express";
import { tenantController } from "../controllers/tenant.controller";
import { authMiddleware, requireRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

const router = Router();

// Datos self-service del propio negocio (nombre fiscal/CUIT/direccion/telefono
// para tickets y facturas) - no confundir con /platform-admin/tenants, que es
// el panel cross-tenant del super-admin de la plataforma. GET no se gatea
// por plan: OnboardingChecklist y otras pantallas lo leen globalmente, solo
// la edicion (pantalla "Empresa") depende del modulo "empresa".
router.get("/me", authMiddleware, tenantController.getMe);
router.patch("/me", authMiddleware, requireRole("ADMIN"), requirePlanFeature("empresa"), tenantController.updateMe);

export default router;
