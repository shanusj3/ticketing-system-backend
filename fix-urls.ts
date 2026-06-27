import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const tenants = await prisma.tenant.findMany({
    where: { logoUrl: { contains: 'assets.zeviodesk.com' } }
  });
  
  for (const t of tenants) {
    if (t.logoUrl) {
      const newUrl = t.logoUrl.replace('assets.zeviodesk.com', 'zeviodesk-assets.s3.ap-south-1.amazonaws.com');
      await prisma.tenant.update({
        where: { id: t.id },
        data: { logoUrl: newUrl }
      });
    }
  }
  
  console.log('Updated ' + tenants.length + ' tenants');
  await prisma.$disconnect();
}

run();
