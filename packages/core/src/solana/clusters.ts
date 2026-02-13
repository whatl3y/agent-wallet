import type { SolanaClusterConfig } from "../types.js";

export const SOLANA_CLUSTERS: Record<string, SolanaClusterConfig> = {
  "solana-mainnet": {
    name: "Solana Mainnet",
    cluster: "mainnet-beta",
    rpcEnvVar: "SOLANA_MAINNET_RPC_URL",
    nativeSymbol: "SOL",
    explorerUrl: "https://explorer.solana.com",
  },
  "solana-devnet": {
    name: "Solana Devnet",
    cluster: "devnet",
    rpcEnvVar: "SOLANA_DEVNET_RPC_URL",
    nativeSymbol: "SOL",
    explorerUrl: "https://explorer.solana.com?cluster=devnet",
  },
};

export const SUPPORTED_SOLANA_CLUSTERS = Object.keys(SOLANA_CLUSTERS);

export function getSolanaClusterConfig(
  clusterName: string
): SolanaClusterConfig {
  const config = SOLANA_CLUSTERS[clusterName.toLowerCase()];
  if (!config) {
    throw new Error(
      `Unsupported Solana cluster: ${clusterName}. Supported: ${SUPPORTED_SOLANA_CLUSTERS.join(", ")}`
    );
  }
  return config;
}
