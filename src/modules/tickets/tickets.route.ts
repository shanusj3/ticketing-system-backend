import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/middleware/auth";
import { prisma } from "../../config/database";

const router = Router();

router.use(requireAuth, requireRole("SERVICE_ADVISOR", "TECHNICIAN"));

router.get("/", async (req, res, next) => {
  try {
    const filters: any = {};
    // For Technician role, additionally filter by assignedTechnicianId to sandbox them
    if (req.user!.role === "TECHNICIAN") {
      filters.assignedTechnicianId = req.user!.sub;
    }
    
    // RLS in Prisma middleware will automatically scope this query to the user's tenantId & branchId
    const tickets = await prisma.ticket.findMany({
      where: filters,
      include: { customer: true, device: true, photos: true, parts: true }
    });
    
    res.json(tickets);
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    // Only SERVICE_ADVISOR should create tickets technically, but let's allow both or filter if needed
    if (req.user!.role !== "SERVICE_ADVISOR") {
      return res.status(403).json({ message: "Only Service Advisors can create tickets" });
    }
    
    const ticket = await prisma.ticket.create({
      data: {
        ...req.body,
        createdByAdvisorId: req.user!.sub
      }
    });
    res.json(ticket);
  } catch (err) { next(err); }
});

router.post("/:id/complete", async (req, res, next) => {
  try {
    if (req.user!.role !== "TECHNICIAN") {
      return res.status(403).json({ message: "Only Technicians can complete tickets" });
    }
    
    const { diagnosticSummary } = req.body;
    
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: { photos: true }
    });
    
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    
    // Anti-cheat checkpoint
    if (!diagnosticSummary) {
      return res.status(400).json({ message: "Diagnostic summary is required to complete a ticket" });
    }
    
    const hasCompletionPhoto = ticket.photos.some(p => p.type === "COMPLETION");
    if (!hasCompletionPhoto) {
      return res.status(400).json({ message: "At least one completion photo is required" });
    }
    
    const updated = await prisma.ticket.update({
      where: { id: req.params.id },
      data: {
        status: "COMPLETED",
        diagnosticSummary,
        completedAt: new Date()
      }
    });
    
    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
