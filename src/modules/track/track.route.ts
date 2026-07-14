import { Router } from "express";
import { prisma } from "../../config/database";

const router = Router();

// Public, no auth required
router.get("/:trackingToken", async (req, res, next) => {
  try {
    // Explicitly bypass RLS middleware since this is a public unauthenticated route
    // Wait, since we are not authenticated, `requestContext` won't have tenantId.
    // However, the `trackingToken` is globally unique (a cuid).
    // The Prisma middleware only filters if `tenantId` is in context. 
    // Since it's not, we can query it safely.
    
    const ticket = await prisma.ticket.findUnique({
      where: { trackingToken: req.params.trackingToken },
      select: {
        status: true,
        damageChecklist: true,
        photos: {
          select: { url: true, type: true }
        }
        // Notice we do NOT return customer phone, internal ID, or financials
      }
    });

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    res.json(ticket);
  } catch (err) { next(err); }
});

export default router;
