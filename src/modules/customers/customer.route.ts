import { UserRole } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.permission";
import { createCustomerController, listCustomersController, getCustomerController } from "./customer.controller";

const router = Router();
const shopRoles = [UserRole.TENANT_ADMIN, UserRole.SHOP_OWNER, UserRole.SERVICE_ADVISOR] as const;

router.use(requireAuth, requireRole(...shopRoles));

router.get("/", (req, res, next) => {
  listCustomersController(req, res).catch(next);
});

router.get("/:id", (req, res, next) => {
  getCustomerController(req, res).catch(next);
});

router.post("/", (req, res, next) => {
  createCustomerController(req, res).catch(next);
});

export default router;
