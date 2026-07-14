import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  tenantId?: string;
  branchId?: string;
  role?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

const tenantScopedModels = [
  "Branch",
  "User",
  "WhatsAppConfig",
  "BranchWhatsAppConfig",
  "Customer",
  "Device",
  "Ticket",
  "TicketDamageItem",
  "TicketPhoto",
  "TicketPart",
  "Invoice",
  "NotificationLog",
] as const;

const basePrisma = new PrismaClient();

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = requestContext.getStore();

        if (ctx?.role === "SUPER_ADMIN") {
          return query(args);
        }

        const modelsWithTenantId = [
          "Branch", "User", "WhatsAppConfig", "Customer", 
          "Device", "Ticket", "Invoice", "NotificationLog", "AuditLog"
        ];
        
        const modelsWithBranchId = [
          "Customer", "Device", "Ticket", "Invoice", 
          "NotificationLog", "AuditLog", "BranchWhatsAppConfig", "User"
        ];

        if (ctx?.tenantId) {
          const requireBranchId = ["SERVICE_ADVISOR", "TECHNICIAN"].includes(ctx.role || "");
          const anyArgs = args as any;
          
          if (
            operation.startsWith("find") ||
            operation === "updateMany" ||
            operation === "deleteMany" ||
            operation === "aggregate" ||
            operation === "count" ||
            operation === "update" ||
            operation === "delete"
          ) {
            if (modelsWithTenantId.includes(model as string)) {
              anyArgs.where = { ...anyArgs.where, tenantId: ctx.tenantId };
            }
            if (requireBranchId && ctx.branchId) {
              if (modelsWithBranchId.includes(model as string)) {
                anyArgs.where = { ...anyArgs.where, branchId: ctx.branchId };
              } else if (model === "Branch") {
                anyArgs.where = { ...anyArgs.where, id: ctx.branchId };
              }
            }
          }
          
          if (operation === "create") {
            if (modelsWithTenantId.includes(model as string)) {
              anyArgs.data = { ...anyArgs.data, tenantId: ctx.tenantId };
            }
            if (requireBranchId && ctx.branchId) {
              if (modelsWithBranchId.includes(model as string)) {
                anyArgs.data = { ...anyArgs.data, branchId: ctx.branchId };
              }
            }
          }
        }
        return query(args);
      },
    },
  },
});
