import { Request, Response } from "express";
import { getTenantId } from "../../shared/tenant";
import { createCustomer, listCustomers, getCustomer } from "./customer.service";
import { createCustomerSchema } from "./customer.validation";

export async function listCustomersController(req: Request, res: Response) {
  const customers = await listCustomers(getTenantId(req));
  res.json({ customers });
}

export async function createCustomerController(req: Request, res: Response) {
  const input = createCustomerSchema.parse(req.body);
  const customer = await createCustomer(getTenantId(req), input);
  res.status(201).json({ customer });
}

export async function getCustomerController(req: Request, res: Response) {
  const customer = await getCustomer(getTenantId(req), String(req.params.id));
  res.json({ customer });
}
