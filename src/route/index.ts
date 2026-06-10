import { Router } from "express";
import authRoutes from "../modules/auth/auth.route";
import tenantRoutes from "../modules/tenants/tenant.route";
import subscriptionRoutes from "../modules/subscription/subscription.route";
import userRoutes from "../modules/users/user.route";
import customerRoutes from "../modules/customers/customer.route";
import ticketRoutes from "../modules/tickets/ticket.route";
import dashboardRoutes from "../modules/dashboard/dashboard.route";

const router = Router();

router.use("/auth", authRoutes);
router.use("/tenants", tenantRoutes);
router.use("/subscription", subscriptionRoutes);
router.use("/users", userRoutes);
router.use("/customers", customerRoutes);
router.use("/tickets", ticketRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;
