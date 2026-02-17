import { createPublicClient, http, type PublicClient } from "viem";
import { getChainConfig } from "./config.js";

const clientCache = new Map<string, PublicClient>();

/**
 * Get or create a cached viem PublicClient for the given chain.
 * Uses the RPC URL from environment variables.
 */
export function getPublicClient(chainName: string): PublicClient {
  const cached = clientCache.get(chainName);
  if (cached) return cached;

  const config = getChainConfig(chainName);
  const rpcUrl = process.env[config.rpcEnvVar];

  if (!rpcUrl) {
    throw new Error(
      `Missing RPC URL: set ${config.rpcEnvVar} environment variable`
    );
  }

  const client = createPublicClient({
    chain: config.chain,
    transport: http(rpcUrl),
  });

  clientCache.set(chainName, client);
  return client;
}
