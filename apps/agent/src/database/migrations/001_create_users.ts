import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("telegram_user_id", "bigint", (col) => col.primaryKey())
    .addColumn("evm_private_key_enc", "text", (col) => col.notNull())
    .addColumn("solana_private_key_enc", "text", (col) => col.notNull())
    .addColumn("evm_address", "text", (col) => col.notNull())
    .addColumn("solana_address", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("users").execute();
}
