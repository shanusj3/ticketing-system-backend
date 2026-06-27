import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const tenants = await prisma.tenant.findMany({ select: { name: true, logoUrl: true } });
  console.log(tenants);
  await prisma.$disconnect();
}
run();
