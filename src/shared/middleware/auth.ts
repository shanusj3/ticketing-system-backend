import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../../config/env";
import { requestContext } from "../../config/database";

export interface JwtPayload {
  sub: string;
  role: Role;
  tenantId: string | null;
  branchId: string | null;
  type?: "access" | "refresh";
}

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
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  const token = req.cookies?.accessToken ?? bearerToken ?? queryToken;

  if (!token) {
    return next(Object.assign(new Error("Authentication required"), { status: 401 }));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    if (payload.type && payload.type !== "access") {
      return next(Object.assign(new Error("Invalid authentication token"), { status: 401 }));
    }

    req.user = payload;
    
    // Inject into AsyncLocalStorage for Prisma RLS middleware
    requestContext.run({
      tenantId: payload.tenantId || undefined,
      branchId: payload.branchId || undefined,
      role: payload.role
    }, () => {
      next();
    });
  } catch {
    return next(Object.assign(new Error("Invalid authentication token"), { status: 401 }));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(Object.assign(new Error("Permission denied"), { status: 403 }));
    }
    return next();
  };
}
