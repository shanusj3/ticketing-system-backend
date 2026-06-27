import { UserRole } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.permission";
import { getDashboardStatsController, getSuperAdminDashboardController } from "./dashboard.controller";

const router = Router();
const shopRoles = [UserRole.TENANT_ADMIN, UserRole.SHOP_OWNER, UserRole.SERVICE_ADVISOR, UserRole.TECHNICIAN] as const;

router.use(requireAuth);

router.get("/super-admin", requireRole(UserRole.SUPER_ADMIN), (req, res, next) => {
  getSuperAdminDashboardController(req, res).catch(next);
});

router.get("/stats", requireRole(...shopRoles), (req, res, next) => {
  getDashboardStatsController(req, res).catch(next);
});

export default router;
