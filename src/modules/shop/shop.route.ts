import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/middleware/auth";
import { prisma } from "../../config/database";
import bcrypt from "bcryptjs";
import { sendWhatsAppMessage } from "../../shared/whatsapp.manager";

const router = Router();

router.use(requireAuth);

const ownerOnly = requireRole("SHOP_OWNER");
const staffAccess = requireRole("SHOP_OWNER", "SERVICE_ADVISOR", "TECHNICIAN");

// --- Branches ---
router.get("/branches", ownerOnly, async (req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { tenantId: req.user!.tenantId! },
      orderBy: { createdAt: 'asc' }
    });
    res.json(branches);
  } catch (err) { next(err); }
});

router.put("/branches/:id/business", ownerOnly, async (req, res, next) => {
  try {
    const { name, address, contactPhone, baseServiceFee, taxCentralPct, taxStatePct } = req.body;
    
    // Ensure the branch belongs to the user's tenant
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId! }
    });

    if (!branch) return res.status(404).json({ message: "Branch not found" });

    const updated = await prisma.branch.update({
      where: { id: req.params.id as string },
      data: {
        name,
        address,
        contactPhone,
        baseServiceFee,
        taxCentralPct,
        taxStatePct
      }
    });

    res.json(updated);
  } catch (err) { next(err); }
});


// --- Dashboard Stats ---
router.get("/dashboard-stats", ownerOnly, async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const tenantId = req.user!.tenantId!;

    const whereClause: any = { tenantId };
    if (branchId && branchId !== 'ALL') {
      whereClause.branchId = String(branchId);
    }

    // Active tickets
    const activeTicketsCount = await prisma.ticket.count({
      where: {
        ...whereClause,
        status: { in: ['RECEIVED', 'IN_PROGRESS'] }
      }
    });

    // Waiting for parts tickets
    const waitingForPartsCount = await prisma.ticket.count({
      where: {
        ...whereClause,
        status: 'WAITING_FOR_PARTS'
      }
    });

    // Revenue snapshot (paid invoices)
    const paidInvoices = await prisma.invoice.aggregate({
      where: {
        ...whereClause,
        status: 'PAID'
      },
      _sum: {
        total: true
      }
    });

    res.json({
      activeTickets: activeTicketsCount,
      waitingForParts: waitingForPartsCount,
      totalRevenue: paidInvoices._sum.total || 0
    });
  } catch (err) { next(err); }
});

// --- Team Management ---
router.get("/team", ownerOnly, async (req, res, next) => {
  try {
    const team = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId! },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        branchId: true,
        branch: { select: { name: true } },
        createdAt: true
      }
    });
    res.json(team);
  } catch (err) { next(err); }
});

router.post("/team", ownerOnly, async (req, res, next) => {
  try {
    const { name, email, phone, role, password, branchId } = req.body;
    
    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ message: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        role,
        passwordHash,
        tenantId: req.user!.tenantId!,
        branchId: branchId || null
      },
      select: { id: true, name: true, email: true, role: true }
    });

    res.json(user);
  } catch (err) { next(err); }
});

router.put("/team/:id", ownerOnly, async (req, res, next) => {
  try {
    const { name, phone, role, status, branchId } = req.body;
    
    const user = await prisma.user.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId! }
    });

    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === 'SHOP_OWNER') return res.status(403).json({ message: "Cannot edit shop owner" });

    const updated = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { name, phone, role, status, branchId: branchId || null },
      select: { id: true, name: true, role: true, status: true, branchId: true }
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// --- Tickets ---
router.get("/tickets", staffAccess, async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const tenantId = req.user!.tenantId!;

    const whereClause: any = { tenantId };
    if (branchId && branchId !== 'ALL') {
      whereClause.branchId = String(branchId);
    }
    
    // For Technician role, additionally filter by assignedTechnicianId
    if (req.user!.role === "TECHNICIAN") {
      whereClause.assignedTechnicianId = req.user!.sub;
    }

    const tickets = await prisma.ticket.findMany({
      where: whereClause,
      include: {
        customer: true,
        device: true,
        branch: { select: { name: true } },
        assignedTechnician: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tickets);
  } catch (err) { next(err); }
});

