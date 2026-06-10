import { NextFunction, Request, Response } from "express";
import { PlanFeature } from "../../config/subscription-plans";
import { assertPlanFeature } from "./subscription.service";

export function requirePlanFeature(feature: PlanFeature) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user?.tenantId) {
      return next(Object.assign(new Error("Tenant context required"), { status: 403 }));
    }

    try {
      await assertPlanFeature(req.user.tenantId, feature);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
