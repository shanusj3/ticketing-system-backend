import { Request, Response } from "express";
import { createTenantUser, listTenantUsers } from "./user.service";
import { createUserSchema } from "./user.validation";

export async function listUsersController(req: Request, res: Response) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ message: "Tenant context required" });
  }

  const users = await listTenantUsers(req.user.tenantId);
  res.json({ users });
}

export async function createUserController(req: Request, res: Response) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ message: "Tenant context required" });
  }

  const input = createUserSchema.parse(req.body);
  const user = await createTenantUser(req.user.tenantId, input);
  res.status(201).json({ user });
}
