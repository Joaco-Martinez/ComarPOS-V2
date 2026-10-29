import { Router } from "express";
import { billingController } from "../controllers/billing.controller";
import { authMiddleware, requireRole } from "../middleware/auth";

const router = Router();

// Publico, sin auth: nombre/precio/limites de los 3 planes para la landing y /prueba-gratis.
router.get("/plans", billingController.plans);

// Autenticadas, pero eximidas del bloqueo por tenant suspendido/prueba
// vencida (ver middleware/tenant.ts, isSuspensionExempt) - si no, un tenant
// bloqueado nunca podria llegar a pagar para desbloquearse solo.
router.get("/status", authMiddleware, billingController.status);
router.post("/checkout", authMiddleware, billingController.checkout);
router.post("/cancel", authMiddleware, requireRole("ADMIN"), billingController.cancel);
// Pago por transferencia: el tenant informa el nro de operacion, lo confirma
// el super-admin desde /platform-admin (ver billing.service.ts#reportTransfer).
router.post("/transfer-report", authMiddleware, requireRole("ADMIN"), billingController.reportTransfer);
router.get("/transfer-reports", authMiddleware, requireRole("ADMIN"), billingController.transferReports);

// Publico, sin auth: lo llama Mercado Pago directo.
router.post("/mp/webhook", billingController.webhook);

export default router;
