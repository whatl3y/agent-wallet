import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("messages")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("telegram_user_id", "bigint", (col) =>
      col.references("users.telegram_user_id").onDelete("cascade").notNull()
    )
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
    )
    .execute();

  await db.schema
    .createIndex("idx_messages_telegram_user_id")
    .on("messages")
    .column("telegram_user_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("messages").execute();
}
