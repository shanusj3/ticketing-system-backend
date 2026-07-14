import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/middleware/auth";
import { prisma } from "../../config/database";

const router = Router();

router.use(requireAuth, requireRole("SHOP_OWNER", "SERVICE_ADVISOR"));

// GET /api/customers
router.get("/", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const customers = await prisma.customer.findMany({
      where: { tenantId },
      include: {
        tickets: {
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: { tickets: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedCustomers = customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: null, // Prisma schema doesn't have email currently
      repairs: c._count.tickets,
      lastVisit: c.tickets.length > 0 ? c.tickets[0].createdAt.toISOString() : c.createdAt.toISOString()
    }));

    res.json({ customers: formattedCustomers });
  } catch (err) { next(err); }
});

// POST /api/customers
router.post("/", async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    const tenantId = req.user!.tenantId!;
    
    // In this generic route, if we don't have a branchId in the request, 
    // we'll assign it to the user's branchId, or if they are SHOP_OWNER without one,
    // we take the first branch of the tenant.
    let branchId = req.user!.branchId;
    if (!branchId) {
      const branch = await prisma.branch.findFirst({ where: { tenantId } });
      if (!branch) {
        return res.status(400).json({ message: "No branch found for tenant" });
      }
      branchId = branch.id;
    }

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        branchId,
        name,
        phone,
      }
    });

    res.json(customer);
  } catch (err) { next(err); }
});

// GET /api/customers/:id
router.get("/:id", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        tickets: {
          include: {
            device: true,
            invoice: true,
          },
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { tickets: true }
        }
      }
    });

    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const formatted = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: null,
      repairs: customer._count.tickets,
      lastVisit: customer.tickets.length > 0 ? customer.tickets[0].createdAt.toISOString() : customer.createdAt.toISOString(),
      createdAt: customer.createdAt.toISOString(),
      tickets: customer.tickets.map(t => ({
        id: t.id,
        ticketNumber: t.trackingToken || t.id.slice(0, 8),
        deviceModel: t.device?.model || "Unknown",
        issue: "Check diagnostic summary", // Placeholder as 'issue' isn't on ticket schema
        status: t.status,
        paymentStatus: t.invoice?.status || "UNPAID",
        createdAt: t.createdAt.toISOString(),
        total: t.invoice?.total ? Number(t.invoice.total) : 0
      }))
    };

    res.json({ customer: formatted });
  } catch (err) { next(err); }
});

export default router;