// POST /shop/tickets — create a new ticket (SHOP_OWNER acts as advisor)
router.post("/tickets", requireRole("SHOP_OWNER", "SERVICE_ADVISOR"), async (req, res, next) => {
  try {
    const {
      branchId,
      customerId,
      deviceId,
      device,
      notifyOnIntake,
      assignedTechnicianId,
      newCustomer,
      problem,
      description,
    } = req.body;

    const tenantId = req.user!.tenantId!;
    const advisorId = req.user!.sub;

    // Validate branch belongs to tenant
    const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) return res.status(400).json({ message: "Invalid branch" });

    let resolvedCustomerId = customerId;
    let resolvedDeviceId = deviceId;

    // Create new customer if provided
    if (newCustomer) {
      const customer = await prisma.customer.create({
        data: {
          tenantId,
          branchId,
          name: newCustomer.name,
          phone: newCustomer.phone,
          whatsappNumber: newCustomer.whatsappNumber || null,
        }
      });
      resolvedCustomerId = customer.id;
    }

    // Always create the device
    if (device && resolvedCustomerId) {
      const createdDevice = await prisma.device.create({
        data: {
          tenantId,
          branchId,
          customerId: resolvedCustomerId,
          deviceType: device.deviceType || 'Mobile',
          brand: device.brand,
          model: device.model,
          serialNumber: device.serialNumber || null,
          imei: device.imei || null,
        }
      });
      resolvedDeviceId = createdDevice.id;
    }

    if (!resolvedCustomerId || !resolvedDeviceId || !problem) {
      return res.status(400).json({ message: "Customer, device, and problem are required" });
    }

    const ticket = await prisma.ticket.create({
      data: {
        tenantId,
        branchId,
        customerId: resolvedCustomerId,
        deviceId: resolvedDeviceId,
        createdByAdvisorId: advisorId,
        assignedTechnicianId: assignedTechnicianId || null,
        notifyOnIntake: notifyOnIntake ?? true,
        problem,
        description: description || null,
      },
      include: {
        customer: true,
        device: true,
        branch: { select: { name: true } },
        assignedTechnician: { select: { name: true } },
      }
    });

    // ─── WhatsApp Tracking Notification ───────────────────────────────────
    // Fire-and-forget: do not await so the ticket response is never delayed.
    if (ticket.notifyOnIntake) {
      sendWhatsAppIntakeNotification(ticket, tenantId, branchId).catch((err) =>
        console.error("[WhatsApp] Intake notification error:", err)
      );
    }
    // ──────────────────────────────────────────────────────────────────────

    res.json(ticket);
  } catch (err) { next(err); }
});

// ─── Helper: send WhatsApp tracking link after ticket intake ──────────────
async function sendWhatsAppIntakeNotification(
  ticket: any,
  tenantId: string,
  branchId: string
) {
  // Fetch the tenant's WhatsApp config
  const whatsappConfig = await prisma.whatsAppConfig.findUnique({
    where: { tenantId }
  });

  if (!whatsappConfig || whatsappConfig.mode === 'DISABLED') return;

  // Determine the customer's WhatsApp number
  const recipientPhone = ticket.customer?.whatsappNumber || ticket.customer?.phone;
  if (!recipientPhone) return;

  // Build the tracking link
  const rootDomain = process.env.ROOT_DOMAIN || 'localhost:3000';
  const trackingUrl = `https://${rootDomain}/track/${ticket.trackingToken}`;
  const messageBody = `Hi ${ticket.customer.name}! 👋\n\nYour device *${ticket.device?.brand || ''} ${ticket.device?.model || ''}* has been received at our repair centre.\n\nTrack your repair status in real-time here:\n🔗 ${trackingUrl}\n\nTicket #: ${ticket.id.slice(-8).toUpperCase()}\nStatus: Received\n\nWe'll keep you updated. Thank you! 🛠️`;

  const notificationPayload = {
    recipient: recipientPhone,
    message: messageBody,
    trackingUrl,
  };

  let notifStatus: 'SENT' | 'FAILED' | 'PENDING' = 'PENDING';
  let errorMessage: string | undefined;

  if (whatsappConfig.mode === 'META_API') {
    // ── Meta Cloud API ──────────────────────────────────────────────────
    if (!whatsappConfig.metaPhoneNumberId || !whatsappConfig.metaAccessToken) {
      notifStatus = 'FAILED';
      errorMessage = 'Meta API credentials not configured';
    } else {
      try {
        const metaApiUrl = `https://graph.facebook.com/v19.0/${whatsappConfig.metaPhoneNumberId}/messages`;
        const metaResponse = await fetch(metaApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${whatsappConfig.metaAccessToken}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: recipientPhone.replace(/\D/g, ''), // digits only
            type: 'text',
            text: { body: messageBody },
          }),
        });

        if (metaResponse.ok) {
          notifStatus = 'SENT';
        } else {
          const errData = await metaResponse.json().catch(() => ({}));
          notifStatus = 'FAILED';
          errorMessage = JSON.stringify(errData);
        }
      } catch (e: any) {
        notifStatus = 'FAILED';
        errorMessage = e?.message || 'Meta API request failed';
      }
    }
  } else if (whatsappConfig.mode === 'QR_WEB') {
    // ── QR_WEB mode — send via the linked whatsapp-web.js session ──────
    const result = await sendWhatsAppMessage(tenantId, recipientPhone, messageBody);
    if (result.success) {
      notifStatus = 'SENT';
    } else {
      notifStatus = 'FAILED';
      errorMessage = result.error || 'QR_WEB send failed';
    }
  }

  // Always persist a NotificationLog entry for audit/support visibility
  await prisma.notificationLog.create({
    data: {
      tenantId,
      branchId,
      ticketId: ticket.id,
      trigger: 'INTAKE',
      status: notifStatus,
      payload: notificationPayload,
      error: errorMessage || null,
      sentAt: notifStatus === 'SENT' ? new Date() : null,
    }
  });
}
// ─────────────────────────────────────────────────────────────────────────

