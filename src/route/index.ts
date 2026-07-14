import { Router } from "express";
import authRoutes from "../modules/auth/auth.route";
import superAdminRoutes from "../modules/super-admin/super-admin.route";
import shopRoutes from "../modules/shop/shop.route";
import ticketRoutes from "../modules/tickets/tickets.route";
import invoiceRoutes from "../modules/invoices/invoices.route";
import trackRoutes from "../modules/track/track.route";
import uploadRoutes from "../modules/upload/upload.route";
import tenantRoutes from "../modules/tenant/tenant.route";
import customerRoutes from "../modules/customers/customers.route";
import whatsappRoutes from "../modules/whatsapp/whatsapp.route";

const router = Router();

router.use("/auth", authRoutes);
router.use("/super-admin", superAdminRoutes);
router.use("/shop", shopRoutes);
router.use("/tickets", ticketRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/track", trackRoutes);
router.use("/upload", uploadRoutes);
router.use("/tenants", tenantRoutes);
router.use("/customers", customerRoutes);
router.use("/whatsapp", whatsappRoutes);

export default router;
