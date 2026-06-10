import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().trim().min(5),
  email: z.string().email().optional().nullable(),
});
