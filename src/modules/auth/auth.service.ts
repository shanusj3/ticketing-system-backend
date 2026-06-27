import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/database";
import { authRepository } from "./auth.repository";
import { JwtPayload } from "./auth.types";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  tenantId: true,
  tenant: {
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionPlan: true,
      status: true,
      logoUrl: true,
    },
  },
} as const;

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = "7d";

function createTokenPair(payload: Omit<JwtPayload, "type">) {
  const accessToken = jwt.sign({ ...payload, type: "access" }, env.jwtSecret, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
  const refreshToken = jwt.sign({ ...payload, type: "refresh" }, env.jwtSecret, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });

  return { accessToken, refreshToken };
}

async function getSafeUser(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: publicUserSelect,
  });
}

export async function ensureSuperAdmin() {
  const existing = await prisma.user.findUnique({
    where: { email: env.superAdmin.email },
  });

  if (existing) {
    return existing;
  }

  const passwordHash = await bcrypt.hash(env.superAdmin.password, 12);

  return prisma.user.create({
    data: {
      name: env.superAdmin.name,
      email: env.superAdmin.email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
    },
  });
}

export async function login(email: string, password: string, tenantSlug?: string | null) {
  const user = await authRepository.findUserByEmail(email);

  if (!user || !user.isActive) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }

  // Enforce tenant workspace isolation
  if (tenantSlug) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) {
      throw Object.assign(new Error("Tenant workspace not found"), { status: 404 });
    }
    if (tenant.status !== "ACTIVE") {
      throw Object.assign(new Error("Tenant account is suspended"), { status: 403 });
    }
    if (user.tenantId !== tenant.id) {
      throw Object.assign(
        new Error("Access denied: You do not have permission to access this tenant workspace"),
        { status: 403 }
      );
    }
  } else {
    // Main landing/login page without any subdomain - only Super Admins allowed
    if (user.tenantId !== null) {
      throw Object.assign(
        new Error("Access denied: Please log in using your dedicated shop portal website URL"),
        { status: 403 }
      );
    }
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }

  const payload: JwtPayload = {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId,
  };

  const tokens = createTokenPair(payload);
  const safeUser = await getSafeUser(user.id);

  return { ...tokens, user: safeUser };
}

export async function refreshSession(refreshToken: string) {
  let payload: JwtPayload;

  try {
    payload = jwt.verify(refreshToken, env.jwtSecret) as JwtPayload;
  } catch {
    throw Object.assign(new Error("Invalid refresh token"), { status: 401 });
  }

  if (payload.type !== "refresh") {
    throw Object.assign(new Error("Invalid refresh token"), { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      isActive: true,
      role: true,
      tenantId: true,
      tenant: { select: { status: true } },
    },
  });

  if (!user || !user.isActive || (user.tenant && user.tenant.status !== "ACTIVE")) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }

  const nextPayload: Omit<JwtPayload, "type"> = {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId,
  };

  return {
    ...createTokenPair(nextPayload),
    user: await getSafeUser(user.id),
  };
}

export async function getCurrentUser(payload: JwtPayload) {
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      isActive: true,
      tenant: { select: { status: true } },
    },
  });

  if (!user || !user.isActive || (user.tenant && user.tenant.status !== "ACTIVE")) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }

  return getSafeUser(payload.userId);
}
