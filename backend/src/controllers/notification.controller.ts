import { Request, Response, NextFunction } from "express";
import { notificationService } from "../services/notification.service";

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
};
