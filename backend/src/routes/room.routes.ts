import { Router } from "express";
import { authMiddleware, requireAnyRole } from "../middleware/auth";
import { requirePlanFeature } from "../middleware/planFeature";
import { roomController } from "../controllers/room.controller";
import { upload } from "../controllers/product.controller";

const router = Router();

router.use(authMiddleware);
router.use(requirePlanFeature("hoteleria"));

router.get("/", roomController.getAll);
router.get("/:id", roomController.getById);
router.post("/", requireAnyRole(["ADMIN", "EMPLEADO"]), roomController.create);
router.patch("/:id", requireAnyRole(["ADMIN", "EMPLEADO"]), roomController.update);
router.patch("/:id/status", requireAnyRole(["ADMIN", "EMPLEADO"]), roomController.setStatus);
// Reusa el multer de product.controller.ts (mismo filtro de tipo/tamaño de
// imagen) -- no hace falta duplicar la config solo para este modulo.
router.post("/:id/image", requireAnyRole(["ADMIN", "EMPLEADO"]), upload.single("image"), roomController.uploadImage);
router.delete("/:id", requireAnyRole(["ADMIN"]), roomController.remove);

export default router;
