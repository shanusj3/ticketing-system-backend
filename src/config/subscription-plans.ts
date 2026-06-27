import { SubscriptionPlan } from "@prisma/client";

export type PlanFeature =
  | "ticketManagement"
  | "customerManagement"
  | "invoiceGeneration"
  | "repairTrackingPortal"
  | "technicianDashboard"
  | "activityLog"
  | "reportsAnalytics"
  | "fileAttachments"
  | "branchManagement"
  | "whatsappNotifications"
  | "individualUserDashboards";

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  priceInr: number;
  priceLabel: string;
  tagline: string;
  maxTicketsPerPeriod: number | null;
  maxUsers: number | null;
  maxBranches: number | null;
  whatsappBaseMessages: number;
  features: PlanFeature[];
  includedLabels: string[];
  notIncludedLabels: string[];
  badge: string | null;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    priceInr: 699,
    priceLabel: "₹699/month",
    tagline: "Perfect for small repair shops",
    maxTicketsPerPeriod: 500,
    maxUsers: 3,
    maxBranches: 1,
    whatsappBaseMessages: 0,
    badge: null,
    features: [
      "ticketManagement",
      "customerManagement",
      "invoiceGeneration",
      "repairTrackingPortal",
      "technicianDashboard",
      "activityLog",
      "reportsAnalytics",
    ],
    includedLabels: [
      "500 Repair Tickets / Month",
      "Up to 3 Users",
      "Ticket Management",
      "Customer Management",
      "Invoice Generation",
      "Repair Tracking Portal",
      "Technician Dashboard",
      "Activity Log",
      "Reports & Analytics",
      "Email Support",
    ],
    notIncludedLabels: [
      "Branch Management",
      "File Attachments",
      "WhatsApp Notifications",
    ],
  },
  BUSINESS: {
    id: "BUSINESS",
    name: "Business",
    priceInr: 999,
    priceLabel: "₹999/month",
    tagline: "For growing service centers",
    maxTicketsPerPeriod: 1000,
    maxUsers: null,
    maxBranches: 3,
    whatsappBaseMessages: 0,
    badge: "Most Popular",
    features: [
      "ticketManagement",
      "customerManagement",
      "invoiceGeneration",
      "repairTrackingPortal",
      "activityLog",
      "reportsAnalytics",
      "fileAttachments",
      "branchManagement",
      "individualUserDashboards",
    ],
    includedLabels: [
      "1000 Repair Tickets / Month",
      "Unlimited Users",
      "Ticket Management",
      "Customer Management",
      "Invoice Generation",
      "Repair Tracking Portal",
      "File Uploads & Attachments",
      "Activity Log",
      "Reports & Analytics",
      "Individual User Dashboards",
      "Up to 3 Branches",
      "Priority Support",
    ],
    notIncludedLabels: ["WhatsApp Notifications"],
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    priceInr: 2500,
    priceLabel: "₹2,500/month",
    tagline: "For multi-location repair businesses",
    maxTicketsPerPeriod: null,
    maxUsers: null,
    maxBranches: null,
    whatsappBaseMessages: 1000,
    badge: "Full Suite",
    features: [
      "ticketManagement",
      "customerManagement",
      "invoiceGeneration",
      "repairTrackingPortal",
      "technicianDashboard",
      "activityLog",
      "reportsAnalytics",
      "fileAttachments",
      "branchManagement",
      "whatsappNotifications",
      "individualUserDashboards",
    ],
    includedLabels: [
      "Unlimited Repair Tickets",
      "Unlimited Users",
      "Unlimited Branches",
      "File Uploads & Attachments",
      "Reports & Analytics",
      "Activity Log",
      "Individual User Dashboards",
      "Dedicated Account Manager",
      "Priority 24/7 Support",
      "WhatsApp: Device Received Confirmation",
      "WhatsApp: Repair Status Updates",
      "WhatsApp: Ready for Pickup Notification",
      "WhatsApp: Invoice Delivery via WhatsApp",
      "WhatsApp: Customer Tracking Link",
      "WhatsApp: Delivery Confirmation",
      "1,000 WhatsApp Notifications/month",
      "Top-Up Notifications Available",
      "Custom Integrations",
      "White Label Options",
    ],
    notIncludedLabels: [],
  },
};

export function getPlanDefinition(plan: SubscriptionPlan): PlanDefinition {
  return SUBSCRIPTION_PLANS[plan];
}

export function planHasFeature(plan: SubscriptionPlan, feature: PlanFeature): boolean {
  return SUBSCRIPTION_PLANS[plan].features.includes(feature);
}

export const WHATSAPP_TOPUP_PACKAGES = [
  { messages: 500,  priceInr: 99  },
  { messages: 1000, priceInr: 179 },
  { messages: 2500, priceInr: 399 },
];
