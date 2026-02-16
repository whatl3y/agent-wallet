import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto";
import { db } from "../database/database.js";
import { generateEVMKeys, generateSolanaKeys } from "@agent-wallet/core";

export interface UserRecord {
  telegramUserId: number;
  evmPrivateKey: string;
  solanaPrivateKey: string;
  evmAddress: string;
  solanaAddress: string;
  createdAt: Date;
}

let _encryptionKey: Buffer | null = null;

function getEncryptionKey(passphrase: string): Buffer {
  if (!_encryptionKey) {
    _encryptionKey = scryptSync(passphrase, "agent-wallet-salt", 32);
  }
  return _encryptionKey;
}

function encrypt(plaintext: string, passphrase: string): string {
  const key = getEncryptionKey(passphrase);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let enc = cipher.update(plaintext, "utf8", "hex");
  enc += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + tag + ":" + enc;
}

function decrypt(ciphertext: string, passphrase: string): string {
  const key = getEncryptionKey(passphrase);
  const [ivHex, tagHex, encHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let dec = decipher.update(encHex, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

export async function getUser(
  telegramUserId: number,
  encryptionKey: string
): Promise<UserRecord | null> {
  const row = await db
    .selectFrom("users")
    .selectAll()
    .where("telegram_user_id", "=", telegramUserId)
    .executeTakeFirst();

  if (!row) return null;

  return {
    telegramUserId: row.telegram_user_id,
    evmPrivateKey: decrypt(row.evm_private_key_enc, encryptionKey),
    solanaPrivateKey: decrypt(row.solana_private_key_enc, encryptionKey),
    evmAddress: row.evm_address,
    solanaAddress: row.solana_address,
    createdAt: row.created_at,
  };
}

export async function createUser(
  telegramUserId: number,
  encryptionKey: string
): Promise<UserRecord> {
  const evm = generateEVMKeys();
  const solana = generateSolanaKeys();

  await db
    .insertInto("users")
    .values({
      telegram_user_id: telegramUserId,
      evm_private_key_enc: encrypt(evm.privateKey, encryptionKey),
      solana_private_key_enc: encrypt(solana.privateKey, encryptionKey),
      evm_address: evm.address,
      solana_address: solana.publicKey,
    })
    .execute();

  return {
    telegramUserId,
    evmPrivateKey: evm.privateKey,
    solanaPrivateKey: solana.privateKey,
    evmAddress: evm.address,
    solanaAddress: solana.publicKey,
    createdAt: new Date(),
  };
}

export async function getMessages(
  telegramUserId: number,
  limit: number
): Promise<Array<{ role: string; content: string }>> {
  const rows = await db
    .selectFrom("messages")
    .select(["role", "content"])
    .where("telegram_user_id", "=", telegramUserId)
    .orderBy("id", "desc")
    .limit(limit)
    .execute();

  return rows.reverse();
}

export async function addMessage(
  telegramUserId: number,
  role: string,
  content: string
): Promise<void> {
  await db
    .insertInto("messages")
    .values({ telegram_user_id: telegramUserId, role, content })
    .execute();
}

export async function clearMessages(telegramUserId: number): Promise<void> {
  await db
    .deleteFrom("messages")
    .where("telegram_user_id", "=", telegramUserId)
    .execute();
}
