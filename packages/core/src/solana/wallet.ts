import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

let keypair: Keypair | null = null;

export function getSolanaKeypair(): Keypair {
  if (keypair) return keypair;

  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing SOLANA_PRIVATE_KEY environment variable");
  }

  keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
  return keypair;
}
