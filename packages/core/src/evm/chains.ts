import {
  mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
  type Chain,
} from "viem/chains";
import type { EVMChainConfig } from "../types.js";

export const EVM_CHAINS: Record<string, EVMChainConfig> = {
  ethereum: {
    chain: mainnet,
    chainId: 1,
    name: "Ethereum",
    rpcEnvVar: "ETHEREUM_RPC_URL",
    nativeSymbol: "ETH",
    explorerUrl: "https://etherscan.io",
  },
  polygon: {
    chain: polygon,
    chainId: 137,
    name: "Polygon",
    rpcEnvVar: "POLYGON_RPC_URL",
    nativeSymbol: "POL",
    explorerUrl: "https://polygonscan.com",
  },
  arbitrum: {
    chain: arbitrum,
    chainId: 42161,
    name: "Arbitrum",
    rpcEnvVar: "ARBITRUM_RPC_URL",
    nativeSymbol: "ETH",
    explorerUrl: "https://arbiscan.io",
  },
  optimism: {
    chain: optimism,
    chainId: 10,
    name: "Optimism",
    rpcEnvVar: "OPTIMISM_RPC_URL",
    nativeSymbol: "ETH",
    explorerUrl: "https://optimistic.etherscan.io",
  },
  base: {
    chain: base,
    chainId: 8453,
    name: "Base",
    rpcEnvVar: "BASE_RPC_URL",
    nativeSymbol: "ETH",
    explorerUrl: "https://basescan.org",
  },
  avalanche: {
    chain: avalanche,
    chainId: 43114,
    name: "Avalanche",
    rpcEnvVar: "AVALANCHE_RPC_URL",
    nativeSymbol: "AVAX",
    explorerUrl: "https://snowtrace.io",
  },
};

export const SUPPORTED_EVM_CHAINS = Object.keys(EVM_CHAINS);

export function getEVMChainConfig(chainName: string): EVMChainConfig {
  const config = EVM_CHAINS[chainName.toLowerCase()];
  if (!config) {
    throw new Error(
      `Unsupported EVM chain: ${chainName}. Supported: ${SUPPORTED_EVM_CHAINS.join(", ")}`
    );
  }
  return config;
}

export function getEVMChainConfigByChainId(
  chainId: number
): EVMChainConfig & { key: string } {
  for (const [key, config] of Object.entries(EVM_CHAINS)) {
    if (config.chainId === chainId) {
      return { ...config, key };
    }
  }
  throw new Error(
    `Unsupported chainId: ${chainId}. Supported: ${Object.values(EVM_CHAINS).map((c) => `${c.name}(${c.chainId})`).join(", ")}`
  );
}
