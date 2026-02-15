import { getAddress } from "viem";
import {
  mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
  type Chain,
} from "viem/chains";

export interface SwapChainConfig {
  chain: Chain;
  rpcEnvVar: string;
  zeroxChainId: number;
}

/**
 * 0x AllowanceHolder contract — same address on all EVM chains.
 * Tokens must be approved to this address for 0x swaps.
 * Normalized to proper EIP-55 checksum.
 */
export const ZEROX_ALLOWANCE_HOLDER = getAddress(
  "0x0000000000001fF3684f28c67538d4D072C22734"
);

/**
 * Native token sentinel address used by 0x API.
 */
export const NATIVE_TOKEN_ADDRESS =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export const CHAIN_CONFIGS: Record<string, SwapChainConfig> = {
  ethereum: {
    chain: mainnet,
    rpcEnvVar: "ETHEREUM_RPC_URL",
    zeroxChainId: 1,
  },
  polygon: {
    chain: polygon,
    rpcEnvVar: "POLYGON_RPC_URL",
    zeroxChainId: 137,
  },
  arbitrum: {
    chain: arbitrum,
    rpcEnvVar: "ARBITRUM_RPC_URL",
    zeroxChainId: 42161,
  },
  optimism: {
    chain: optimism,
    rpcEnvVar: "OPTIMISM_RPC_URL",
    zeroxChainId: 10,
  },
  base: {
    chain: base,
    rpcEnvVar: "BASE_RPC_URL",
    zeroxChainId: 8453,
  },
  avalanche: {
    chain: avalanche,
    rpcEnvVar: "AVALANCHE_RPC_URL",
    zeroxChainId: 43114,
  },
};

export const SUPPORTED_CHAINS = Object.keys(CHAIN_CONFIGS);

export function getChainConfig(chain: string): SwapChainConfig {
  const config = CHAIN_CONFIGS[chain.toLowerCase()];
  if (!config) {
    throw new Error(
      `Unsupported chain: ${chain}. Supported: ${SUPPORTED_CHAINS.join(", ")}`
    );
  }
  return config;
}
