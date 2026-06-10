import { Request, Response } from "express";
import { getTenantId } from "../../shared/tenant";
import { getDashboardStats } from "./dashboard.service";

export async function getDashboardStatsController(req: Request, res: Response) {
  const user = req.user as any;
  const stats = await getDashboardStats(getTenantId(req), user.id, user.role);
  res.json({ stats });
}
