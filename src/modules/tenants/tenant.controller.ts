import { Request, Response } from "express";
import {
  createTenant,
  listTenants,
  getPublicTenantDetails,
  getTenantById,
  switchTenantPlan,
} from "./tenant.service";
import { createTenantSchema, switchPlanSchema, updateStatusSchema } from "./tenant.validation";
import { prisma } from "../../config/database";

export async function listTenantsController(req: Request, res: Response) {
  const page   = req.query.page   ? Number(req.query.page)  : 1;
  const limit  = req.query.limit  ? Number(req.query.limit) : 20;
  const search = req.query.search ? String(req.query.search) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const plan   = req.query.plan   ? String(req.query.plan)   : undefined;
  const expiry = req.query.expiry ? String(req.query.expiry) as any : undefined;

  const result = await listTenants({ page, limit, search, status, plan, expiry });
  res.json(result);
}

export async function createTenantController(req: Request, res: Response) {
  const input = createTenantSchema.parse(req.body);
  const result = await createTenant(input);
  res.status(201).json(result);
}

export async function getTenantByIdController(req: Request, res: Response) {
  const id = String(req.params.id);
  const tenant = await getTenantById(id);
  res.json({ tenant });
}

export async function switchTenantPlanController(req: Request, res: Response) {
  const id = String(req.params.id);
  const input = switchPlanSchema.parse(req.body);
  const result = await switchTenantPlan(id, input.subscriptionPlan, input.durationMonths, input.customPriceInr ?? undefined);
  res.json({ subscription: result });
}

export async function getPublicTenantDetailsController(req: Request, res: Response) {
  const slugOrDomain = String(req.params.slugOrDomain);
  const tenant = await getPublicTenantDetails(slugOrDomain);
  res.json({ tenant });
}

export async function updateTenantStatusController(req: Request, res: Response) {
  const id = String(req.params.id);
  const input = updateStatusSchema.parse(req.body);
  const tenant = await prisma.tenant.update({
    where: { id },
    data: { status: input.status },
  });
  res.json({ tenant });
}
