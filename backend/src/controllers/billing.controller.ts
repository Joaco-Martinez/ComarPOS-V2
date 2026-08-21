import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";
import { billingService } from "../services/billing/billing.service";
import { mercadoPagoClient } from "../services/billing/mercadoPago.service";

export const billingController = {
  // Publico, sin auth: lo usa la landing y /prueba-gratis para mostrar
  // nombre/precio del plan sin hardcodearlo por duplicado en el frontend.
  async plan(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, content: billingService.plan });
    } catch (err) {
      next(err);
    }
  },

  async status(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).user?.tenantId;
      if (!tenantId) return res.status(400).json({ ok: false, message: "Usuario sin tenant asignado" });

      const status = await billingService.getStatus(tenantId);
      res.json({ ok: true, content: status });
    } catch (err) {
      next(err);
    }
  },

  async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).user?.tenantId;
      const userId = (req as any).user?.id;
      if (!tenantId || !userId) {
        return res.status(400).json({ ok: false, message: "Usuario sin tenant asignado" });
      }

      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });

      const { initPoint } = await billingService.createCheckout(tenantId, user.email);
      res.json({ ok: true, content: { initPoint } });
    } catch (err) {
      next(err);
    }
  },

  // Publico, sin auth: lo llama Mercado Pago directo (ver
  // routes/billing.routes.ts, eximido de auth/suspension/CSRF). Valida la
  // firma del webhook antes de tocar nada.
  async webhook(req: Request, res: Response) {
    try {
      if (!mercadoPagoClient.verifyWebhookSignature(req)) {
        return res.status(401).json({ ok: false, message: "Firma de webhook inválida" });
      }

      const type = (req.query.type as string) || (req.query.topic as string) || req.body?.type || req.body?.topic;
      const dataId =
        (req.query["data.id"] as string) ||
        (req.query.id as string) ||
        req.body?.data?.id ||
        req.body?.id;

      // Respondemos 200 siempre que la firma sea valida, incluso para
      // topics que no procesamos (merchant_order, etc.) - un 4xx/5xx hace
      // que MP reintente el mismo evento en bucle.
      if (!dataId) {
        return res.status(200).json({ ok: true });
      }

      if (type === "payment") {
        await billingService.handlePayment(dataId);
      } else if (type === "preapproval" || type === "subscription_preapproval") {
        await billingService.handlePreapprovalStatus(String(dataId));
      }

      res.status(200).json({ ok: true });
    } catch (err) {
      // Logueamos pero no dejamos que el error handler global mande un
      // 4xx/5xx "de verdad" a MP salvo que sea de firma - mismo motivo que
      // arriba, evitar reintentos infinitos por un bug de nuestro lado en
      // vez de una notificacion realmente invalida.
      console.error("🚨 Error procesando webhook de Mercado Pago:", err);
      res.status(200).json({ ok: false });
    }
  },
};
