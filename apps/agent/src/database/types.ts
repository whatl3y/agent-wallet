import { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely";

export interface Database {
  users: UsersTable;
  messages: MessagesTable;
}

export interface UsersTable {
  telegram_user_id: number;
  evm_private_key_enc: string;
  solana_private_key_enc: string;
  evm_address: string;
  solana_address: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;

export interface MessagesTable {
  id: Generated<number>;
  telegram_user_id: number;
  role: string;
  content: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export type Message = Selectable<MessagesTable>;
export type NewMessage = Insertable<MessagesTable>;
