import { Request, Response } from "express";
import { createTenantUser, listTenantUsers, updateMyPassword, resetTenantUserPassword } from "./user.service";
import { createUserSchema, updateMyPasswordSchema, resetUserPasswordSchema } from "./user.validation";

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

export async function updateMyPasswordController(req: Request, res: Response) {
  if (!req.user?.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const { oldPassword, newPassword } = updateMyPasswordSchema.parse(req.body);
  await updateMyPassword(req.user.userId, oldPassword, newPassword);
  
  res.json({ message: "Password updated successfully" });
}

export async function resetTenantUserPasswordController(req: Request, res: Response) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ message: "Tenant context required" });
  }

  const targetUserId = req.params.id as string;
  const { newPassword } = resetUserPasswordSchema.parse(req.body);
  
  await resetTenantUserPassword(req.user.tenantId, targetUserId, newPassword);
  
  res.json({ message: "User password reset successfully" });
}
