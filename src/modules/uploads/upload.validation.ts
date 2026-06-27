import { z } from "zod";

export const presignUploadSchema = z.object({
  tenantSlug: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Tenant slug must contain only lowercase letters, numbers, and hyphens"),
  folder: z.enum(["logos", "avatars", "attachments", "invoices"]),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(3).max(120),
});
