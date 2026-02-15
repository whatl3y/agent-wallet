import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { RPC_ENV_VAR } from "./config/contracts.js";

let cachedClient: PublicClient | null = null;

/**
 * Get or create a cached viem PublicClient for Ethereum mainnet.
 * Convex Finance is deployed only on Ethereum mainnet.
 */
export function getPublicClient(): PublicClient {
  if (cachedClient) return cachedClient;

  const rpcUrl = process.env[RPC_ENV_VAR];
  if (!rpcUrl) {
    throw new Error(
      `Missing RPC URL: set ${RPC_ENV_VAR} environment variable`
    );
  }

  cachedClient = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });

  return cachedClient;
}
