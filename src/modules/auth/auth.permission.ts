import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { env } from "../../config/env";
import { JwtPayload } from "./auth.types";
import { prisma } from "../../config/database";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = req.cookies?.accessToken ?? bearerToken;

  if (!token) {
    return next(Object.assign(new Error("Authentication required"), { status: 401 }));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    if (payload.type && payload.type !== "access") {
      return next(Object.assign(new Error("Invalid authentication token"), { status: 401 }));
    }

    req.user = payload;
    return next();
  } catch {
    return next(Object.assign(new Error("Invalid authentication token"), { status: 401 }));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(Object.assign(new Error("Permission denied"), { status: 403 }));
    }

    return next();
  };
}

export async function requireActiveTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role === UserRole.SUPER_ADMIN || !req.user.tenantId) {
    return next();
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
      select: { status: true, subscriptionEndDate: true }
    });

    if (!tenant) {
      return next(Object.assign(new Error("Tenant not found"), { status: 404 }));
    }

    if (tenant.status === "SUSPENDED" || new Date() > tenant.subscriptionEndDate) {
      return res.status(403).json({
        error: "ACCOUNT_DISABLED",
        message: "Your account is disable. Contact the support 1. support@zeviodesk.com , 2, +91 9744675621."
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
