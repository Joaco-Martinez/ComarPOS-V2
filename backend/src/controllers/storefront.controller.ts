import { Request, Response, NextFunction } from "express";
import { storefrontConfigService } from "../services/storefrontConfig.service";
import { orderService } from "../services/order.service";
import { catalogService } from "../services/catalog.service";
import { authService } from "../services/auth.service";
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

  /**
   * Alta de cuenta CLIENTE para ESTA tienda puntual (cuenta obligatoria para
   * comprar, doc "tienda online - checkout por WhatsApp"). A diferencia de
   * POST /auth/register (montado suelto, sin tenant de la URL), acá el
   * tenantId sale de storefrontTenantMiddleware - así el cliente queda
   * vinculado al negocio cuya tienda esta navegando, no al tenant default.
   * Registra y loguea en el mismo paso (misma cookie que /auth/login) para
   * no obligar a un segundo submit.
   */
  async registerCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const email = req.body.email;
      const password = req.body.password;

      await authService.register(
        {
          email,
          password,
          nombre: req.body.nombre,
          apellido: req.body.apellido,
          dni: req.body.dni,
          telefono: req.body.telefono,
        },
        tenantId
      );

      const user = await authService.login(email, password, res);

      res.status(201).json({ ok: true, content: user });
    } catch (err) {
      next(err);
    }
  },

};
