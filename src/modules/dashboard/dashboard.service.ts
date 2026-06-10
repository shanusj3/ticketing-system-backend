import { TicketStatus, UserRole } from "@prisma/client";
import { prisma } from "../../config/database";
import { formatStatus } from "../tickets/ticket.service";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function getDashboardStats(tenantId: string, userId: string, userRole: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  if (userRole === UserRole.TECHNICIAN) {
    const [assignedToMe, pendingRepairs, completedTodayTickets, myTicketsData] = await Promise.all([
      prisma.ticket.count({ where: { tenantId, technicianId: userId, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
      prisma.ticket.count({ where: { tenantId, technicianId: userId, status: { in: ["RECEIVED", "DIAGNOSIS"] } } }),
      prisma.ticket.findMany({ where: { tenantId, technicianId: userId, status: "COMPLETED" }, select: { createdAt: true, completedAt: true } }),
      prisma.ticket.findMany({
        where: { tenantId, technicianId: userId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, ticketNumber: true, deviceModel: true, issue: true, priority: true, status: true, createdAt: true }
      }),
    ]);

    let avgTimeStr = "0h";
    if (completedTodayTickets.length > 0) {
      const avgMs = completedTodayTickets.reduce((sum, t) => sum + ((t.completedAt?.getTime() || now.getTime()) - t.createdAt.getTime()), 0) / completedTodayTickets.length;
      avgTimeStr = (avgMs / (1000 * 60 * 60)).toFixed(1) + "h";
    }

    const completedToday = completedTodayTickets.filter(t => t.completedAt && t.completedAt >= todayStart).length;

    return {
      technicianStats: {
        kpis: { assignedToMe, pendingRepairs, completedToday, avgRepairTime: avgTimeStr },
        myTickets: myTicketsData.map(t => {
          const hoursSinceCreation = (now.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
          let timeLabel = hoursSinceCreation > 24 ? "Delayed" : `${Math.max(1, 24 - Math.round(hoursSinceCreation))}h left`;
          return {
            id: t.ticketNumber,
            device: t.deviceModel,
            issue: t.issue,
            priority: t.priority,
            status: formatStatus(t.status),
            time: timeLabel
          };
        }),
      }
    };
  }

  const [
    tickets,
    users,
    customers,
    paidThisMonth,
    pendingPayments,
    weekTickets,
    brandGroups,
    technicians,
    recentIntakes,
    readyForPickup,
  ] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: true,
    }),
    prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { role: true },
    }),
    prisma.customer.count({ where: { tenantId } }),
    prisma.ticket.aggregate({
      where: {
        tenantId,
        paymentStatus: "PAID",
        updatedAt: { gte: monthStart },
      },
      _sum: { invoiceAmount: true },
    }),
    prisma.ticket.aggregate({
      where: { tenantId, paymentStatus: "PENDING" },
      _sum: { invoiceAmount: true, estimatedCost: true },
      _count: true,
    }),
    prisma.ticket.findMany({
      where: { tenantId, createdAt: { gte: weekStart }, paymentStatus: "PAID" },
      select: { createdAt: true, invoiceAmount: true },
    }),
    prisma.ticket.groupBy({
      by: ["deviceBrand"],
      where: { tenantId, deviceBrand: { not: null } },
      _count: true,
      orderBy: { _count: { deviceBrand: "desc" } },
      take: 5,
    }),
    prisma.user.findMany({
      where: { tenantId, role: UserRole.TECHNICIAN, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        assignedTickets: {
          where: {
            status: TicketStatus.COMPLETED,
            completedAt: { gte: monthStart },
          },
          select: { id: true, completedAt: true, createdAt: true },
        },
      },
    }),
    prisma.ticket.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: { select: { name: true } } },
    }),
    prisma.ticket.findMany({
      where: { 
        tenantId, 
        status: { in: ["READY_FOR_PICKUP", "COMPLETED"] },
        paymentStatus: { not: "PAID" }
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { customer: { select: { name: true, phone: true } }, lineItems: true },
    }),
  ]);

  const statusMap = Object.fromEntries(tickets.map((t) => [t.status, t._count]));
  const totalTickets = tickets.reduce((sum, t) => sum + t._count, 0);
  const openTickets =
    (statusMap.RECEIVED ?? 0) +
    (statusMap.DIAGNOSIS ?? 0) +
    (statusMap.IN_PROGRESS ?? 0) +
    (statusMap.READY_FOR_PICKUP ?? 0);
  const completedTickets = statusMap.COMPLETED ?? 0;

  const techniciansCount = users.filter((u) => u.role === UserRole.TECHNICIAN).length;
  const advisorsCount = users.filter((u) => u.role === UserRole.SERVICE_ADVISOR).length;

  const revenueByDay: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    revenueByDay[DAY_NAMES[d.getDay()]] = 0;
  }
  for (const t of weekTickets) {
    const key = DAY_NAMES[t.createdAt.getDay()];
    revenueByDay[key] = (revenueByDay[key] ?? 0) + Number(t.invoiceAmount ?? 0);
  }
  const revenueData = Object.entries(revenueByDay).map(([name, revenue]) => ({ name, revenue }));

  const popularBrands = brandGroups
    .filter((b) => b.deviceBrand)
    .map((b) => ({
      brand: b.deviceBrand as string,
      count: b._count,
    }));

  const maxBrand = popularBrands[0]?.count ?? 1;

  const technicianStats = technicians.map((tech) => {
    const completed = tech.assignedTickets.length;
    const avgHours =
      completed > 0
        ? tech.assignedTickets.reduce((sum, t) => {
            const end = t.completedAt ?? new Date();
            const hours = (end.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
            return sum + hours;
          }, 0) / completed
        : 0;

    return {
      id: tech.id,
      name: tech.name,
      email: tech.email,
      completed,
      avgTime: `${avgHours.toFixed(1)}h`,
      rating: completed > 0 ? Math.min(5, 4 + completed / 50) : 0,
      status: completed > 0 ? "Active" : "Offline",
    };
  });

  const returningCustomers = await prisma.customer.count({
    where: {
      tenantId,
      tickets: { some: {} },
      AND: { tickets: { some: { createdAt: { lt: monthStart } } } },
    },
  });
  const retention = customers > 0 ? Math.round((returningCustomers / customers) * 100) : 0;

  const completedWithTimes = await prisma.ticket.findMany({
    where: { tenantId, status: TicketStatus.COMPLETED, completedAt: { not: null } },
    select: { createdAt: true, completedAt: true },
    take: 100,
    orderBy: { completedAt: "desc" },
  });
  const avgRepairDays =
    completedWithTimes.length > 0
      ? completedWithTimes.reduce((sum, t) => {
          const days =
            ((t.completedAt!.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0) / completedWithTimes.length
      : 0;

  const categoryGroups = await prisma.ticket.groupBy({
    by: ["deviceType"],
    where: { tenantId },
    _count: true,
  });
  const totalForCategories = categoryGroups.reduce((s, c) => s + c._count, 0);
  const categoryData = categoryGroups.map((c) => ({
    name: c.deviceType === "MOBILE" ? "Mobile" : c.deviceType === "LAPTOP" ? "Laptop" : "Other",
    value: totalForCategories > 0 ? Math.round((c._count / totalForCategories) * 100) : 0,
  }));

  const monthlyRevenue = Number(paidThisMonth._sum.invoiceAmount ?? 0);
  const pendingAmount =
    Number(pendingPayments._sum.invoiceAmount ?? 0) ||
    Number(pendingPayments._sum.estimatedCost ?? 0);

  return {
    kpis: {
      monthlyRevenue,
      activeStaff: users.length,
      techniciansCount,
      advisorsCount,
      totalTickets,
      openTickets,
      completedTickets,
      pendingPayments: pendingAmount,
      pendingPaymentTickets: pendingPayments._count,
    },
    revenueData,
    technicians: technicianStats,
    popularBrands: popularBrands.map((b) => ({
      ...b,
      percent: Math.round((b.count / maxBrand) * 100),
    })),
    businessHealth: {
      retention,
      avgRepairDays: Number(avgRepairDays.toFixed(1)),
      partsMargin: completedTickets > 0 ? 34 : 0,
    },
    reports: {
      revenue: monthlyRevenue,
      avgTicketValue: completedTickets > 0 ? Math.round(monthlyRevenue / completedTickets) : 0,
      completed: completedTickets,
      pending: openTickets,
      categoryData,
      technicianPerformance: technicianStats.map((t) => ({
        name: t.name,
        completedTickets: t.completed,
        averageResolutionTime: parseFloat(t.avgTime),
        pendingTickets: 0,
      })),
    },
    recentIntakes: recentIntakes.map((t: any) => ({
      id: t.ticketNumber,
      device: t.deviceModel,
      customer: t.customer.name,
      time: t.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: formatStatus(t.status),
    })),
    readyForPickup: readyForPickup.map((t: any) => {
      const calculatedTotal = t.lineItems.reduce((acc: number, item: any) => acc + Number(item.totalPrice), 0);
      const total = t.invoiceAmount ? Number(t.invoiceAmount) : calculatedTotal;
      return {
        device: t.deviceModel,
        customer: t.customer.name,
        phone: t.customer.phone,
        amount: total,
      };
    }),
  };
}
