import { Request, Response, NextFunction } from "express";
import { orderService } from "../services/order.service";
import { getParamAsString } from "../utils/params";

export const mpWebhookController = {
  /**
   * Publico, sin auth, sin storefrontTenantMiddleware - el tenant viene del
   * segmento :tenantId de la propia URL (ver order.service.ts#handleMpWebhook
   * para el porque). Siempre responde 200 rapido (MP reintenta si no
   * responde 200) aunque la notificacion no traiga nada util - el trabajo
   * real (re-consultar el pago) es best-effort y no debe hacer fallar el ack.
   */
  async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = getParamAsString(req.params.tenantId, "tenantId");

      const paymentId =
        (req.query["data.id"] as string | undefined) ||
        (req.query.id as string | undefined) ||
        (req.body?.data?.id as string | undefined);

      if (paymentId) {
        await orderService.handleMpWebhook(tenantId, String(paymentId));
      }

      res.status(200).json({ ok: true });
    } catch (err) {
      // No propagamos un 4xx/5xx a MP por un error interno nuestro - se
      // loguea (asyncHandler/errorLogger de otras rutas si esto rompiera)
      // pero igual se ack-ea, MP no tiene forma de "arreglar" un error de
      // nuestro lado reintentando.
      console.error("Error procesando webhook de Mercado Pago:", err);
      res.status(200).json({ ok: true });
    }
  },
};
