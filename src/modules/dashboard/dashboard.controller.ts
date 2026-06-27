import { Request, Response } from "express";
import { getTenantId } from "../../shared/tenant";
import { getDashboardStats, getSuperAdminDashboardData } from "./dashboard.service";

export async function getDashboardStatsController(req: Request, res: Response) {
  const user = req.user as any;
  const stats = await getDashboardStats(getTenantId(req), user.userId, user.role);
  res.json({ stats });
}

export async function getSuperAdminDashboardController(_req: Request, res: Response) {
  const dashboard = await getSuperAdminDashboardData();
  res.json({ dashboard });
}
