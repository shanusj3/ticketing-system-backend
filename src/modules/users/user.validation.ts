import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  role: z.enum(["SHOP_OWNER", "SERVICE_ADVISOR", "TECHNICIAN"]),
});
