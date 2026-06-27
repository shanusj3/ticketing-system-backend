import { UserRole } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.permission";
import {
  getMyNotificationLogsController,
  getMyNotificationUsageController,
  getAllTenantsUsageController,
  addTopUpController,
  getTopUpPackagesController,
  getTenantNotificationLogsController,
  getTenantNotificationUsageController,
} from "./notification.controller";

const router = Router();

router.use(requireAuth);

// Tenant-facing routes
router.get("/logs", (req, res, next) => {
  getMyNotificationLogsController(req, res).catch(next);
});

router.get("/usage", (req, res, next) => {
  getMyNotificationUsageController(req, res).catch(next);
});

router.get("/topup/packages", (req, res, next) => {
  getTopUpPackagesController(req, res).catch(next);
});

// Super Admin only
router.use(requireRole(UserRole.SUPER_ADMIN));

router.get("/admin/all-usage", (req, res, next) => {
  getAllTenantsUsageController(req, res).catch(next);
});

router.post("/admin/topup", (req, res, next) => {
  addTopUpController(req, res).catch(next);
});

router.get("/admin/:tenantId/logs", (req, res, next) => {
  getTenantNotificationLogsController(req, res).catch(next);
});

router.get("/admin/:tenantId/usage", (req, res, next) => {
  getTenantNotificationUsageController(req, res).catch(next);
});

export default router;
