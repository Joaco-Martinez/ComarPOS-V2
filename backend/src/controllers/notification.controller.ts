import { Request, Response, NextFunction } from "express";
import { notificationService } from "../services/notification.service";
import { pushService } from "../services/push.service";
import { PushPlatform } from "@prisma/client";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

function userId(req: Request): string {
  return (req as any).user?.id as string;
}

export const notificationController = {
  getMyNotifications: wrap(async (req) => {
    const onlyUnread = req.query.unread === "true";
    return notificationService.getForUser(userId(req), onlyUnread);
  }),

  getUnreadCount: wrap(async (req) => notificationService.getUnreadCount(userId(req))),

  markRead: wrap(async (req) =>
    notificationService.markRead(req.params.id as string, userId(req))
  ),

  markAllRead: wrap(async (req) => notificationService.markAllRead(userId(req))),

  checkLowStock: wrap(async () => notificationService.checkLowStock()),

  checkOnboarding: wrap(async () => notificationService.checkOnboarding()),

  registerPushToken: wrap(async (req) => {
    const { token, platform } = req.body as { token?: string; platform?: string };
    if (!token || (platform !== "ANDROID" && platform !== "IOS")) {
      throw new Error("token y platform (ANDROID|IOS) son requeridos.");
    }
    await pushService.registerToken(userId(req), token, platform as PushPlatform);
    return { ok: true };
  }),

  unregisterPushToken: wrap(async (req) => {
    const { token } = req.body as { token?: string };
    if (!token) throw new Error("token es requerido.");
    await pushService.unregisterToken(token);
    return { ok: true };
  }),
};
