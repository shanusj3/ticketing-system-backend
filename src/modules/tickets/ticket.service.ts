import { Prisma, TicketStatus } from "@prisma/client";
import { prisma } from "../../config/database";
import { assertTicketLimit } from "../subscription/subscription.service";
import {
  sendRepairReceived,
  sendStatusUpdate,
  sendInvoiceDelivery,
} from "../notifications/notification.service";

async function nextTicketNumber(tenantId: string) {
  const count = await prisma.ticket.count({ where: { tenantId } });
  return `TK-${String(count + 1).padStart(4, "0")}`;
}

export function formatStatus(status: string) {
  if (status === "PAYMENT_COMPLETED") return "Payment Completed";
  return status
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function formatDeviceType(type: string) {
  if (type === "MOBILE") return "Mobile";
  if (type === "LAPTOP") return "Laptop";
  return "Other";
}

function serializeTicket(ticket: {
  id: string;
  ticketNumber: string;
  issue: string;
  description: string | null;
  deviceType: string;
  deviceBrand: string | null;
  deviceModel: string;
  deviceColor: string | null;
  imei: string | null;
  condition: string | null;
  accessories: string | null;
  priority: string;
  status: string;
  estimatedCost: Prisma.Decimal | null;
  invoiceAmount: Prisma.Decimal | null;
  paymentStatus: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string; phone: string; email: string | null };
  technician: { id: string; name: string; email: string } | null;
  lineItems: { id: string; type: string; name: string; quantity: number; unitPrice: Prisma.Decimal; totalPrice: Prisma.Decimal }[];
}) {
  const calculatedTotal = ticket.lineItems.reduce((acc, item) => acc + Number(item.totalPrice), 0);
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    customer: ticket.customer.name,
    customerId: ticket.customer.id,
    customerPhone: ticket.customer.phone,
    customerEmail: ticket.customer.email,
    device: ticket.deviceModel,
    deviceBrand: ticket.deviceBrand,
    type: formatDeviceType(ticket.deviceType),
    deviceType: ticket.deviceType,
    issue: ticket.issue,
    description: ticket.description,
    deviceColor: ticket.deviceColor,
    imei: ticket.imei,
    condition: ticket.condition,
    accessories: ticket.accessories,
    priority: ticket.priority,
    status: ticket.status,
    statusLabel: formatStatus(ticket.status),
    technician: ticket.technician?.name ?? "Unassigned",
    technicianId: ticket.technician?.id ?? null,
    estimatedCost: ticket.estimatedCost ? Number(ticket.estimatedCost) : null,
    invoiceAmount: ticket.invoiceAmount ? Number(ticket.invoiceAmount) : calculatedTotal,
    calculatedTotal,
    lineItems: ticket.lineItems.map(item => ({
      id: item.id,
      type: item.type,
      name: item.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice)
    })),
    paymentStatus: ticket.paymentStatus,
    completedAt: ticket.completedAt,
    date: ticket.createdAt.toISOString().split("T")[0],
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

const ticketInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true } },
  technician: { select: { id: true, name: true, email: true } },
  lineItems: true,
} as const;

export async function listTickets(tenantId: string, user: { userId: string; role: string }) {
  const whereClause: Prisma.TicketWhereInput = { tenantId };
  if (user.role === "TECHNICIAN") {
    whereClause.technicianId = user.userId;
  }
  
  const tickets = await prisma.ticket.findMany({
    where: whereClause,
    include: ticketInclude,
    orderBy: { createdAt: "desc" },
  });
  return tickets.map(serializeTicket);
}

export async function getTicket(tenantId: string, idOrNumber: string, user: { userId: string; role: string }) {
  const whereClause: Prisma.TicketWhereInput = {
    tenantId,
    OR: [{ id: idOrNumber }, { ticketNumber: idOrNumber }],
  };

  const ticket = await prisma.ticket.findFirst({
    where: whereClause,
    include: ticketInclude,
  });

  if (!ticket) {
    throw Object.assign(new Error("Ticket not found"), { status: 404 });
  }

  return serializeTicket(ticket);
}

export async function createTicket(
  tenantId: string,
  input: {
    customerId: string;
    technicianId?: string | null;
    issue: string;
    description?: string | null;
    deviceType: import("@prisma/client").DeviceType;
    deviceBrand?: string | null;
    deviceModel: string;
    deviceColor?: string | null;
    imei?: string | null;
    condition?: string | null;
    accessories?: string | null;
    priority: import("@prisma/client").TicketPriority;
    estimatedCost?: number | null;
  }
) {
  await assertTicketLimit(tenantId);

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId },
  });
  if (!customer) {
    throw Object.assign(new Error("Customer not found"), { status: 404 });
  }

  if (input.technicianId) {
    const tech = await prisma.user.findFirst({
      where: { id: input.technicianId, tenantId, role: "TECHNICIAN" },
    });
    if (!tech) {
      throw Object.assign(new Error("Technician not found"), { status: 404 });
    }
  }

  const ticketNumber = await nextTicketNumber(tenantId);

  const ticket = await prisma.ticket.create({
    data: {
      tenantId,
      customerId: input.customerId,
      technicianId: input.technicianId ?? null,
      ticketNumber,
      issue: input.issue,
      description: input.description ?? null,
      deviceType: input.deviceType,
      deviceBrand: input.deviceBrand ?? null,
      deviceModel: input.deviceModel,
      deviceColor: input.deviceColor ?? null,
      imei: input.imei ?? null,
      condition: input.condition ?? null,
      accessories: input.accessories ?? null,
      priority: input.priority,
      estimatedCost: input.estimatedCost ?? null,
    },
    include: ticketInclude,
  });

  sendRepairReceived(ticket.id).catch((err) => console.error("Failed to send repair received notification:", err));

  return serializeTicket(ticket);
}

