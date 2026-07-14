import { Router } from "express";
import { prisma } from "../../config/database";

const router = Router();

// Public route to fetch tenant branding information for login
router.get("/public/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
      }
    });

    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    // Attach a mock domain for frontend usage if needed
    const domain = `${tenant.slug}.${process.env.ROOT_DOMAIN || 'localhost:3000'}`;

    res.json({
      tenant: {
        ...tenant,
        domain
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