// GET /shop/tickets/:id — fetch full ticket details
router.get("/tickets/:id", staffAccess, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const ticketId = req.params.id;
    
    const whereClause: any = { id: ticketId, tenantId };
    
    // For Technician role, additionally filter by assignedTechnicianId
    if (req.user!.role === "TECHNICIAN") {
      whereClause.assignedTechnicianId = req.user!.sub;
    }

    const ticket = await prisma.ticket.findUnique({
      where: whereClause,
      include: {
        customer: true,
        device: true,
        branch: true,
        assignedTechnician: { select: { id: true, name: true, phone: true } },
        createdByAdvisor: { select: { id: true, name: true } },
        damageChecklist: true,
        photos: true,
        parts: true,
        invoice: true,
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found or access denied" });
    }

    res.json(ticket);
  } catch (err) { next(err); }
});

// PATCH /shop/tickets/:id/status — update ticket status
router.patch("/tickets/:id/status", staffAccess, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const ticketId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['RECEIVED', 'DIAGNOSING', 'IN_PROGRESS', 'WAITING_FOR_PARTS', 'COMPLETED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (req.user!.role === "TECHNICIAN" && status === 'DELIVERED') {
      return res.status(403).json({ message: "Technicians cannot mark tickets as delivered" });
    }

    const whereClause: any = { id: ticketId, tenantId };
    if (req.user!.role === "TECHNICIAN") {
      whereClause.assignedTechnicianId = req.user!.sub;
    }

    const ticket = await prisma.ticket.update({
      where: whereClause,
      data: { status }
    });

    res.json(ticket);
  } catch (err) { next(err); }
});

// GET /shop/customers — list customers for ticket form dropdowns
router.get("/customers", staffAccess, async (req, res, next) => {
  try {
    const { branchId, q } = req.query;
    const tenantId = req.user!.tenantId!;
    const where: any = { tenantId };
    
    // We do NOT filter by branchId here, because customers are unique per tenant
    // and can visit any branch.
    
    if (q) where.OR = [
      { name: { contains: String(q), mode: 'insensitive' } },
      { phone: { contains: String(q) } },
    ];
    const customers = await prisma.customer.findMany({
      where,
      select: { id: true, name: true, phone: true },
      orderBy: { name: 'asc' },
      take: 30,
    });
    res.json(customers);
  } catch (err) { next(err); }
});

