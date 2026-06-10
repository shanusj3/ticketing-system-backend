import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

export async function listCustomers(tenantId: string) {
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    include: {
      _count: { select: { tickets: true } },
      tickets: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    repairs: c._count.tickets,
    lastVisit: c.tickets[0]?.createdAt ?? c.createdAt,
    createdAt: c.createdAt,
  }));
}

export async function createCustomer(
  tenantId: string,
  input: { name: string; phone: string; email?: string | null }
) {
  try {
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
      },
    });
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      repairs: 0,
      lastVisit: customer.createdAt,
      createdAt: customer.createdAt,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw Object.assign(new Error("Customer with this phone already exists"), { status: 409 });
    }
    throw error;
  }
}

export async function getCustomer(tenantId: string, id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id, tenantId },
    include: {
      tickets: {
        orderBy: { createdAt: "desc" },
        include: {
          lineItems: true
        }
      },
      _count: { select: { tickets: true } },
    },
  });

  if (!customer) {
    throw Object.assign(new Error("Customer not found"), { status: 404 });
  }

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    repairs: customer._count.tickets,
    lastVisit: customer.tickets[0]?.createdAt ?? customer.createdAt,
    createdAt: customer.createdAt,
    tickets: customer.tickets.map(t => {
      const calculatedTotal = t.lineItems.reduce((acc, item) => acc + Number(item.totalPrice), 0);
      return {
        id: t.id,
        ticketNumber: t.ticketNumber,
        deviceModel: t.deviceModel,
        issue: t.issue,
        status: t.status,
        paymentStatus: t.paymentStatus,
        createdAt: t.createdAt,
        total: t.invoiceAmount ? Number(t.invoiceAmount) : calculatedTotal
      };
    })
  };
}
