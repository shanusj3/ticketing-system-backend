import { UserRole } from "@prisma/client";

export interface JwtPayload {
  userId: string;
  role: UserRole;
  tenantId: string | null;
}