// GET /shop/customers/:id/devices — list devices for a customer
router.get("/customers/:id/devices", staffAccess, async (req, res, next) => {
  try {
    const devices = await prisma.device.findMany({
      where: { customerId: req.params.id, tenantId: req.user!.tenantId! },
      select: { id: true, brand: true, model: true, serialNumber: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(devices);
  } catch (err) { next(err); }
});

// GET /shop/technicians — list technicians for assignment dropdown
router.get("/technicians", staffAccess, async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const where: any = { tenantId: req.user!.tenantId!, role: 'TECHNICIAN', status: 'ACTIVE' };
    if (branchId && branchId !== 'ALL') where.branchId = String(branchId);
    const technicians = await prisma.user.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(technicians);
  } catch (err) { next(err); }
});

// PATCH /shop/tickets/:id/diagnostic — save diagnostic summary
router.patch("/tickets/:id/diagnostic", staffAccess, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const { diagnosticSummary } = req.body;

    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, tenantId }
    });
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const updated = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { diagnosticSummary: diagnosticSummary || null }
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// POST /shop/tickets/:id/parts — add a part to a ticket
router.post("/tickets/:id/parts", staffAccess, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const { description, cost } = req.body;

    if (!description || cost === undefined) {
      return res.status(400).json({ message: "Description and cost are required" });
    }

    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, tenantId }
    });
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const part = await prisma.ticketPart.create({
      data: {
        ticketId: req.params.id,
        description,
        cost: cost,
        addedByTechnicianId: req.user!.sub
      }
    });

    res.json(part);
  } catch (err) { next(err); }
});

// DELETE /shop/tickets/:id/parts/:partId — remove a part from a ticket
router.delete("/tickets/:id/parts/:partId", staffAccess, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;

    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, tenantId }
    });
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    await prisma.ticketPart.delete({
      where: { id: req.params.partId }
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /shop/tickets/:id/photos — save a photo record after S3 upload
router.post("/tickets/:id/photos", staffAccess, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const { url, type } = req.body;

    if (!url || !type) {
      return res.status(400).json({ message: "URL and type are required" });
    }

    const validTypes = ['INTAKE', 'COMPLETION'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: "Type must be INTAKE or COMPLETION" });
    }

    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, tenantId }
    });
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const photo = await prisma.ticketPhoto.create({
      data: {
        ticketId: req.params.id,
        url,
        type: type as 'INTAKE' | 'COMPLETION'
      }
    });

    res.json(photo);
  } catch (err) { next(err); }
});

// DELETE /shop/tickets/:id/photos/:photoId — remove a photo from a ticket
router.delete("/tickets/:id/photos/:photoId", requireRole("SHOP_OWNER", "SERVICE_ADVISOR"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;

    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, tenantId }
    });
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    await prisma.ticketPhoto.delete({
      where: { id: req.params.photoId }
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});


// --- Settings & Analytics (Stubs) ---
router.get("/settings", ownerOnly, async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId! },
      include: { branches: true }
    });
    res.json(tenant);
  } catch (err) { next(err); }
});

router.get("/analytics", ownerOnly, async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const tenantId = req.user!.tenantId!;

    const whereClause: any = { tenantId };
    if (branchId && branchId !== 'ALL') {
      whereClause.branchId = String(branchId);
    }

    // Ticket breakdown by status
    const ticketsByStatus = await prisma.ticket.groupBy({
      by: ['status'],
      where: whereClause,
      _count: { _all: true },
    });

    // Revenue by branch (top 5)
    const revenueByBranch = await prisma.invoice.groupBy({
      by: ['branchId'],
      where: { ...whereClause, status: 'PAID' },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    });

    // Fetch branch names for the above
    const branchIds = revenueByBranch.map(r => r.branchId);
    const branchNames = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });
    const branchNameMap = Object.fromEntries(branchNames.map(b => [b.id, b.name]));

    // Total revenue and tickets
    const totalRevenue = await prisma.invoice.aggregate({
      where: { ...whereClause, status: 'PAID' },
      _sum: { total: true },
    });
    const totalTickets = await prisma.ticket.count({ where: whereClause });

    res.json({
      totalRevenue: totalRevenue._sum.total || 0,
      totalTickets,
      ticketsByStatus: ticketsByStatus.map(t => ({ status: t.status, count: t._count._all })),
      revenueByBranch: revenueByBranch.map(r => ({
        branchId: r.branchId,
        branchName: branchNameMap[r.branchId] || r.branchId,
        revenue: r._sum.total || 0,
      })),
    });
  } catch (err) { next(err); }
});

export default router;

