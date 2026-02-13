import { createPublicClient, http, type PublicClient } from "viem";
import { getEVMChainConfig } from "./chains.js";

const clientCache = new Map<string, PublicClient>();

export function getPublicClient(chainName: string): PublicClient {
  const cached = clientCache.get(chainName);
  if (cached) return cached;

  const config = getEVMChainConfig(chainName);
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
