import { Request, Response, NextFunction } from "express";
import { currentTenantId } from "../context/tenantContext";
import { planFeatureService } from "../services/planFeature.service";
import { PlanFeatureKey } from "../config/billing";

/**
 * Gatea una ruta entera a los planes que incluyen `feature` (ver
 * config/billing.ts). Se monta despues de authMiddleware -- necesita el
 * tenant ya resuelto en el AsyncLocalStorage (currentTenantId()).
 */
export function requirePlanFeature(feature: PlanFeatureKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await planFeatureService.checkFeature(currentTenantId(), feature);
      if (!result.ok) {
        return res.status(403).json({ code: "PLAN_FEATURE_LOCKED", message: result.message, feature });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
