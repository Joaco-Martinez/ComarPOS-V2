import { Request, Response, NextFunction } from "express";
import { tenantLogoService } from "../services/tenantLogo.service";
import { getParamAsString } from "../utils/params";
import { currentTenantId } from "../context/tenantContext";
import { AppError } from "../utils/asyncHandler";

function requireCurrentTenantId() {
  const tenantId = currentTenantId();
  if (!tenantId) {
    throw new AppError("TENANT_NOT_RESOLVED", "No se pudo resolver la empresa actual", 400);
  }
  return tenantId;
}

export const tenantLogoController = {
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = requireCurrentTenantId();
      const tenant = await tenantLogoService.uploadLogo(tenantId, req.file);

      res.json({ ok: true, logoUrl: tenant.logoUrl });
    } catch (error) {
      next(error);
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = getParamAsString(req.params.businessId, "businessId");
      const { logoUrl } = await tenantLogoService.getLogo(businessId);

      res.json({ ok: true, logoUrl });
    } catch (error) {
      next(error);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = getParamAsString(req.params.businessId, "businessId");
      const tenantId = requireCurrentTenantId();

      if (businessId !== tenantId) {
        throw new AppError("FORBIDDEN", "No podés modificar el logo de otra empresa", 403);
      }

      await tenantLogoService.deleteLogo(tenantId);

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
};
