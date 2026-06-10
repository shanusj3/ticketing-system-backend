import { Request } from "express";

export function getTenantId(req: Request): string {
  if (!req.user?.tenantId) {
    throw Object.assign(new Error("Tenant context required"), { status: 403 });
  }
  return req.user.tenantId;
}
