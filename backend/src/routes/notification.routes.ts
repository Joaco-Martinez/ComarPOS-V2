import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth";
import { notificationController } from "../controllers/notification.controller";

const router = Router();
router.use(authMiddleware);

router.get("/", notificationController.getMyNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.post("/:id/read", notificationController.markRead);
router.post("/read-all", notificationController.markAllRead);
router.post("/check-stock", requireRole("ADMIN"), notificationController.checkLowStock);

export default router;
