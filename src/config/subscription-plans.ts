import { SubscriptionPlan } from "@prisma/client";

export type PlanFeature =
  | "deviceManagement"
  | "technicianAssignment"
  | "billing"
  | "customerPortal"
  | "basicReports"
  | "auditLogs"
  | "inventory"
  | "advancedReports"
  | "technicianAnalytics"
  | "revenueAnalytics"
  | "dataExport";

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  priceInr: number;
  maxUsers: number | null;
  features: PlanFeature[];
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  PROFESSIONAL: {
    id: "PROFESSIONAL",
    name: "Professional",
    priceInr: 999,
    maxUsers: 5,
    features: [
      "deviceManagement",
      "technicianAssignment",
      "billing",
      "customerPortal",
      "basicReports",
      "auditLogs",
    ],
  },
  BUSINESS: {
    id: "BUSINESS",
    name: "Business",
    priceInr: 1999,
    maxUsers: null,
    features: [
      "deviceManagement",
      "technicianAssignment",
      "billing",
      "customerPortal",
      "basicReports",
      "auditLogs",
      "inventory",
      "advancedReports",
      "technicianAnalytics",
      "revenueAnalytics",
      "dataExport",
    ],
  },
};

export function getPlanDefinition(plan: SubscriptionPlan): PlanDefinition {
  return SUBSCRIPTION_PLANS[plan];
}

export function planHasFeature(plan: SubscriptionPlan, feature: PlanFeature): boolean {
  return SUBSCRIPTION_PLANS[plan].features.includes(feature);
}
