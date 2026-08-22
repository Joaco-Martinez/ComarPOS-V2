import { Router } from "express";
import { getOnboardingChecklist, setOnboardingStep } from "../controllers/onboarding.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/", getOnboardingChecklist);
router.patch("/:stepId", setOnboardingStep);

export default router;
