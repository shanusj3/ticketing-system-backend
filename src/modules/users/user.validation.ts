import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  role: z.enum(["SHOP_OWNER", "SERVICE_ADVISOR", "TECHNICIAN"]),
});

export const updateMyPasswordSchema = z.object({
  oldPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters long"),
});

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(8, "New password must be at least 8 characters long"),
});
