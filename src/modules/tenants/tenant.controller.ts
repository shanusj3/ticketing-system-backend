import { Request, Response } from "express";
import { createTenant, listTenants, getPublicTenantDetails } from "./tenant.service";
import { createTenantSchema } from "./tenant.validation";

export async function listTenantsController(_req: Request, res: Response) {
  const tenants = await listTenants();
  res.json({ tenants });
}

export async function createTenantController(req: Request, res: Response) {
  const input = createTenantSchema.parse(req.body);
  const result = await createTenant(input);
  res.status(201).json(result);
}

export async function getPublicTenantDetailsController(req: Request, res: Response) {
  const slugOrDomain = String(req.params.slugOrDomain);
  const tenant = await getPublicTenantDetails(slugOrDomain);
  res.json({ tenant });
}
