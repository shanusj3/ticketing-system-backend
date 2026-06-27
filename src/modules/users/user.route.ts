import { UserRole } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.permission";
import { createUserController, listUsersController, updateMyPasswordController, resetTenantUserPasswordController } from "./user.controller";

const router = Router();

const tenantAdminRoles = [UserRole.TENANT_ADMIN, UserRole.SHOP_OWNER] as const;
const readRoles = [UserRole.TENANT_ADMIN, UserRole.SHOP_OWNER, UserRole.SERVICE_ADVISOR, UserRole.TECHNICIAN] as const;

router.use(requireAuth);

router.get("/", requireRole(...readRoles), (req, res, next) => {
  listUsersController(req, res).catch(next);
});

router.post("/", requireRole(...tenantAdminRoles), (req, res, next) => {
  createUserController(req, res).catch(next);
});

router.patch("/me/password", (req, res, next) => {
  updateMyPasswordController(req, res).catch(next);
});

router.patch("/:id/password", requireRole(...tenantAdminRoles), (req, res, next) => {
  resetTenantUserPasswordController(req, res).catch(next);
});

export default router;