export async function updateTicket(
  tenantId: string,
  idOrNumber: string,
  input: {
    technicianId?: string | null;
    status?: TicketStatus;
    issue?: string;
    description?: string | null;
    priority?: import("@prisma/client").TicketPriority;
    estimatedCost?: number | null;
    invoiceAmount?: number | null;
    paymentStatus?: import("@prisma/client").PaymentStatus;
  }
) {
  const existing = await prisma.ticket.findFirst({
    where: { tenantId, OR: [{ id: idOrNumber }, { ticketNumber: idOrNumber }] },
  });
  if (!existing) {
    throw Object.assign(new Error("Ticket not found"), { status: 404 });
  }

  const completedAt =
    input.status === TicketStatus.COMPLETED && existing.status !== TicketStatus.COMPLETED
      ? new Date()
      : input.status && input.status !== TicketStatus.COMPLETED
        ? null
        : existing.completedAt;

  const ticket = await prisma.ticket.update({
    where: { id: existing.id },
    data: {
      ...input,
      completedAt,
    },
    include: ticketInclude,
  });

  if (input.status && input.status !== existing.status) {
    sendStatusUpdate(ticket.id, input.status).catch((err) => console.error("Failed to send status update notification:", err));
  }

  if (input.invoiceAmount && input.invoiceAmount !== Number(existing.invoiceAmount)) {
    sendInvoiceDelivery(ticket.id).catch((err) => console.error("Failed to send invoice notification:", err));
  }

  return serializeTicket(ticket);
}

export async function lookupPublicTicket(tenantSlug: string, ticketNumber: string, phone: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || tenant.status !== "ACTIVE") {
    throw Object.assign(new Error("Shop not found"), { status: 404 });
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      tenantId: tenant.id,
      ticketNumber: ticketNumber.toUpperCase(),
      customer: { phone },
    },
    include: ticketInclude,
  });

  if (!ticket) {
    throw Object.assign(new Error("Ticket not found. Check ticket number and phone."), { status: 404 });
  }

  return serializeTicket(ticket);
}

export async function addLineItem(
  tenantId: string,
  ticketId: string,
  userId: string,
  input: {
    type: import("@prisma/client").LineItemType;
    name: string;
    quantity: number;
    unitPrice: number;
  }
) {
  const existing = await prisma.ticket.findFirst({
    where: { tenantId, id: ticketId },
  });
  if (!existing) {
    throw Object.assign(new Error("Ticket not found"), { status: 404 });
  }

  const totalPrice = input.quantity * input.unitPrice;

  await prisma.ticketLineItem.create({
    data: {
      ticketId: existing.id,
      type: input.type,
      name: input.name,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      totalPrice,
      addedById: userId,
    },
  });

  const updatedTicket = await prisma.ticket.findUniqueOrThrow({
    where: { id: existing.id },
    include: ticketInclude,
  });

  return serializeTicket(updatedTicket);
}

export async function removeLineItem(tenantId: string, ticketId: string, itemId: string) {
  const existing = await prisma.ticket.findFirst({
    where: { tenantId, id: ticketId },
  });
  if (!existing) {
    throw Object.assign(new Error("Ticket not found"), { status: 404 });
  }

  await prisma.ticketLineItem.deleteMany({
    where: { id: itemId, ticketId: existing.id },
  });

  const updatedTicket = await prisma.ticket.findUniqueOrThrow({
    where: { id: existing.id },
    include: ticketInclude,
  });

  return serializeTicket(updatedTicket);
}

export async function collectPayment(tenantId: string, ticketId: string) {
  const existing = await prisma.ticket.findFirst({
    where: { tenantId, id: ticketId },
  });
  if (!existing) {
    throw Object.assign(new Error("Ticket not found"), { status: 404 });
  }

  const updatedTicket = await prisma.ticket.update({
    where: { id: existing.id },
    data: {
      paymentStatus: "PAID",
      status: "PAYMENT_COMPLETED",
    },
    include: ticketInclude,
  });

  sendStatusUpdate(updatedTicket.id, "PAYMENT_COMPLETED").catch((err) => console.error("Failed to send payment completed notification:", err));

  return serializeTicket(updatedTicket);
}
