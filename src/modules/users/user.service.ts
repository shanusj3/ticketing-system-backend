import bcrypt from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../config/database";
import { assertUserLimit } from "../subscription/subscription.service";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

export async function listTenantUsers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId },
    select: publicUserSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function createTenantUser(
  tenantId: string,
  input: { name: string; email: string; password: string; role: UserRole }
) {
  await assertUserLimit(tenantId);

  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    return await prisma.user.create({
      data: {
        tenantId,
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      },
      select: publicUserSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw Object.assign(new Error("A user with this email already exists"), { status: 409 });
    }
    throw error;
  }
}
