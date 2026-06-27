import { NotificationType, NotificationStatus } from "@prisma/client";
import { prisma } from "../../config/database";
import { getCurrentMonth } from "../whatsapp/whatsapp.service";
import { WHATSAPP_TOPUP_PACKAGES } from "../../config/subscription-plans";

// ─── Usage Tracking ───────────────────────────────────────────────────────────

export async function getOrCreateUsage(tenantId: string) {
  const month = getCurrentMonth();
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { subscriptionPlan: true },
  });

  // Enterprise base: 1000, others: 0
  const defaultLimit = tenant.subscriptionPlan === "ENTERPRISE" ? 1000 : 0;

  return prisma.notificationUsage.upsert({
    where: { tenantId_month: { tenantId, month } },
    create: { tenantId, month, used: 0, limit: defaultLimit },
    update: {},
  });
}

export async function assertNotificationLimit(tenantId: string) {
  const usage = await getOrCreateUsage(tenantId);

  if (usage.used >= usage.limit) {
    throw Object.assign(
      new Error(
        `WhatsApp notification limit reached. You have used ${usage.used}/${usage.limit} notifications this month. ` +
          `Purchase a top-up to send more notifications.`
      ),
      { status: 403, code: "NOTIFICATION_LIMIT_REACHED" }
    );
  }
}

export async function incrementNotificationUsage(tenantId: string) {
  const month = getCurrentMonth();
  await prisma.notificationUsage.update({
    where: { tenantId_month: { tenantId, month } },
    data: { used: { increment: 1 } },
  });
}

// ─── Log Helper ───────────────────────────────────────────────────────────────

async function logNotification(
  tenantId: string,
  ticketId: string | null,
  customerPhone: string,
  customerName: string | null,
  type: NotificationType,
  status: NotificationStatus,
  metaMessageId?: string,
  errorMessage?: string
) {
  return prisma.notificationLog.create({
    data: {
      tenantId,
      ticketId,
      customerPhone,
      customerName,
      type,
      status,
      metaMessageId,
      errorMessage,
    },
  });
}

// ─── Send WhatsApp Message (Meta Cloud API) ───────────────────────────────────

async function sendWhatsappMessage(params: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  components?: object[];
}): Promise<{ messageId: string }> {
  const url = `https://graph.facebook.com/v19.0/${params.phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: params.to.replace(/\D/g, ""), // strip non-digits
    type: "template",
    template: {
      name: params.templateName,
      language: { code: "en" },
      components: params.components ?? [],
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Meta API error: ${(error as any)?.error?.message ?? response.statusText}`
    );
  }

  const data = (await response.json()) as { messages?: [{ id: string }] };
  return { messageId: data.messages?.[0]?.id ?? "unknown" };
}

// ─── Notification Senders ─────────────────────────────────────────────────────

export async function sendRepairReceived(ticketId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId },
    include: {
      customer: true,
      tenant: { include: { whatsapp: true } },
    },
  });

  if (!ticket?.tenant?.whatsapp || ticket.tenant.whatsapp.status !== "CONNECTED") return;

  const { whatsapp, id: tenantId } = ticket.tenant;

  try {
    await assertNotificationLimit(tenantId);

    const { messageId } = await sendWhatsappMessage({
      accessToken: whatsapp.accessToken,
      phoneNumberId: whatsapp.phoneNumberId,
      to: ticket.customer.phone,
      templateName: "repair_received",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: ticket.customer.name },
            { type: "text", text: ticket.ticketNumber },
            { type: "text", text: ticket.deviceModel },
          ],
        },
      ],
    });

    await incrementNotificationUsage(tenantId);
    await logNotification(
      tenantId,
      ticketId,
      ticket.customer.phone,
      ticket.customer.name,
      "REPAIR_RECEIVED",
      "SENT",
      messageId
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logNotification(
      tenantId,
      ticketId,
      ticket.customer.phone,
      ticket.customer.name,
      "REPAIR_RECEIVED",
      "FAILED",
      undefined,
      msg
    );
  }
}

