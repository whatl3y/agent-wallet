import {
  createWalletClient,
  http,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getEVMChainConfig } from "./chains.js";

let account: Account | null = null;
const walletCache = new Map<string, WalletClient>();

export function getEVMAccount(): Account {
  if (account) return account;

  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing EVM_PRIVATE_KEY environment variable");
  }

  account = privateKeyToAccount(privateKey as `0x${string}`);
  return account;
}

export function getWalletClient(chainName: string): WalletClient {
  const cached = walletCache.get(chainName);
  if (cached) return cached;

  const config = getEVMChainConfig(chainName);
  const rpcUrl = process.env[config.rpcEnvVar];

  if (!rpcUrl) {
    throw new Error(
      `Missing RPC URL: set ${config.rpcEnvVar} environment variable`
    );
  }

  const client = createWalletClient({
    account: getEVMAccount(),
    chain: config.chain,
    transport: http(rpcUrl),
  });

  walletCache.set(chainName, client);
  return client;
}
