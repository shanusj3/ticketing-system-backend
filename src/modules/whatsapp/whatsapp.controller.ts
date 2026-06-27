import { Request, Response } from "express";
import {
  storeWhatsappCredentials,
  getWhatsappAdmin,
  getWhatsappTenant,
  disconnectWhatsapp,
  getAllWhatsappStatus,
} from "./whatsapp.service";

export async function setupWhatsappController(req: Request, res: Response) {
  const tenantId = req.params.tenantId;
  const { phoneNumberId, businessAccountId, accessToken, wabaPhoneNumber } = req.body;

  if (!phoneNumberId || !businessAccountId || !accessToken || !wabaPhoneNumber) {
    return res.status(400).json({ message: "Missing required WhatsApp credentials" });
  }

  const result = await storeWhatsappCredentials(tenantId, {
    phoneNumberId,
    businessAccountId,
    accessToken,
    wabaPhoneNumber,
  });

  res.status(201).json({ whatsapp: result });
}

export async function getWhatsappAdminController(req: Request, res: Response) {
  const tenantId = req.params.tenantId;
  const whatsapp = await getWhatsappAdmin(tenantId);
  res.json({ whatsapp });
}

export async function getMyWhatsappController(req: Request, res: Response) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ message: "Tenant context required" });
  }
  const whatsapp = await getWhatsappTenant(req.user.tenantId);
  res.json({ whatsapp });
}

export async function disconnectWhatsappController(req: Request, res: Response) {
  const tenantId = req.params.tenantId;
  await disconnectWhatsapp(tenantId);
  res.json({ message: "WhatsApp disconnected successfully" });
}

export async function getAllWhatsappStatusController(_req: Request, res: Response) {
  const data = await getAllWhatsappStatus();
  res.json({ data });
}
