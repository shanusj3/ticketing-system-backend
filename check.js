const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
prisma.tenant.findMany().then(console.log).finally(() => prisma.$disconnect());
