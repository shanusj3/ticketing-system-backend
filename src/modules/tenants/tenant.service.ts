import bcrypt from "bcryptjs";
import { Prisma, SubscriptionPlan, UserRole } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/database";

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

export async function listTenants() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { users: true, tickets: true },
      },
    },
  });
}

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
}) {
  const existingSlug = await prisma.tenant.findUnique({ where: { slug: input.slug } });
  if (existingSlug) {
    throw Object.assign(new Error("Slug is already taken"), { status: 400 });
  }

  const domain = `${input.slug}.${env.appDomain}`;
  
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

export async function getPublicTenantDetails(slugOrDomain: string) {
  let tenant = await prisma.tenant.findUnique({
    where: { slug: slugOrDomain },
  });

  if (!tenant) {
    tenant = await prisma.tenant.findUnique({
      where: { domain: slugOrDomain },
    });
  }

  if (!tenant || tenant.status !== "ACTIVE") {
    throw Object.assign(new Error("Tenant not found or inactive"), { status: 404 });
  }

  return {
    name: tenant.name,
    slug: tenant.slug,
    domain: tenant.domain,
    primaryColor: tenant.primaryColor,
    logoUrl: tenant.logoUrl,
  };
}
