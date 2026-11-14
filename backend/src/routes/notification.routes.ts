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
router.post("/check-onboarding", requireRole("ADMIN"), notificationController.checkOnboarding);
router.post("/push-token", notificationController.registerPushToken);
router.delete("/push-token", notificationController.unregisterPushToken);
router.get("/preferences", notificationController.getPreferences);
router.put("/preferences", notificationController.updatePreferences);
router.get("/web-push/public-key", notificationController.webPushPublicKey);
router.post("/web-push/subscribe", notificationController.subscribeWebPush);
router.post("/web-push/unsubscribe", notificationController.unsubscribeWebPush);
router.post("/test-push", notificationController.sendTestPush);

export default router;
