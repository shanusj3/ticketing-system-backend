import { prisma } from "../../config/database";

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { tenant: true },
    });
  },
};
