import { Router } from "express";
import authRoutes from "../modules/auth/auth.route";
import tenantRoutes from "../modules/tenants/tenant.route";
import subscriptionRoutes from "../modules/subscription/subscription.route";
import userRoutes from "../modules/users/user.route";
import customerRoutes from "../modules/customers/customer.route";
import ticketRoutes from "../modules/tickets/ticket.route";
import dashboardRoutes from "../modules/dashboard/dashboard.route";
import whatsappRoutes from "../modules/whatsapp/whatsapp.route";
import notificationRoutes from "../modules/notifications/notification.route";
import uploadRoutes from "../modules/uploads/upload.route";
import { requireActiveTenant } from "../modules/auth/auth.permission";

const router = Router();

router.use("/auth", authRoutes);
router.use("/tenants", tenantRoutes);
router.use("/subscription", subscriptionRoutes);

// Apply active tenant guard to all tenant-level data routes
router.use("/users", requireActiveTenant, userRoutes);
router.use("/customers", requireActiveTenant, customerRoutes);
router.use("/tickets", requireActiveTenant, ticketRoutes);
router.use("/dashboard", requireActiveTenant, dashboardRoutes);
router.use("/whatsapp", requireActiveTenant, whatsappRoutes);
router.use("/notifications", requireActiveTenant, notificationRoutes);
router.use("/uploads", requireActiveTenant, uploadRoutes);

export default router;
