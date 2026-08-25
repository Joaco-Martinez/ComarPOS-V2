import { Router } from "express";
import { financeController } from "../controllers/finance.controller";
import { authMiddleware } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";

const router = Router();
router.use(authMiddleware);
router.use(requirePlanFeature("finanzas"));

// CRUD básico
router.get("/", financeController.getAll);
router.post("/", financeController.create);

// Estadísticas simples
router.get("/income/month", financeController.getIncomeByMonth);
router.get("/income/year", financeController.getIncomeByYear);
router.get("/income/week", financeController.getIncomeByWeek);

router.post("/register-credit-note", financeController.registerCreditNote);

// Estadísticas extendidas
router.get("/income/category", financeController.getIncomeByCategory);
router.get("/products/top", financeController.getTopProducts);
router.get("/products/worst", financeController.getWorstProducts);
router.get("/products/top-range", financeController.getTopProductsInRange);

// Mejor producto de un mes específico
router.get("/products/best-month", financeController.getBestProductMonth);

// Peor producto de un mes específico
router.get("/products/worst-month", financeController.getWorstProductMonth);

// Exportaciones
router.get("/export/excel", financeController.exportExcel);
router.get("/export/pdf", financeController.exportPDF);

// Editar / eliminar
router.put("/:id", financeController.update);
router.patch("/:id", financeController.update);
router.delete("/:id", financeController.remove);

export default router;
