import { Request, Response, NextFunction } from "express";
import { storefrontConfigService } from "../services/storefrontConfig.service";
import { storefrontBannerService } from "../services/storefrontBanner.service";
import { orderService } from "../services/order.service";
import { tenantMpConfigService } from "../services/tenantMpConfig.service";
import { currentTenantId } from "../context/tenantContext";
import { AppError } from "../utils/asyncHandler";
import { getParamAsString } from "../utils/params";

function requireCurrentTenantId() {
  const tenantId = currentTenantId();
  if (!tenantId) {
    throw new AppError("TENANT_NOT_RESOLVED", "No se pudo resolver la empresa actual", 400);
  }
  return tenantId;
}

function sendServiceResponse(res: Response, result: any, defaultStatus = 200) {
  if (result?.statusCode) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  return res.status(defaultStatus).json({ ok: true, content: result });
}

function requireUserId(req: Request) {
  const userId = (req as any).user?.id;
  if (!userId) throw new AppError("USER_NOT_RESOLVED", "No se pudo identificar el usuario", 401);
  return userId;
}

function normalizeBoolean(value: any): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return Boolean(value);
}

export const storefrontAdminController = {
  async getConfig(_req: Request, res: Response, next: NextFunction) {
    try {
      const config = await storefrontConfigService.getForAdmin();
      res.json({ ok: true, content: config });
    } catch (err) {
      next(err);
    }
  },

  async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await storefrontConfigService.update({
        isEnabled: normalizeBoolean(req.body.isEnabled),
        storeName: req.body.storeName,
        description: req.body.description,
        accentColor: req.body.accentColor,
        businessHours: req.body.businessHours,
        pickupEnabled: normalizeBoolean(req.body.pickupEnabled),
        businessLocationId: req.body.businessLocationId,
        transferInstructions: req.body.transferInstructions,
      });

      res.json({ ok: true, content: updated });
    } catch (err) {
      next(err);
    }
  },

  async uploadBanner(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = requireCurrentTenantId();
      const config = await storefrontBannerService.upload(tenantId, req.file);
      res.json({ ok: true, bannerUrl: config.bannerUrl });
    } catch (err) {
      next(err);
    }
  },

  async removeBanner(_req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = requireCurrentTenantId();
      await storefrontBannerService.remove(tenantId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  async getOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const orders = await orderService.getAll({
        status: typeof req.query.status === "string" ? req.query.status : undefined,
      });
      res.json({ ok: true, content: orders });
    } catch (err) {
      next(err);
    }
  },

  async getOrderById(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await orderService.getById(getParamAsString(req.params.id, "id"));
      if (!order) return res.status(404).json({ ok: false, message: "Pedido no encontrado" });
      res.json({ ok: true, content: order });
    } catch (err) {
      next(err);
    }
  },

  async confirmTransfer(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const result = await orderService.confirmTransfer(getParamAsString(req.params.id, "id"), userId);
      return sendServiceResponse(res, result);
    } catch (err) {
      next(err);
    }
  },

  async rejectTransfer(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const result = await orderService.rejectTransfer(
        getParamAsString(req.params.id, "id"),
        req.body.reason,
        userId
      );
      return sendServiceResponse(res, result);
    } catch (err) {
      next(err);
    }
  },

  async cancelOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await orderService.cancel(getParamAsString(req.params.id, "id"), req.body.reason);
      return sendServiceResponse(res, result);
    } catch (err) {
      next(err);
    }
  },

  async convertToSale(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const result = await orderService.convertToSale(getParamAsString(req.params.id, "id"), userId);
      return sendServiceResponse(res, result);
    } catch (err) {
      next(err);
    }
  },

  async getMpConfig(_req: Request, res: Response, next: NextFunction) {
    try {
      const config = await tenantMpConfigService.getForAdmin();
      res.json({ ok: true, content: config });
    } catch (err) {
      next(err);
    }
  },

  async saveMpConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await tenantMpConfigService.save({
        accessToken: req.body.accessToken,
        publicKey: req.body.publicKey,
      });
      res.json({ ok: true, content: updated });
    } catch (err) {
      next(err);
    }
  },

  async removeMpConfig(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await tenantMpConfigService.remove();
      res.json({ ok: true, content: result });
    } catch (err) {
      next(err);
    }
  },
};
