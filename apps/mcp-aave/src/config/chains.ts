import {
  mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
  type Chain,
} from "viem/chains";

export interface AaveDeployment {
  pool: `0x${string}`;
  poolDataProvider: `0x${string}`;
  oracle: `0x${string}`;
  poolAddressesProvider: `0x${string}`;
  wrappedTokenGateway: `0x${string}`;
  wrappedNativeToken: `0x${string}`;
  /** StakedAave contract — only on Ethereum mainnet */
  stakedAave?: `0x${string}`;
  /** AAVE token address — only on chains where AAVE exists */
  aaveToken?: `0x${string}`;
}

export interface ChainConfig {
  chain: Chain;
  rpcEnvVar: string;
  aave: AaveDeployment;
}

/**
 * Canonical AAVE V3 deployment addresses per chain.
 * Source: https://github.com/bgd-labs/aave-address-book
 */
export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  ethereum: {
    chain: mainnet,
    rpcEnvVar: "ETHEREUM_RPC_URL",
    aave: {
      pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
      poolDataProvider: "0x7B4EB56E7CD4b454BA8ff71E4518426c6B507677",
      oracle: "0x54586bE62E3c3580375aE3723C145253060Ca0C2",
      poolAddressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
      wrappedTokenGateway: "0x893411580e590D62dDBca8a703d61Cc4A8c7b2b9",
      wrappedNativeToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      stakedAave: "0x4da27a545c0c5B758a6BA100e3a049001de870f5",
      aaveToken: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    },
  },
  polygon: {
    chain: polygon,
    rpcEnvVar: "POLYGON_RPC_URL",
    aave: {
      pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
      poolDataProvider: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
      oracle: "0xb023e699F5a33916Ea823A16485e259257cA8Bd1",
      poolAddressesProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
      wrappedTokenGateway: "0x1e4b7A6b903680eab0c5dAbcb8fD429cD2a9598c",
      wrappedNativeToken: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    },
  },
  arbitrum: {
    chain: arbitrum,
    rpcEnvVar: "ARBITRUM_RPC_URL",
    aave: {
      pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
      poolDataProvider: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
      oracle: "0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7",
      poolAddressesProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
      wrappedTokenGateway: "0xB5Ee21786D28c5Ba61661550879475976B707099",
      wrappedNativeToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    },
  },
  optimism: {
    chain: optimism,
    rpcEnvVar: "OPTIMISM_RPC_URL",
    aave: {
      pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
      poolDataProvider: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
      oracle: "0xD81eb3728a631871a7eBBaD631b5f424909f0c77",
      poolAddressesProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
      wrappedTokenGateway: "0xe9E52021f4e11DEAD8661812A0A6c8627abA2a54",
      wrappedNativeToken: "0x4200000000000000000000000000000000000006",
    },
  },
  base: {
    chain: base,
    rpcEnvVar: "BASE_RPC_URL",
    aave: {
      pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
      poolDataProvider: "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac",
      oracle: "0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156",
      poolAddressesProvider: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
      wrappedTokenGateway: "0x8be473dCfA93132559B118a2F130F5D41B2B7b10",
      wrappedNativeToken: "0x4200000000000000000000000000000000000006",
    },
  },
  avalanche: {
    chain: avalanche,
    rpcEnvVar: "AVALANCHE_RPC_URL",
    aave: {
      pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
      poolDataProvider: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
      oracle: "0xEBd36016B3eD09D4693Ed4251c67Bd858c3c7C9C",
      poolAddressesProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
      wrappedTokenGateway: "0xa938d8536aEed1Bd48f548380394Ab30Aa11B00E",
      wrappedNativeToken: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
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
