import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/middleware/auth";
import { prisma } from "../../config/database";

const router = Router();

router.use(requireAuth, requireRole("SHOP_OWNER", "SERVICE_ADVISOR"));

// GET /invoices/:ticketId — fetch invoice for a ticket
router.get("/:ticketId", async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { ticketId: req.params.ticketId }
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.json(invoice);
  } catch (err) { next(err); }
});

// POST /invoices/:ticketId/generate — auto-generate invoice from parts + branch fees
// Only allowed when ticket status is COMPLETED
router.post("/:ticketId/generate", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const { ticketId } = req.params;
    const { discount = 0, couponCode } = req.body;

    // Check ticket exists and belongs to tenant
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      include: {
        parts: true,
        branch: {
          select: { baseServiceFee: true, taxCentralPct: true, taxStatePct: true }
        },
        invoice: true
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status !== 'COMPLETED') {
      return res.status(400).json({ message: "Invoice can only be generated for COMPLETED tickets" });
    }

    if (ticket.invoice) {
      return res.status(409).json({ message: "Invoice already exists for this ticket", invoice: ticket.invoice });
    }

    // Calculate amounts
    const partsTotal = ticket.parts.reduce((sum, p) => sum + Number(p.cost), 0);
    const baseServiceFee = Number(ticket.branch.baseServiceFee);
    const subtotal = partsTotal + baseServiceFee;
    const discountAmount = Number(discount);
    const taxableAmount = subtotal - discountAmount;
    const centralGst = (taxableAmount * Number(ticket.branch.taxCentralPct)) / 100;
    const stateGst = (taxableAmount * Number(ticket.branch.taxStatePct)) / 100;
    const total = taxableAmount + centralGst + stateGst;

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        branchId: ticket.branchId,
        ticketId: ticket.id,
        subtotal: subtotal,
        discount: discountAmount,
        couponCode: couponCode || null,
        centralGst: parseFloat(centralGst.toFixed(2)),
        stateGst: parseFloat(stateGst.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        status: 'UNPAID'
      }
    });

    res.json(invoice);
  } catch (err) { next(err); }
});

// PATCH /invoices/:ticketId/pay — mark invoice as paid
router.patch("/:ticketId/pay", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const { ticketId } = req.params;

    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      include: { invoice: true }
    });

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (!ticket.invoice) return res.status(404).json({ message: "No invoice found for this ticket" });
    if (ticket.invoice.status === 'PAID') return res.status(400).json({ message: "Invoice already paid" });

    const updated = await prisma.invoice.update({
      where: { ticketId },
      data: { status: 'PAID', paidAt: new Date() }
    });

    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
