import { Router } from "express";
import { notaCreditoPdfController } from "../controllers/notaCreditoPdf.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/:saleId/descargar", notaCreditoPdfController.descargar);

export default router;