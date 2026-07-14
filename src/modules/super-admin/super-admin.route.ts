import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/middleware/auth";
import { prisma } from "../../config/database";

const router = Router();

router.use(requireAuth, requireRole("SUPER_ADMIN"));

router.get("/tenants", async (req, res, next) => {
  try {
    const tenants = await prisma.tenant.findMany({ 
      include: { 
        branches: true,
        users: {
          where: { role: 'SHOP_OWNER' },
          select: { name: true, email: true }
        }
      } 
    });
    res.json(tenants);
  } catch (err) { next(err); }
});

router.post("/tenants", async (req, res, next) => {
  try {
    const { 
      name, slug, logoUrl, contactEmail, contactPhone, ownerName, ownerEmail, ownerPassword,
      whatsappEnabled, whatsappMode,
      metaPhoneNumberId, metaAccessToken, metaWabaId
    } = req.body;
    
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bcrypt = require("bcryptjs");
    const passwordHash = await bcrypt.hash(ownerPassword, 10);

    const tenantData: any = {
      name,
      slug,
      logoUrl,
      contactEmail,
      contactPhone,
      users: {
        create: {
          name: ownerName,
          email: ownerEmail,
          passwordHash,
          role: "SHOP_OWNER"
        }
      }
    };

    if (whatsappEnabled && whatsappMode && whatsappMode !== 'DISABLED') {
      tenantData.whatsappConfig = {
        create: {
          mode: whatsappMode === 'QR_WEB' ? 'QR_WEB' : 'META_API',
          qrStatus: whatsappMode === 'QR_WEB' ? 'PENDING_SCAN' : 'DISCONNECTED',
          ...(whatsappMode === 'META_API' && metaPhoneNumberId
            ? { metaPhoneNumberId, metaAccessToken: metaAccessToken || null, metaWabaId: metaWabaId || null }
            : {})
        }
      };
    }

    const tenant = await prisma.tenant.create({
      data: tenantData,
      include: { branches: true, users: true, whatsappConfig: true }
    });

    res.json(tenant);
  } catch (err) { next(err); }
});

router.get("/tenants/:id/whatsapp-qr", async (req, res, next) => {
  try {
    const config = await prisma.whatsAppConfig.findUnique({
      where: { tenantId: req.params.id }
    });
    if (!config || config.mode !== 'QR_WEB') {
      return res.status(400).json({ message: "QR mode not configured for this tenant" });
    }
    // Demo: return static QR payload. In production, a headless WhatsApp session (Baileys/WPPConnect) generates this.
    res.json({
      status: config.qrStatus,
      qrValue: `DEMO-WA-${req.params.id}-${Date.now()}`,
      message: "Demo QR — real session required in production"
    });
  } catch (err) { next(err); }
});

router.get("/tenants/:id", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        branches: true,
        users: { select: { id: true, name: true, email: true, role: true, status: true } },
        whatsappConfig: true
      }
    });
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    res.json(tenant);
  } catch (err) { next(err); }
});

router.post("/tenants/:tenantId/branches", async (req, res, next) => {
  try {
    const { name, ...rest } = req.body;
    
    // Auto-generate branch code (e.g., NYC-4921)
    const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'BR');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const code = `${prefix}-${randomNum}`;

    const branch = await prisma.branch.create({
      data: {
        tenantId: req.params.tenantId,
        createdBySuperAdminId: req.user!.sub,
        name,
        code,
        ...rest
      }
    });
    res.json(branch);
  } catch (err) { next(err); }
});

router.patch("/branches/:id/suspend", async (req, res, next) => {
  try {
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: { status: "SUSPENDED" }
    });
    res.json(branch);
  } catch (err) { next(err); }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const [
      totalTenants,
      totalBranches,
      activeTickets,
      completedTickets,
      revenueResult,
      dbSizeResult
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.branch.count(),
      prisma.ticket.count({
        where: {
          status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] }
        }
      }),
      prisma.ticket.count({
        where: { status: "COMPLETED" }
      }),
      prisma.invoice.aggregate({
        _sum: { total: true },
        where: { status: "PAID" }
      }),
      prisma.tenant.aggregate({
        _sum: { dbSizeBytes: true }
      })
    ]);

    const totalRevenue = revenueResult._sum.total ? Number(revenueResult._sum.total) : 0;
    const totalDbSize = dbSizeResult._sum.dbSizeBytes ? Number(dbSizeResult._sum.dbSizeBytes) : 0;

    res.json({
      totalTenants,
      totalBranches,
      activeTickets,
      completedTickets,
      totalRevenue,
      totalDbSize
    });
  } catch (err) { next(err); }
});

router.get("/audit-search", async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    res.json(logs);
  } catch (err) { next(err); }
});

export default router;
