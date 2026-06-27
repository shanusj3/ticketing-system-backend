import { UserRole } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.permission";
import {
  setupWhatsappController,
  getWhatsappAdminController,
  getMyWhatsappController,
  disconnectWhatsappController,
  getAllWhatsappStatusController,
} from "./whatsapp.controller";

const router = Router();

router.use(requireAuth);

// Tenant: view their own WhatsApp status (safe, no secrets)
router.get("/my", (req, res, next) => {
  getMyWhatsappController(req, res).catch(next);
});

// Super Admin only routes
router.use(requireRole(UserRole.SUPER_ADMIN));

router.get("/", (req, res, next) => {
  getAllWhatsappStatusController(req, res).catch(next);
});

router.get("/:tenantId", (req, res, next) => {
  getWhatsappAdminController(req, res).catch(next);
});

router.post("/setup/:tenantId", (req, res, next) => {
  setupWhatsappController(req, res).catch(next);
});

router.delete("/:tenantId", (req, res, next) => {
  disconnectWhatsappController(req, res).catch(next);
});

export default router;
