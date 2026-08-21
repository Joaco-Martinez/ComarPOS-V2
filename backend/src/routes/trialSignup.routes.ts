import { Router } from "express";
import { trialSignupController } from "../controllers/trialSignup.controller";
import { trialSignupRateLimiter } from "../middleware/rateLimit";

const router = Router();

// Publico, sin auth: alta self-service de un tenant nuevo en prueba gratis
// (ver services/trialSignup.service.ts). Eximido de la verificacion de
// tenant suspendido en middleware/tenant.ts (isSuspensionExempt).
router.post("/", trialSignupRateLimiter, trialSignupController.signup);

export default router;
