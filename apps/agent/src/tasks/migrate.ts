import "dotenv/config";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { migrateToLatest } from "../database/migrate.js";

(async function runMigrations() {
  if (!config.databaseUrl) {
    logger.error("DATABASE_URL is required");
    process.exit(1);
  }

  await migrateToLatest({
    databaseUrl: config.databaseUrl,
    log: logger,
  });

  logger.info("Migrations complete");
  process.exit(0);
})();
