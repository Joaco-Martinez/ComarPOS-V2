import { Router } from "express";
import { printboxController } from "../controllers/printbox.controller";
import { authMiddleware, requireRole, requireAnyRole } from "../middleware/auth";

const router = Router();

// Público: lo llama el ESP32 durante el pairing inicial, sin sesión de
// usuario (ver printbox.pairing.ts — la prueba de pertenencia es el
// pairingCode de un solo uso).
router.post("/pair", printboxController.pair);

router.use(authMiddleware);

router.post("/devices", requireRole("ADMIN"), printboxController.createDevice);
router.get("/devices", requireAnyRole(["ADMIN", "EMPLEADO"]), printboxController.listDevices);
router.patch("/devices/:id", requireRole("ADMIN"), printboxController.updateDevice);
router.delete("/devices/:id", requireRole("ADMIN"), printboxController.revokeDevice);

export default router;
