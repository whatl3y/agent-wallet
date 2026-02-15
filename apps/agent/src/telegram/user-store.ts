import Database from "better-sqlite3";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { generateEVMKeys, generateSolanaKeys } from "@agent-wallet/core";

export interface UserRecord {
  telegramUserId: number;
  evmPrivateKey: string;
  solanaPrivateKey: string;
  evmAddress: string;
  solanaAddress: string;
  createdAt: string;
}

export class UserStore {
  private db: Database.Database;
  private encryptionKey: Buffer;

  constructor(dbPath: string, encryptionPassphrase: string) {
    if (!encryptionPassphrase) {
      throw new Error("WALLET_ENCRYPTION_KEY is required");
    }

    this.encryptionKey = scryptSync(encryptionPassphrase, "agent-wallet-salt", 32);

    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_user_id INTEGER PRIMARY KEY,
        evm_private_key_enc TEXT NOT NULL,
        solana_private_key_enc TEXT NOT NULL,
        evm_address TEXT NOT NULL,
        solana_address TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id)
      )
    `);
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    let enc = cipher.update(plaintext, "utf8", "hex");
    enc += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return iv.toString("hex") + ":" + tag + ":" + enc;
  }

  private decrypt(ciphertext: string): string {
    const [ivHex, tagHex, encHex] = ciphertext.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(encHex, "hex", "utf8");
    dec += decipher.final("utf8");
    return dec;
  }

  getUser(telegramUserId: number): UserRecord | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE telegram_user_id = ?")
      .get(telegramUserId) as any;

    if (!row) return null;

    return {
      telegramUserId: row.telegram_user_id,
      evmPrivateKey: this.decrypt(row.evm_private_key_enc),
      solanaPrivateKey: this.decrypt(row.solana_private_key_enc),
      evmAddress: row.evm_address,
      solanaAddress: row.solana_address,
      createdAt: row.created_at,
    };
  }

  getMessages(telegramUserId: number, limit: number): Array<{ role: string; content: string }> {
    const rows = this.db
      .prepare(
        `SELECT role, content FROM messages
         WHERE telegram_user_id = ?
         ORDER BY id DESC LIMIT ?`
      )
      .all(telegramUserId, limit) as Array<{ role: string; content: string }>;
    return rows.reverse();
  }

  addMessage(telegramUserId: number, role: string, content: string): void {
    this.db
      .prepare(
        `INSERT INTO messages (telegram_user_id, role, content) VALUES (?, ?, ?)`
      )
      .run(telegramUserId, role, content);
  }

  clearMessages(telegramUserId: number): void {
    this.db
      .prepare(`DELETE FROM messages WHERE telegram_user_id = ?`)
      .run(telegramUserId);
  }

  createUser(telegramUserId: number): UserRecord {
    const evm = generateEVMKeys();
    const solana = generateSolanaKeys();

    const evmPrivateKey = evm.privateKey;
    const evmAddress = evm.address;
    const solanaPrivateKey = solana.privateKey;
    const solanaAddress = solana.publicKey;

    this.db
      .prepare(
        `INSERT INTO users (telegram_user_id, evm_private_key_enc, solana_private_key_enc, evm_address, solana_address)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        telegramUserId,
        this.encrypt(evmPrivateKey),
        this.encrypt(solanaPrivateKey),
        evmAddress,
        solanaAddress
      );

    return {
      telegramUserId,
      evmPrivateKey,
      solanaPrivateKey,
      evmAddress,
      solanaAddress,
      createdAt: new Date().toISOString(),
    };
  }
}
