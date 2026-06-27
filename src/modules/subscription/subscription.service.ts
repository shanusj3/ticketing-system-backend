import { SubscriptionPlan } from "@prisma/client";
import { prisma } from "../../config/database";
import { getPlanDefinition, PlanFeature } from "../../config/subscription-plans";

// ─── Helpers ────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── Ticket Limit (Period-Based) ─────────────────────────────────────────────

export async function assertTicketLimit(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      subscriptionPlan: true,
      subscriptionStartDate: true,
      subscriptionEndDate: true,
      periodTicketCount: true,
    },
  });

  const plan = getPlanDefinition(tenant.subscriptionPlan);

  // If unlimited tickets, no check needed
  if (plan.maxTicketsPerPeriod === null) return;

  const now = new Date();

  // Period expired → reset counter and extend period or transition to queued plan
  if (now > tenant.subscriptionEndDate) {
    // Check if we need to transition to a queued plan first
    const fullTenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { queuedPlan: true, queuedPlanEndDate: true, queuedPlanCustomPriceInr: true }
    });

    if (fullTenant.queuedPlan && fullTenant.queuedPlanEndDate) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          subscriptionPlan: fullTenant.queuedPlan,
          subscriptionStartDate: tenant.subscriptionEndDate,
          subscriptionEndDate: fullTenant.queuedPlanEndDate,
          customPriceInr: fullTenant.queuedPlanCustomPriceInr,
          periodTicketCount: 1, // first ticket of new plan
          queuedPlan: null,
          queuedPlanStartDate: null,
          queuedPlanEndDate: null,
          queuedPlanCustomPriceInr: null,
        },
      });
      return; // Transitioned and allowed
    }

    // Otherwise, auto-extend the current plan's period limits
    const newStart = tenant.subscriptionEndDate;
    const newEnd = addDays(newStart, 30);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        periodTicketCount: 1,
        subscriptionStartDate: newStart,
        subscriptionEndDate: newEnd,
      },
    });
    return; // first ticket of new period, always allowed
  }

  // Within period — check limit
  if (tenant.periodTicketCount >= plan.maxTicketsPerPeriod) {
    throw Object.assign(
      new Error(
        `Ticket limit reached. Your ${plan.name} plan allows ${plan.maxTicketsPerPeriod} tickets per subscription period. ` +
          `Your current period ends on ${tenant.subscriptionEndDate.toLocaleDateString()}. ` +
          `Upgrade your plan to create more tickets.`
      ),
      { status: 403, code: "TICKET_LIMIT_REACHED" }
    );
  }

  // Increment counter
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { periodTicketCount: { increment: 1 } },
  });
}

// ─── User Limit ───────────────────────────────────────────────────────────────

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
        `User limit reached. Your ${plan.name} plan allows up to ${plan.maxUsers} users. ` +
          `Upgrade to Business or Enterprise for unlimited users.`
      ),
      { status: 403, code: "USER_LIMIT_REACHED" }
    );
  }
}

// ─── Branch Limit ─────────────────────────────────────────────────────────────

export async function assertBranchLimit(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      subscriptionPlan: true,
      _count: { select: { branches: true } },
    },
  });

  const plan = getPlanDefinition(tenant.subscriptionPlan);

  if (plan.maxBranches === null) return; // unlimited

  if (tenant._count.branches >= plan.maxBranches) {
    throw Object.assign(
      new Error(
        `Branch limit reached. Your ${plan.name} plan allows up to ${plan.maxBranches} branch${plan.maxBranches > 1 ? "es" : ""}. ` +
          `Upgrade to Enterprise for unlimited branches.`
      ),
      { status: 403, code: "BRANCH_LIMIT_REACHED" }
    );
  }
}

// ─── Feature Gate ─────────────────────────────────────────────────────────────

export async function assertPlanFeature(tenantId: string, feature: PlanFeature) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { subscriptionPlan: true },
  });

  const plan = getPlanDefinition(tenant.subscriptionPlan);
  if (!plan.features.includes(feature)) {
    const featureUpgradeMap: Record<string, string> = {
      fileAttachments: "Business or Enterprise",
      branchManagement: "Business or Enterprise",
      whatsappNotifications: "Enterprise",
      individualUserDashboards: "Business or Enterprise",
    };
    const requiredPlan = featureUpgradeMap[feature] ?? "a higher";
    throw Object.assign(
      new Error(
        `This feature requires the ${requiredPlan} plan. You are currently on the ${plan.name} plan.`
      ),
      { status: 403, code: "FEATURE_NOT_AVAILABLE" }
    );
  }
}

