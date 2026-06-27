import { CookieOptions, Request, Response } from "express";
import { getCurrentUser, login, refreshSession } from "./auth.service";
import { loginSchema } from "./auth.validation";

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

const accessCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: 15 * 60 * 1000,
};

const refreshCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
  res.cookie("accessToken", tokens.accessToken, accessCookieOptions);
  res.cookie("refreshToken", tokens.refreshToken, refreshCookieOptions);
}

function clearAuthCookies(res: Response) {
  res.clearCookie("accessToken", baseCookieOptions);
  res.clearCookie("refreshToken", baseCookieOptions);
}

export async function loginController(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await login(input.email, input.password, input.tenantSlug);
  setAuthCookies(res, result);
  res.json({ user: result.user });
}

export async function refreshController(req: Request, res: Response) {
  const token = req.cookies?.refreshToken;

  if (!token) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }

  const result = await refreshSession(token);
  setAuthCookies(res, result);
  res.json({ user: result.user });
}

export async function meController(req: Request, res: Response) {
  const user = await getCurrentUser(req.user!);
  res.json({ user });
}

export async function logoutController(_req: Request, res: Response) {
  clearAuthCookies(res);
  res.status(204).send();
}
