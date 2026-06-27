import { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../../config/database";
import { createPresignedUpload } from "./upload.service";
import { presignUploadSchema } from "./upload.validation";

export async function createPresignedUploadController(req: Request, res: Response) {
  const input = presignUploadSchema.parse(req.body);
  const user = req.user!;

  if (user.role !== UserRole.SUPER_ADMIN) {
    if (!user.tenantId) {
      throw Object.assign(new Error("Tenant context required"), { status: 403 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { slug: true },
    });

    if (!tenant || tenant.slug !== input.tenantSlug) {
      throw Object.assign(new Error("Permission denied"), { status: 403 });
    }
  }

  const upload = createPresignedUpload(input);
  res.json({ upload });
}
