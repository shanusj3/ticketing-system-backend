import { prisma } from "../../config/database";
import { getPlanDefinition } from "../../config/subscription-plans";

// ─── Store WhatsApp Credentials (from Meta Embedded Signup) ──────────────────

export async function storeWhatsappCredentials(
  tenantId: string,
  input: {
    phoneNumberId: string;
    businessAccountId: string;
    accessToken: string;
    wabaPhoneNumber: string;
  }
) {
  // Verify tenant is on Enterprise plan
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { subscriptionPlan: true, name: true },
  });

  const plan = getPlanDefinition(tenant.subscriptionPlan);
  if (!plan.features.includes("whatsappNotifications")) {
    throw Object.assign(
      new Error(
        `WhatsApp integration requires the Enterprise plan. Tenant "${tenant.name}" is on ${plan.name}.`
      ),
      { status: 403, code: "FEATURE_NOT_AVAILABLE" }
    );
  }

  const whatsapp = await prisma.tenantWhatsapp.upsert({
    where: { tenantId },
    create: {
      tenantId,
      phoneNumberId: input.phoneNumberId,
      businessAccountId: input.businessAccountId,
      accessToken: input.accessToken,
      wabaPhoneNumber: input.wabaPhoneNumber,
      status: "CONNECTED",
    },
    update: {
      phoneNumberId: input.phoneNumberId,
      businessAccountId: input.businessAccountId,
      accessToken: input.accessToken,
      wabaPhoneNumber: input.wabaPhoneNumber,
      status: "CONNECTED",
    },
  });

  // Initialize notification usage for current month if not exists
  const month = getCurrentMonth();
  await prisma.notificationUsage.upsert({
    where: { tenantId_month: { tenantId, month } },
    create: { tenantId, month, used: 0, limit: plan.whatsappBaseMessages },
    update: {},
  });

  return {
    id: whatsapp.id,
    tenantId: whatsapp.tenantId,
    wabaPhoneNumber: whatsapp.wabaPhoneNumber,
    status: whatsapp.status,
    connectedAt: whatsapp.connectedAt,
  };
}

// ─── Get WhatsApp (Super Admin — full data) ───────────────────────────────────

export async function getWhatsappAdmin(tenantId: string) {
  const whatsapp = await prisma.tenantWhatsapp.findUnique({
    where: { tenantId },
  });
  if (!whatsapp) return null;
  return whatsapp;
}

// ─── Get WhatsApp (Tenant View — hides secrets) ───────────────────────────────

export async function getWhatsappTenant(tenantId: string) {
  const whatsapp = await prisma.tenantWhatsapp.findUnique({
    where: { tenantId },
    select: {
      id: true,
      tenantId: true,
      wabaPhoneNumber: true,
      status: true,
      connectedAt: true,
      updatedAt: true,
      // Never expose: accessToken, businessAccountId, phoneNumberId
    },
  });

  if (!whatsapp) return null;

  const month = getCurrentMonth();
  const usage = await prisma.notificationUsage.findUnique({
    where: { tenantId_month: { tenantId, month } },
    select: { used: true, limit: true },
  });

  return {
    ...whatsapp,
    usage: usage ? { used: usage.used, limit: usage.limit } : { used: 0, limit: 0 },
  };
}

// ─── Disconnect WhatsApp ──────────────────────────────────────────────────────

export async function disconnectWhatsapp(tenantId: string) {
  await prisma.tenantWhatsapp.update({
    where: { tenantId },
    data: { status: "DISCONNECTED" },
  });
}

// ─── Get All Tenants WhatsApp Status (Super Admin) ───────────────────────────

export async function getAllWhatsappStatus() {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      subscriptionPlan: true,
      whatsapp: {
        select: {
          wabaPhoneNumber: true,
          status: true,
          connectedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return tenants.map((t) => ({
    tenantId: t.id,
    tenantName: t.name,
    plan: t.subscriptionPlan,
    whatsapp: t.whatsapp
      ? {
          phoneNumber: t.whatsapp.wabaPhoneNumber,
          status: t.whatsapp.status,
          connectedAt: t.whatsapp.connectedAt,
        }
      : null,
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
