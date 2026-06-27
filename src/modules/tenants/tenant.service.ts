import bcrypt from "bcryptjs";
import { Prisma, SubscriptionPlan, UserRole } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/database";
import { getPlanDefinition } from "../../config/subscription-plans";
import { switchTenantPlan } from "../subscription/subscription.service";

function toSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueTenantSlug(name: string) {
  const baseSlug = toSlug(name);
  if (!baseSlug) {
    throw Object.assign(new Error("Tenant name must include letters or numbers"), { status: 400 });
  }

  let slug = baseSlug;
  let counter = 2;

  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── List Tenants (paginated + filtered) ────────────────────────────────────

export type TenantExpiryFilter = "expires_7days" | "expires_3days" | "expired";

export interface ListTenantsParams {
  page?: number;
  limit?: number;
  search?: string;          // matches name, email, phone
  status?: string;          // ACTIVE | SUSPENDED
  plan?: string;            // STARTER | BUSINESS | ENTERPRISE
  expiry?: TenantExpiryFilter;
}

export async function listTenants(params: ListTenantsParams = {}) {
  const page  = Math.max(1, params.page  ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip  = (page - 1) * limit;

  const now = new Date();

  const where: Prisma.TenantWhereInput = {};

  // Search across name, email, phone
  if (params.search) {
    const q = params.search.trim();
    where.OR = [
      { name:  { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }

  // Status filter
  if (params.status) {
    where.status = params.status as any;
  }

  // Subscription plan filter
  if (params.plan) {
    where.subscriptionPlan = params.plan as any;
  }

  // Expiry window filters
  if (params.expiry) {
    if (params.expiry === "expired") {
      where.subscriptionEndDate = { lt: now };
    } else if (params.expiry === "expires_7days") {
      const in7 = new Date(now);
      in7.setDate(in7.getDate() + 7);
      where.subscriptionEndDate = { gte: now, lte: in7 };
    } else if (params.expiry === "expires_3days") {
      const in3 = new Date(now);
      in3.setDate(in3.getDate() + 3);
      where.subscriptionEndDate = { gte: now, lte: in3 };
    }
  }

  const [total, tenants] = await prisma.$transaction([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        _count: { select: { users: true, tickets: true, branches: true } },
        whatsapp: { select: { wabaPhoneNumber: true, status: true } },
      },
    }),
  ]);

  return {
    tenants,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Create Tenant ────────────────────────────────────────────────────────────

export async function createTenant(input: {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  mobile?: string | null;
  slug: string;
  primaryColor: string;
  logoUrl?: string | null;
  subscriptionPlan: SubscriptionPlan;
  customPriceInr?: number | null;
}) {
  const existingSlug = await prisma.tenant.findUnique({ where: { slug: input.slug } });
  if (existingSlug) {
    throw Object.assign(new Error("Slug is already taken"), { status: 400 });
  }

  const domain = `${input.slug}.${env.appDomain}`;

  const now = new Date();
  const subscriptionEndDate = addDays(now, 30);

  // Generate random password for owner
  const rawPassword = `Pass-${Math.random().toString(36).slice(-8)}${Math.floor(100 + Math.random() * 900)}!`;
  const passwordHash = await bcrypt.hash(rawPassword, 12);

  try {
    const tenant = await prisma.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        domain,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone,
        mobile: input.mobile,
        primaryColor: input.primaryColor,
        logoUrl: input.logoUrl,
        subscriptionPlan: input.subscriptionPlan,
        subscriptionStartDate: now,
        subscriptionEndDate,
        customPriceInr: input.customPriceInr ?? null,
        periodTicketCount: 0,
        users: {
          create: {
            name: input.contactName,
            email: input.email,
            passwordHash,
            role: UserRole.TENANT_ADMIN,
          },
        },
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return {
      tenant,
      ownerPassword: rawPassword,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw Object.assign(new Error("Tenant or owner email already exists"), { status: 409 });
    }
    throw error;
  }
}

// ─── Get Tenant by ID (Super Admin full detail) ───────────────────────────────

export async function getTenantById(id: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      _count: {
        select: { users: true, tickets: true, branches: true },
      },
      whatsapp: {
        select: {
          wabaPhoneNumber: true,
          status: true,
          connectedAt: true,
        },
      },
    },
  });

  if (!tenant) {
    throw Object.assign(new Error("Tenant not found"), { status: 404 });
  }

  const plan = getPlanDefinition(tenant.subscriptionPlan);
  const now = new Date();
  const daysRemaining = Math.max(
    0,
    Math.ceil((tenant.subscriptionEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    domain: tenant.domain,
    status: tenant.status,
    contactName: tenant.contactName,
    email: tenant.email,
    phone: tenant.phone,
    mobile: tenant.mobile,
    primaryColor: tenant.primaryColor,
    logoUrl: tenant.logoUrl,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    subscription: {
      plan: {
        id: plan.id,
        name: plan.name,
        priceInr: tenant.customPriceInr ?? plan.priceInr,
        priceLabel: tenant.customPriceInr ? `₹${tenant.customPriceInr.toLocaleString()}/month` : plan.priceLabel,
        maxTicketsPerPeriod: plan.maxTicketsPerPeriod,
        maxUsers: plan.maxUsers,
        maxBranches: plan.maxBranches,
        whatsappBaseMessages: plan.whatsappBaseMessages,
        features: plan.features,
        includedLabels: plan.includedLabels,
        notIncludedLabels: plan.notIncludedLabels,
        badge: plan.badge,
      },
      startDate: tenant.subscriptionStartDate,
      endDate: tenant.subscriptionEndDate,
      daysRemaining,
      periodTicketCount: tenant.periodTicketCount,
    },
    usage: {
      users: tenant._count.users,
      tickets: tenant._count.tickets,
      branches: tenant._count.branches,
      periodTickets: tenant.periodTicketCount,
    },
    whatsapp: tenant.whatsapp
      ? {
          phoneNumber: tenant.whatsapp.wabaPhoneNumber,
          status: tenant.whatsapp.status,
          connectedAt: tenant.whatsapp.connectedAt,
        }
      : null,
  };
}

// ─── Switch Tenant Plan (re-exported for controller) ─────────────────────────

export { switchTenantPlan };

// ─── Public Tenant Details ────────────────────────────────────────────────────

export async function getPublicTenantDetails(slugOrDomain: string) {
  let tenant = await prisma.tenant.findUnique({
    where: { slug: slugOrDomain },
  });

  if (!tenant) {
    tenant = await prisma.tenant.findUnique({
      where: { domain: slugOrDomain },
    });
  }

  if (!tenant) {
    throw Object.assign(new Error("Tenant not found"), { status: 404 });
  }

  return {
    name: tenant.name,
    slug: tenant.slug,
    domain: tenant.domain,
    primaryColor: tenant.primaryColor,
    logoUrl: tenant.logoUrl,
  };
}
