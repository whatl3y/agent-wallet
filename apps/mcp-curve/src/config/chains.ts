import {
  mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
  type Chain,
} from "viem/chains";

export interface CurveDeployment {
  /** CurveRouterNG for multi-hop swaps */
  router: `0x${string}`;
  /** AddressProvider (registry discovery) */
  addressProvider: `0x${string}`;
  /** CRV token address on this chain */
  crvToken: `0x${string}`;
  /** CRV Minter — only on Ethereum mainnet */
  minter?: `0x${string}`;
  /** Curve API blockchain identifier */
  apiBlockchainId: string;
}

export interface ChainConfig {
  chain: Chain;
  rpcEnvVar: string;
  curve: CurveDeployment;
}

const ADDRESS_PROVIDER =
  "0x0000000022D53366457F9d5E68Ec105046FC4383" as const;

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  ethereum: {
    chain: mainnet,
    rpcEnvVar: "ETHEREUM_RPC_URL",
    curve: {
      router: "0x16C6521Dff6baB339122a0FE25a9116693265353",
      addressProvider: ADDRESS_PROVIDER,
      crvToken: "0xD533a949740bb3306d119CC777fa900bA034cd52",
      minter: "0xd061D61a4d941c39E5453435B6345Dc261C2fcE0",
      apiBlockchainId: "ethereum",
    },
  },
  polygon: {
    chain: polygon,
    rpcEnvVar: "POLYGON_RPC_URL",
    curve: {
      router: "0x0DCDED3545D565bA3B19E683431381007245d983",
      addressProvider: ADDRESS_PROVIDER,
      crvToken: "0x172370d5Cd63279eFa6d502DAB29171933a610AF",
      apiBlockchainId: "polygon",
    },
  },
  arbitrum: {
    chain: arbitrum,
    rpcEnvVar: "ARBITRUM_RPC_URL",
    curve: {
      router: "0x2191718CD32d02B8E60BAdFFeA33E4B5DD9A0A0D",
      addressProvider: ADDRESS_PROVIDER,
      crvToken: "0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978",
      apiBlockchainId: "arbitrum",
    },
  },
  optimism: {
    chain: optimism,
    rpcEnvVar: "OPTIMISM_RPC_URL",
    curve: {
      router: "0x0DCDED3545D565bA3B19E683431381007245d983",
      addressProvider: ADDRESS_PROVIDER,
      crvToken: "0x0994206dfE8De6Ec6920FF4D779B0d950605Fb53",
      apiBlockchainId: "optimism",
    },
  },
  base: {
    chain: base,
    rpcEnvVar: "BASE_RPC_URL",
    curve: {
      router: "0x4f37A9d177470499A2dD084621020b023fcffc1F",
      addressProvider: ADDRESS_PROVIDER,
      crvToken: "0x8Ee73c484A26e0A5df2Ee2a4960B789967dd0415",
      apiBlockchainId: "base",
    },
  },
  avalanche: {
    chain: avalanche,
    rpcEnvVar: "AVALANCHE_RPC_URL",
    curve: {
      router: "0xd6681e74eEA20d196c15038C580f721EF2aB6320",
      addressProvider: ADDRESS_PROVIDER,
      crvToken: "0x47536F17F4fF30e64A96a7555826b8f9e66ec468",
      apiBlockchainId: "avalanche",
    },
  },
};

export const SUPPORTED_CHAINS = Object.keys(CHAIN_CONFIGS);

export function getChainConfig(chain: string): ChainConfig {
  const config = CHAIN_CONFIGS[chain.toLowerCase()];
  if (!config) {
    throw new Error(
      `Unsupported chain: ${chain}. Supported: ${SUPPORTED_CHAINS.join(", ")}`
    );
  }
  return config;
}
