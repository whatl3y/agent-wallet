import path from "path";
import fs from "fs/promises";
import { Pool } from "pg";
import bunyan from "bunyan";
import {
  Kysely,
  Migrator,
  PostgresDialect,
  FileMigrationProvider,
} from "kysely";
import type { Database } from "./types.js";
import { getPoolConfig } from "./database.js";

export interface MigrateOptions {
  databaseUrl: string;
  log: bunyan;
  migrationFolder?: string;
}

export async function migrateToLatest(options: MigrateOptions): Promise<void> {
  const { databaseUrl, log, migrationFolder } = options;

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool(getPoolConfig(databaseUrl)),
    }),
  });

  const defaultMigrationFolder = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "migrations"
  );

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: migrationFolder || defaultMigrationFolder,
    }),
  });

  log.info("Starting DB migrations:");

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      log.info(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      log.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    log.error("failed to migrate");
    log.error(error);
    await db.destroy();
    process.exit(1);
  }

  await db.destroy();
}
