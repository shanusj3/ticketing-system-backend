import { Request, Response } from "express";
import { getTenantSubscription, listAllPlans } from "./subscription.service";

export async function getCurrentSubscriptionController(req: Request, res: Response) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ message: "Tenant context required" });
  }

  const subscription = await getTenantSubscription(req.user.tenantId);
  res.json({ subscription });
}

export async function listPlansController(_req: Request, res: Response) {
  res.json({ plans: listAllPlans() });
}
