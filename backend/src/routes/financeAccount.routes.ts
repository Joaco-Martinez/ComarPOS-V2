import { Router } from "express";
import { financeAccountController } from "../controllers/financeAccount.controller";
import { authMiddleware, requireRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

const router = Router();
// Todo el modulo de gestion del plan de cuentas (CRUD completo) gateado a
// ADMIN, mismo criterio que /users en app.ts (requireRole("ADMIN")). El
// selector de cuenta en el formulario de carga de Finance (cualquier rol)
// sigue funcionando igual que hoy con el enum CategoryFinance si el usuario
// no es ADMIN -- ver frontend/app/[tenant]/finanzas/page.tsx.
router.use(authMiddleware, requireRole("ADMIN"));
router.use(requirePlanFeature("finanzas"));

router.get("/", financeAccountController.getAll);
router.post("/", financeAccountController.create);
router.put("/:id", financeAccountController.update);
router.patch("/:id", financeAccountController.update);
router.delete("/:id", financeAccountController.remove);

export default router;