export async function sendStatusUpdate(ticketId: string, newStatus: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId },
    include: {
      customer: true,
      tenant: { include: { whatsapp: true } },
    },
  });

  if (!ticket?.tenant?.whatsapp || ticket.tenant.whatsapp.status !== "CONNECTED") return;

  const { whatsapp, id: tenantId } = ticket.tenant;

  const statusLabel = newStatus
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");

  let type: NotificationType = "STATUS_UPDATE";
  let templateName = "repair_status_update";

  if (newStatus === "READY_FOR_PICKUP") {
    type = "READY_FOR_PICKUP";
    templateName = "ready_for_pickup";
  } else if (newStatus === "PAYMENT_COMPLETED" || newStatus === "COMPLETED") {
    type = "DELIVERY_CONFIRMATION";
    templateName = "delivery_confirmation";
  }

  try {
    await assertNotificationLimit(tenantId);

    const { messageId } = await sendWhatsappMessage({
      accessToken: whatsapp.accessToken,
      phoneNumberId: whatsapp.phoneNumberId,
      to: ticket.customer.phone,
      templateName,
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: ticket.customer.name },
            { type: "text", text: ticket.ticketNumber },
            { type: "text", text: statusLabel },
          ],
        },
      ],
    });

    await incrementNotificationUsage(tenantId);
    await logNotification(
      tenantId,
      ticketId,
      ticket.customer.phone,
      ticket.customer.name,
      type,
      "SENT",
      messageId
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logNotification(
      tenantId,
      ticketId,
      ticket.customer.phone,
      ticket.customer.name,
      type,
      "FAILED",
      undefined,
      msg
    );
  }
}

export async function sendInvoiceDelivery(ticketId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId },
    include: {
      customer: true,
      tenant: { include: { whatsapp: true } },
    },
  });

  if (!ticket?.tenant?.whatsapp || ticket.tenant.whatsapp.status !== "CONNECTED") return;

  const { whatsapp, id: tenantId } = ticket.tenant;

  try {
    await assertNotificationLimit(tenantId);

    const amount = ticket.invoiceAmount ? `₹${Number(ticket.invoiceAmount).toLocaleString()}` : "N/A";

    const { messageId } = await sendWhatsappMessage({
      accessToken: whatsapp.accessToken,
      phoneNumberId: whatsapp.phoneNumberId,
      to: ticket.customer.phone,
      templateName: "invoice_delivery",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: ticket.customer.name },
            { type: "text", text: ticket.ticketNumber },
            { type: "text", text: amount },
          ],
        },
      ],
    });

    await incrementNotificationUsage(tenantId);
    await logNotification(
      tenantId,
      ticketId,
      ticket.customer.phone,
      ticket.customer.name,
      "INVOICE_DELIVERY",
      "SENT",
      messageId
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logNotification(
      tenantId,
      ticketId,
      ticket.customer.phone,
      ticket.customer.name,
      "INVOICE_DELIVERY",
      "FAILED",
      undefined,
      msg
    );
  }
}

// ─── Notification Logs ────────────────────────────────────────────────────────

export async function getNotificationLogs(tenantId: string, limit = 50) {
  return prisma.notificationLog.findMany({
    where: { tenantId },
    orderBy: { sentAt: "desc" },
    take: limit,
  });
}

export async function getNotificationUsage(tenantId: string) {
  const month = getCurrentMonth();
  const usage = await getOrCreateUsage(tenantId);
  return { month, used: usage.used, limit: usage.limit, remaining: Math.max(0, usage.limit - usage.used) };
}

export async function getAllTenantsNotificationUsage() {
  const month = getCurrentMonth();
  return prisma.notificationUsage.findMany({
    where: { month },
    include: {
      tenant: { select: { id: true, name: true, subscriptionPlan: true } },
    },
    orderBy: { used: "desc" },
  });
}

// ─── Top-Up ───────────────────────────────────────────────────────────────────

export async function addNotificationTopUp(tenantId: string, additionalMessages: number) {
  const month = getCurrentMonth();
  await getOrCreateUsage(tenantId); // ensure record exists

  const updated = await prisma.notificationUsage.update({
    where: { tenantId_month: { tenantId, month } },
    data: { limit: { increment: additionalMessages } },
  });

  return { month, used: updated.used, limit: updated.limit, added: additionalMessages };
}

export { WHATSAPP_TOPUP_PACKAGES };
