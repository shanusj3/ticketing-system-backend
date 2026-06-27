import { UserRole } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.permission";
import {
  createTenantController,
  listTenantsController,
  getPublicTenantDetailsController,
  getTenantByIdController,
  switchTenantPlanController,
  updateTenantStatusController,
} from "./tenant.controller";

const router = Router();

// Public route for fetching tenant details by subdomain/custom domain
router.get("/public/:slugOrDomain", (req, res, next) => {
  getPublicTenantDetailsController(req, res).catch(next);
});

router.use(requireAuth, requireRole(UserRole.SUPER_ADMIN));

router.get("/", (req, res, next) => {
  listTenantsController(req, res).catch(next);
});

router.post("/", (req, res, next) => {
  createTenantController(req, res).catch(next);
});

router.get("/:id", (req, res, next) => {
  getTenantByIdController(req, res).catch(next);
});

router.patch("/:id/plan", (req, res, next) => {
  switchTenantPlanController(req, res).catch(next);
});

router.patch("/:id/status", (req, res, next) => {
  updateTenantStatusController(req, res).catch(next);
});

export default router;
