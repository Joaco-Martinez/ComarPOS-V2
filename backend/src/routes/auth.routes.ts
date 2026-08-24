import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authMiddleware, requireRole } from "../middleware/auth";
import { loginRateLimiter } from "../middleware/rateLimit";

const router = Router();

router.post("/register", loginRateLimiter, authController.register);
router.post("/login", loginRateLimiter, authController.login);
router.post("/logout", authController.logout);
router.get("/me", authController.me);
router.post("/change-password", authMiddleware, authController.changePassword);
router.patch("/me/quick-access", authMiddleware, authController.updateQuickAccess);

router.delete(
  "/:id",
  authMiddleware,
  requireRole("ADMIN"),
  authController.deleteUser
);

export default router;
