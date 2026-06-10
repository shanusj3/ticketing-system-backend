import { Request, Response } from "express";
import { getTenantId } from "../../shared/tenant";
import {
  createTicket,
  getTicket,
  listTickets,
  lookupPublicTicket,
  updateTicket,
  addLineItem,
  removeLineItem,
  collectPayment,
} from "./ticket.service";
import { createTicketSchema, updateTicketSchema, addLineItemSchema } from "./ticket.validation";

export async function listTicketsController(req: Request, res: Response) {
  const tickets = await listTickets(getTenantId(req), req.user!);
  res.json({ tickets });
}

export async function getTicketController(req: Request, res: Response) {
  const ticket = await getTicket(getTenantId(req), String(req.params.id), req.user!);
  res.json({ ticket });
}

export async function createTicketController(req: Request, res: Response) {
  const input = createTicketSchema.parse(req.body);
  const ticket = await createTicket(getTenantId(req), input);
  res.status(201).json({ ticket });
}

export async function updateTicketController(req: Request, res: Response) {
  const input = updateTicketSchema.parse(req.body);
  const ticket = await updateTicket(getTenantId(req), String(req.params.id), input);
  res.json({ ticket });
}

export async function publicLookupController(req: Request, res: Response) {
  const { tenantSlug, ticketNumber, phone } = req.query;
  if (!tenantSlug || !ticketNumber || !phone) {
    return res.status(400).json({ message: "tenantSlug, ticketNumber, and phone are required" });
  }
  const ticket = await lookupPublicTicket(
    String(tenantSlug),
    String(ticketNumber),
    String(phone)
  );
  res.json({ ticket });
}

export async function addLineItemController(req: Request, res: Response) {
  const input = addLineItemSchema.parse(req.body);
  const ticketId = String(req.params.id);
  const userId = req.user!.userId; // Authenticated
  const ticket = await addLineItem(getTenantId(req), ticketId, userId, input);
  res.json({ ticket });
}

export async function removeLineItemController(req: Request, res: Response) {
  const ticketId = String(req.params.id);
  const itemId = String(req.params.itemId);
  const ticket = await removeLineItem(getTenantId(req), ticketId, itemId);
  res.json({ ticket });
}

export async function collectPaymentController(req: Request, res: Response) {
  const ticketId = String(req.params.id);
  const ticket = await collectPayment(getTenantId(req), ticketId);
  res.json({ ticket });
}
