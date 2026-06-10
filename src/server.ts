import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";
import { ensureSuperAdmin } from "./modules/auth/auth.service";

async function main() {
  await ensureSuperAdmin();

  app.listen(env.port, () => {
    console.log(`Ticketing backend listening on port ${env.port}`);
  });
}

main()
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
