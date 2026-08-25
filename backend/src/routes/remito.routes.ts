import { Router } from "express";
import { remitoController } from "../controllers/remito.controller";
import { authMiddleware } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";


const router = Router();

router.use(authMiddleware);
router.use(requirePlanFeature("remitos"));

router.post("/from-sale/:saleId", remitoController.createFromSale);

router.get("/", remitoController.getAll);
router.get("/:id/pdf", remitoController.downloadPdf);
router.get("/:id", remitoController.getById);

router.post("/:id/regenerate-pdf", remitoController.regeneratePdf);
router.patch("/:id/delivered", remitoController.markAsDelivered);
router.patch("/:id/cancel", remitoController.cancel);

export default router;