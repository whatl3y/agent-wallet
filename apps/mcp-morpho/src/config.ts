import { mainnet, arbitrum, base, type Chain } from "viem/chains";

export interface MorphoDeployment {
  morpho: `0x${string}`;
  bundler3: `0x${string}`;
  adaptiveCurveIrm: `0x${string}`;
}

export interface ChainConfig {
  chain: Chain;
  chainId: number;
  rpcEnvVar: string;
  morpho: MorphoDeployment;
}

/**
 * Morpho deployment addresses per chain.
 * The core Morpho contract has the same address across all chains.
 */
export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  ethereum: {
    chain: mainnet,
    chainId: 1,
    rpcEnvVar: "ETHEREUM_RPC_URL",
    morpho: {
      morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      bundler3: "0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245",
      adaptiveCurveIrm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    },
  },
  base: {
    chain: base,
    chainId: 8453,
    rpcEnvVar: "BASE_RPC_URL",
    morpho: {
      morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      bundler3: "0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245",
      adaptiveCurveIrm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    },
  },
  arbitrum: {
    chain: arbitrum,
    chainId: 42161,
    rpcEnvVar: "ARBITRUM_RPC_URL",
    morpho: {
      morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      bundler3: "0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245",
      adaptiveCurveIrm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    },
  },
};

export const SUPPORTED_CHAINS = Object.keys(CHAIN_CONFIGS);

export const CHAIN_ID_TO_NAME: Record<number, string> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrum",
};

export function getChainConfig(chain: string): ChainConfig {
  const config = CHAIN_CONFIGS[chain.toLowerCase()];
  if (!config) {
    throw new Error(
      `Unsupported chain: ${chain}. Supported: ${SUPPORTED_CHAINS.join(", ")}`
    );
  }
  return config;
}
