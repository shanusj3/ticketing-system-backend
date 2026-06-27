import { Request, Response } from "express";
import {
  getNotificationLogs,
  getNotificationUsage,
  getAllTenantsNotificationUsage,
  addNotificationTopUp,
  WHATSAPP_TOPUP_PACKAGES,
} from "./notification.service";

export async function getMyNotificationLogsController(req: Request, res: Response) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ message: "Tenant context required" });
  }
  const logs = await getNotificationLogs(req.user.tenantId);
  res.json({ logs });
}

export async function getMyNotificationUsageController(req: Request, res: Response) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ message: "Tenant context required" });
  }
  const usage = await getNotificationUsage(req.user.tenantId);
  res.json({ usage });
}

export async function getAllTenantsUsageController(_req: Request, res: Response) {
  const data = await getAllTenantsNotificationUsage();
  res.json({ data });
}

export async function addTopUpController(req: Request, res: Response) {
  const { tenantId, messages } = req.body;
  if (!tenantId || !messages) {
    return res.status(400).json({ message: "tenantId and messages are required" });
  }
  const result = await addNotificationTopUp(tenantId, Number(messages));
  res.json({ result });
}

export async function getTopUpPackagesController(_req: Request, res: Response) {
  res.json({ packages: WHATSAPP_TOPUP_PACKAGES });
}

export async function getTenantNotificationLogsController(req: Request, res: Response) {
  const { tenantId } = req.params;
  const logs = await getNotificationLogs(tenantId, 100);
  res.json({ logs });
}

export async function getTenantNotificationUsageController(req: Request, res: Response) {
  const { tenantId } = req.params;
  const usage = await getNotificationUsage(tenantId);
  res.json({ usage });
}
