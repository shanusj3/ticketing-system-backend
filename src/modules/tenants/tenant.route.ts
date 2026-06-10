import { UserRole } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.permission";
import { 
  createTenantController, 
  listTenantsController, 
  getPublicTenantDetailsController 
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

export default router;
