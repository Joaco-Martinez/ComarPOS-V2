import { Router } from "express";
import { businessPresetController } from "../controllers/businessPreset.controller";

const router = Router();

// Publico, sin auth: catalogo de rubros/categorias/productos sugeridos que
// consume el wizard de /trial-signup ANTES de crear la cuenta (para armar el
// checklist tildable) - ver data/businessPresets.ts. Datos estaticos en
// memoria, no toca la DB.
router.get("/", businessPresetController.list);

export default router;
