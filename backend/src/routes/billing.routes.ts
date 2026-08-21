import { Router } from "express";
import { billingController } from "../controllers/billing.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Publico, sin auth: nombre/precio del plan para la landing y /prueba-gratis.
router.get("/plan", billingController.plan);

// Autenticadas, pero eximidas del bloqueo por tenant suspendido/prueba
// vencida (ver middleware/tenant.ts, isSuspensionExempt) - si no, un tenant
// bloqueado nunca podria llegar a pagar para desbloquearse solo.
router.get("/status", authMiddleware, billingController.status);
router.post("/checkout", authMiddleware, billingController.checkout);

// Publico, sin auth: lo llama Mercado Pago directo.
router.post("/mp/webhook", billingController.webhook);

export default router;
