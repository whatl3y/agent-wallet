import { arbitrum, avalanche, type Chain } from "viem/chains";

export interface GmxDeployment {
  dataStore: `0x${string}`;
  exchangeRouter: `0x${string}`;
  syntheticsRouter: `0x${string}`;
  orderVault: `0x${string}`;
  syntheticsReader: `0x${string}`;
  referralStorage: `0x${string}`;
  wrappedNativeToken: `0x${string}`;
  apiBaseUrl: string;
}

export interface ChainConfig {
  chain: Chain;
  rpcEnvVar: string;
  gmx: GmxDeployment;
}

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  arbitrum: {
    chain: arbitrum,
    rpcEnvVar: "ARBITRUM_RPC_URL",
    gmx: {
      dataStore: "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",
      exchangeRouter: "0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41",
      syntheticsRouter: "0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6",
      orderVault: "0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5",
      syntheticsReader: "0x470fbC46bcC0f16532691Df360A07d8Bf5ee0789",
      referralStorage: "0xe6fab3f0c7199b0d34d7fbe83394fc0e0d06e99d",
      wrappedNativeToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      apiBaseUrl: "https://arbitrum-api.gmxinfra.io",
    },
  },
  avalanche: {
    chain: avalanche,
    rpcEnvVar: "AVALANCHE_RPC_URL",
    gmx: {
      dataStore: "0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6",
      exchangeRouter: "0x8f550E53DFe96C055D5Bdb267c21F268fCAF63B2",
      syntheticsRouter: "0x820F5FfC5b525cD4d88Cd91aCf2c28F16530Cc68",
      orderVault: "0xD3D60D22d415aD43b7e64b510D86A30f19B1B12C",
      syntheticsReader: "0x62Cb8740E6986B29dC671B2Eb596676f60590A5B",
      referralStorage: "0x827ed045002ecdabeb6e2b0d1604cf5fc3d322f8",
      wrappedNativeToken: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      apiBaseUrl: "https://avalanche-api.gmxinfra.io",
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
