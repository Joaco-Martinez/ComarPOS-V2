import { Request, Response, NextFunction } from "express";
import { storefrontConfigService } from "../services/storefrontConfig.service";
import { orderService } from "../services/order.service";
import { catalogService } from "../services/catalog.service";
import { getParamAsString } from "../utils/params";

function toNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const storefrontController = {
  async getStore(_req: Request, res: Response, next: NextFunction) {
    try {
      const store = await storefrontConfigService.getPublic();

      if (!store) {
        return res.status(404).json({ ok: false, message: "Tienda no encontrada" });
      }

      res.json({ ok: true, content: store });
    } catch (err) {
      next(err);
    }
  },

  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      // Mismo mapeo User(CLIENTE)->Client que ya usa el catalogo publico
      // (getCustomerContext) - asi un comprador logueado queda vinculado a
      // su ficha de cliente para historial, sin duplicar esa logica acá.
      const customer = await catalogService.getCustomerContext(user?.id);

      const order = await orderService.create({
        items: Array.isArray(req.body.items)
          ? req.body.items.map((item: any) => ({
              productId: item.productId,
              quantity: toNumber(item.quantity),
              quantityKg: toNumber(item.quantityKg),
            }))
          : [],
        customerName: req.body.customerName || customer.customerName,
        customerPhone: req.body.customerPhone || customer.phone || undefined,
        customerEmail: req.body.customerEmail || customer.email || undefined,
        clientId: customer.clientId,
        userId: customer.userId,
        paymentMethod: req.body.paymentMethod,
        customerNotes: req.body.customerNotes,
      });

      res.status(201).json({ ok: true, content: order });
    } catch (err) {
      next(err);
    }
  },

  async getOrderByToken(req: Request, res: Response, next: NextFunction) {
    try {
      const publicToken = getParamAsString(req.params.publicToken, "publicToken");
      const order = await orderService.getPublicByToken(publicToken);

      if (!order) {
        return res.status(404).json({ ok: false, message: "Pedido no encontrado" });
      }

      res.json({ ok: true, content: order });
    } catch (err) {
      next(err);
    }
  },

  async uploadTransferProof(req: Request, res: Response, next: NextFunction) {
    try {
      const publicToken = getParamAsString(req.params.publicToken, "publicToken");
      const order = await orderService.uploadTransferProof(publicToken, req.file);

      res.json({ ok: true, content: order });
    } catch (err) {
      next(err);
    }
  },

};
