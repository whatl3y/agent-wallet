import {
  mainnet,
  arbitrum,
  base,
  optimism,
  avalanche,
  type Chain,
} from "viem/chains";
import { ChainId } from "@balancer/sdk";

export interface BalancerDeployment {
  /** Balancer V3 Vault (same on all chains) */
  vault: `0x${string}`;
  /** Router v2 for single swaps and liquidity ops */
  router: `0x${string}`;
  /** BatchRouter for multi-hop swaps */
  batchRouter: `0x${string}`;
  /** @balancer/sdk ChainId */
  sdkChainId: ChainId;
}

export interface ChainConfig {
  chain: Chain;
  rpcEnvVar: string;
  balancer: BalancerDeployment;
}

/** Balancer V3 Vault is deployed at the same address on all chains via CREATE2 */
const VAULT = "0xbA1333333333a1BA1108E8412f11850A5C319bA9" as const;

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  ethereum: {
    chain: mainnet,
    rpcEnvVar: "ETHEREUM_RPC_URL",
    balancer: {
      vault: VAULT,
      router: "0xAE563E3f8219521950555F5962419C8919758Ea2",
      batchRouter: "0x136f1EFcC3f8f88516B9E94110D56FDBfB1778d1",
      sdkChainId: ChainId.MAINNET,
    },
  },
  arbitrum: {
    chain: arbitrum,
    rpcEnvVar: "ARBITRUM_RPC_URL",
    balancer: {
      vault: VAULT,
      router: "0xEAedc32a51c510d35ebC11088fD5fF2b47aACF2E",
      batchRouter: "0xaD89051bEd8d96f045E8912aE1672c6C0bF8a85E",
      sdkChainId: ChainId.ARBITRUM_ONE,
    },
  },
  base: {
    chain: base,
    rpcEnvVar: "BASE_RPC_URL",
    balancer: {
      vault: VAULT,
      router: "0x3f170631ed9821Ca51A59D996aB095162438DC10",
      batchRouter: "0x85a80afee867aDf27B50BdB7b76DA70f1E853062",
      sdkChainId: ChainId.BASE,
    },
  },
  optimism: {
    chain: optimism,
    rpcEnvVar: "OPTIMISM_RPC_URL",
    balancer: {
      vault: VAULT,
      router: "0xe2fa4e1d17725e72dcdAfe943Ecf45dF4B9E285b",
      batchRouter: "0xaD89051bEd8d96f045E8912aE1672c6C0bF8a85E",
      sdkChainId: ChainId.OPTIMISM,
    },
  },
  avalanche: {
    chain: avalanche,
    rpcEnvVar: "AVALANCHE_RPC_URL",
    balancer: {
      vault: VAULT,
      router: "0xF39CA6ede9BF7820a952b52f3c94af526bAB9015",
      batchRouter: "0xc9b36096f5201ea332Db35d6D195774ea0D5988f",
      sdkChainId: ChainId.AVALANCHE,
    },
  },
};

export const SUPPORTED_CHAINS = Object.keys(CHAIN_CONFIGS);

/** Mapping from chain name to Balancer API chain identifier */
export const API_CHAIN_NAMES: Record<string, string> = {
  ethereum: "MAINNET",
  arbitrum: "ARBITRUM",
  base: "BASE",
  optimism: "OPTIMISM",
  avalanche: "AVALANCHE",
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
