import { UserRole } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.permission";
import { getDashboardStatsController } from "./dashboard.controller";

const router = Router();
const shopRoles = [UserRole.TENANT_ADMIN, UserRole.SHOP_OWNER, UserRole.SERVICE_ADVISOR, UserRole.TECHNICIAN] as const;

router.use(requireAuth, requireRole(...shopRoles));

router.get("/stats", (req, res, next) => {
  getDashboardStatsController(req, res).catch(next);
});

export default router;
