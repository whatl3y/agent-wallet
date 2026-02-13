import {
  Connection,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { SolanaTransactionResult } from "../types.js";
import { getSolanaClusterConfig } from "./clusters.js";
import { getSolanaKeypair } from "./wallet.js";

const connectionCache = new Map<string, Connection>();

export function getConnection(clusterName: string): Connection {
  const cached = connectionCache.get(clusterName);
  if (cached) return cached;

  const config = getSolanaClusterConfig(clusterName);
  const rpcUrl = process.env[config.rpcEnvVar];

  if (!rpcUrl) {
    throw new Error(
      `Missing RPC URL: set ${config.rpcEnvVar} environment variable`
    );
  }

  const connection = new Connection(rpcUrl, "confirmed");
  connectionCache.set(clusterName, connection);
  return connection;
}

export async function sendSOL(
  clusterName: string,
  to: string,
  amountSOL: number
): Promise<SolanaTransactionResult> {
  const connection = getConnection(clusterName);
  const keypair = getSolanaKeypair();

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(to),
      lamports: Math.round(amountSOL * LAMPORTS_PER_SOL),
    })
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [
    keypair,
  ]);

  return {
    signature,
    cluster: clusterName,
    status: "success",
  };
}

export async function signAndSendSerializedTransaction(
  clusterName: string,
  serializedTransaction: string
): Promise<SolanaTransactionResult> {
  const connection = getConnection(clusterName);
  const keypair = getSolanaKeypair();

  const txBuffer = Buffer.from(serializedTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(txBuffer);

  transaction.sign([keypair]);

  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    { skipPreflight: false, preflightCommitment: "confirmed" }
  );

  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed"
  );

  return {
    signature,
    cluster: clusterName,
    status: "success",
  };
}
