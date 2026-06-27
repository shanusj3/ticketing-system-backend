import { z } from "zod";

export const createTenantSchema = z.object({
  name: z.string().trim().min(2),
  contactName: z.string().trim().min(2),
  email: z.string().email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(5),
  mobile: z.string().trim().optional().nullable(),
  slug: z.string().trim().min(2).regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Primary color must be a valid hex color code"),
  logoUrl: z.string().optional().nullable(),
  subscriptionPlan: z.enum(["STARTER", "BUSINESS", "ENTERPRISE"]).default("STARTER"),
  customPriceInr: z.number().int().positive().optional().nullable(),
});

export const switchPlanSchema = z.object({
  subscriptionPlan: z.enum(["STARTER", "BUSINESS", "ENTERPRISE"]),
  durationMonths: z.number().int().min(1).default(1),
  customPriceInr: z.number().int().positive().optional().nullable(),
});

export const updateStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});
