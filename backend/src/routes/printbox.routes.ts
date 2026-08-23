import { Router } from "express";
import { printboxController } from "../controllers/printbox.controller";
import { authMiddleware, requireRole, requireAnyRole } from "../middleware/auth";

const router = Router();

// Público: lo llama el ESP32, sin sesión de usuario -- pairing inicial (la
// prueba de pertenencia es el pairingCode de un solo uso) y heartbeat
// periodico (la prueba es el token que devolvió el pairing).
router.post("/pair", printboxController.pair);
router.post("/devices/:id/heartbeat", printboxController.heartbeat);
router.get("/devices/:id/poll", printboxController.poll);
router.post("/devices/:id/jobs/:jobId/ack", printboxController.ackJob);

router.use(authMiddleware);

router.post("/devices", requireRole("ADMIN"), printboxController.createDevice);
router.get("/devices", requireAnyRole(["ADMIN", "EMPLEADO"]), printboxController.listDevices);
router.patch("/devices/:id", requireRole("ADMIN"), printboxController.updateDevice);
router.post("/devices/:id/regenerate-code", requireRole("ADMIN"), printboxController.regenerateCode);
router.delete("/devices/:id", requireRole("ADMIN"), printboxController.revokeDevice);

export default router;
