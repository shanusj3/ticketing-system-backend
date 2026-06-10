import { SubscriptionPlan } from "@prisma/client";
import { prisma } from "../../config/database";
import { getPlanDefinition, PlanFeature } from "../../config/subscription-plans";

export async function getTenantSubscription(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      subscriptionPlan: true,
      status: true,
      _count: { select: { users: true, tickets: true } },
    },
  });

  const plan = getPlanDefinition(tenant.subscriptionPlan);

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    status: tenant.status,
    plan: {
      id: plan.id,
      name: plan.name,
      priceInr: plan.priceInr,
      maxUsers: plan.maxUsers,
      features: plan.features,
    },
    usage: {
      users: tenant._count.users,
      tickets: tenant._count.tickets,
    },
  };
}

export async function assertUserLimit(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      subscriptionPlan: true,
      _count: { select: { users: true } },
    },
  });

  const plan = getPlanDefinition(tenant.subscriptionPlan);
  if (plan.maxUsers !== null && tenant._count.users >= plan.maxUsers) {
    throw Object.assign(
      new Error(
        `User limit reached. Your ${plan.name} plan allows up to ${plan.maxUsers} users. Upgrade to Business for unlimited users.`
      ),
      { status: 403, code: "USER_LIMIT_REACHED" }
    );
  }
}

export async function assertPlanFeature(tenantId: string, feature: PlanFeature) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { subscriptionPlan: true },
  });

  const plan = getPlanDefinition(tenant.subscriptionPlan);
  if (!plan.features.includes(feature)) {
    throw Object.assign(
      new Error(
        `This feature requires the Business plan. Your current plan is ${plan.name}.`
      ),
      { status: 403, code: "FEATURE_NOT_AVAILABLE" }
    );
  }
}

export function listAllPlans() {
  return Object.values(
    Object.fromEntries(
      (["PROFESSIONAL", "BUSINESS"] as SubscriptionPlan[]).map((id) => [
        id,
        getPlanDefinition(id),
      ])
    )
  );
}
