import { Request } from "express";
import { auditLogService } from "../services/auditLog.service";

/**
 * Fire-and-forget audit log. No bloquea la respuesta; errores solo logean en consola.
 */
export function logAudit(
  req: Request,
  action: string,
  entity: string,
  entityId: string,
  changes?: object
) {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) return;

  void auditLogService
    .log({ userId, action, entity, entityId, changes, ip: req.ip ?? undefined })
    .catch((err) => console.error(`[audit] ${action} ${entity}:`, err));
}
