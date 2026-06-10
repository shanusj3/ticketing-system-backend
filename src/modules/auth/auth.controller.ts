import { Request, Response } from "express";
import { login } from "./auth.service";
import { loginSchema } from "./auth.validation";

export async function loginController(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await login(input.email, input.password, input.tenantSlug);
  res.json(result);
}
