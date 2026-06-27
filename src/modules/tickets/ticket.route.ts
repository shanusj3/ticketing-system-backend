import { UserRole } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.permission";
import {
  createTicketController,
  getTicketController,
  listTicketsController,
  publicLookupController,
  updateTicketController,
  addLineItemController,
  removeLineItemController,
  collectPaymentController,
} from "./ticket.controller";

const router = Router();
const shopRoles = [
  UserRole.TENANT_ADMIN,
  UserRole.SHOP_OWNER,
  UserRole.SERVICE_ADVISOR,
  UserRole.TECHNICIAN,
] as const;

router.get("/public/lookup", (req, res, next) => {
  publicLookupController(req, res).catch(next);
});

router.use(requireAuth, requireRole(...shopRoles));

router.get("/", (req, res, next) => {
  listTicketsController(req, res).catch(next);
});

// Must come before /:id so "new" is not treated as a ticket ID
router.get("/new", (_req, res) => {
  res.json({ ticket: null });
});

router.get("/:id", (req, res, next) => {
  getTicketController(req, res).catch(next);
});

router.post("/", requireRole(UserRole.TENANT_ADMIN, UserRole.SHOP_OWNER, UserRole.SERVICE_ADVISOR), (req, res, next) => {
  createTicketController(req, res).catch(next);
});

router.patch("/:id", requireRole(UserRole.TENANT_ADMIN, UserRole.SHOP_OWNER, UserRole.SERVICE_ADVISOR, UserRole.TECHNICIAN), (req, res, next) => {
  updateTicketController(req, res).catch(next);
});

router.post("/:id/line-items", (req, res, next) => {
  addLineItemController(req, res).catch(next);
});

router.delete("/:id/line-items/:itemId", (req, res, next) => {
  removeLineItemController(req, res).catch(next);
});

router.post("/:id/pay", (req, res, next) => {
  collectPaymentController(req, res).catch(next);
});

export default router;
