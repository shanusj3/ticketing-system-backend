import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";

async function main() {
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
  // Disconnect prisma is currently an extension without $disconnect
  // But wait, $disconnect is not available on basePrisma extensions directly unless we use basePrisma
  process.exit(0);
});
