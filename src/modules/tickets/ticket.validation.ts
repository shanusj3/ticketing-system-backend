import { z } from "zod";

export const createTicketSchema = z.object({
  customerId: z.string().min(1),
  technicianId: z.string().optional().nullable(),
  issue: z.string().trim().min(2),
  description: z.string().optional().nullable(),
  deviceType: z.enum(["MOBILE", "LAPTOP", "OTHER"]).default("MOBILE"),
  deviceBrand: z.string().trim().optional().nullable(),
  deviceModel: z.string().trim().min(1),
  deviceColor: z.string().trim().optional().nullable(),
  imei: z.string().trim().optional().nullable(),
  condition: z.string().trim().optional().nullable(),
  accessories: z.string().trim().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  estimatedCost: z.number().nonnegative().optional().nullable(),
});

export const updateTicketSchema = z.object({
  technicianId: z.string().optional().nullable(),
  status: z.enum(["RECEIVED", "DIAGNOSIS", "IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]).optional(),
  issue: z.string().trim().min(2).optional(),
  description: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  estimatedCost: z.number().nonnegative().optional().nullable(),
  invoiceAmount: z.number().nonnegative().optional().nullable(),
  paymentStatus: z.enum(["PENDING", "PAID", "PARTIAL"]).optional(),
});

export const addLineItemSchema = z.object({
  type: z.enum(["PART", "SERVICE_FEE", "DISCOUNT", "EXTRA_CHARGE"]),
  name: z.string().trim().min(2),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().min(0),
});