// ─── Get Tenant Subscription Info ────────────────────────────────────────────

export async function getTenantSubscription(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      subscriptionPlan: true,
      subscriptionStartDate: true,
      subscriptionEndDate: true,
      periodTicketCount: true,
      customPriceInr: true,
      status: true,
      queuedPlan: true,
      queuedPlanStartDate: true,
      queuedPlanEndDate: true,
      queuedPlanCustomPriceInr: true,
      _count: { select: { users: true, tickets: true, branches: true } },
    },
  });

  const plan = getPlanDefinition(tenant.subscriptionPlan);

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    tenantLogoUrl: tenant.logoUrl,
    status: tenant.status,
    plan: {
      id: plan.id,
      name: plan.name,
      priceInr: tenant.customPriceInr ?? plan.priceInr,
      maxUsers: plan.maxUsers,
      maxBranches: plan.maxBranches,
      maxTicketsPerPeriod: plan.maxTicketsPerPeriod,
      whatsappBaseMessages: plan.whatsappBaseMessages,
      features: plan.features,
      includedLabels: plan.includedLabels,
      notIncludedLabels: plan.notIncludedLabels,
    },
    subscription: {
      startDate: tenant.subscriptionStartDate,
      endDate: tenant.subscriptionEndDate,
      daysRemaining: Math.max(
        0,
        Math.ceil(
          (tenant.subscriptionEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      ),
    },
    usage: {
      users: tenant._count.users,
      branches: tenant._count.branches,
      tickets: tenant._count.tickets,
      periodTickets: tenant.periodTicketCount,
    },
    queuedPlan: tenant.queuedPlan ? {
      id: tenant.queuedPlan,
      name: getPlanDefinition(tenant.queuedPlan).name,
      startDate: tenant.queuedPlanStartDate,
      endDate: tenant.queuedPlanEndDate,
      priceInr: tenant.queuedPlanCustomPriceInr ?? getPlanDefinition(tenant.queuedPlan).priceInr,
    } : null,
  };
}

// ─── Switch Plan ──────────────────────────────────────────────────────────────

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  STARTER: 1,
  BUSINESS: 2,
  ENTERPRISE: 3,
};

export async function switchTenantPlan(
  tenantId: string,
  newPlan: SubscriptionPlan,
  durationMonths: number = 1,
  customPriceInr?: number
) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { subscriptionPlan: true, subscriptionEndDate: true },
  });

  const now = new Date();
  const currentPlanRank = PLAN_RANK[tenant.subscriptionPlan];
  const newPlanRank = PLAN_RANK[newPlan];
  const durationDays = durationMonths * 30;

  if (newPlanRank >= currentPlanRank) {
    // UPGRADE or SAME PLAN: Apply immediately, add remaining days
    const remainingDays = Math.max(0, Math.ceil((tenant.subscriptionEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const newEnd = addDays(now, durationDays + remainingDays);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionPlan: newPlan,
        subscriptionStartDate: now,
        subscriptionEndDate: newEnd,
        periodTicketCount: 0,
        customPriceInr: customPriceInr ?? null,
        queuedPlan: null,
        queuedPlanStartDate: null,
        queuedPlanEndDate: null,
        queuedPlanCustomPriceInr: null,
      },
    });
  } else {
    // DOWNGRADE: Queue the plan to start after the current plan expires
    const queuedStartDate = tenant.subscriptionEndDate > now ? tenant.subscriptionEndDate : now;
    const queuedEndDate = addDays(queuedStartDate, durationDays);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        queuedPlan: newPlan,
        queuedPlanStartDate: queuedStartDate,
        queuedPlanEndDate: queuedEndDate,
        queuedPlanCustomPriceInr: customPriceInr ?? null,
      },
    });
  }

  return getTenantSubscription(tenantId);
}

// ─── List All Plans ───────────────────────────────────────────────────────────

export function listAllPlans() {
  return (["STARTER", "BUSINESS", "ENTERPRISE"] as SubscriptionPlan[]).map((id) =>
    getPlanDefinition(id)
  );
}
