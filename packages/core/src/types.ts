import type { Chain } from "viem";
import type { Cluster } from "@solana/web3.js";

// ── EVM Types ────────────────────────────────────────────────────────

export interface EVMChainConfig {
  chain: Chain;
  chainId: number;
  name: string;
  rpcEnvVar: string;
  nativeSymbol: string;
  explorerUrl: string;
}

export interface EVMTransactionRequest {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
}

export interface EVMTransactionResult {
  hash: `0x${string}`;
  chainId: number;
  blockNumber?: bigint;
  gasUsed?: bigint;
  status: "success" | "reverted";
}

// ── Solana Types ─────────────────────────────────────────────────────

export interface SolanaClusterConfig {
  name: string;
  cluster: Cluster;
  rpcEnvVar: string;
  nativeSymbol: "SOL";
  explorerUrl: string;
}

export interface SolanaTransactionResult {
  signature: string;
  cluster: string;
  status: "success" | "failed";
}

// ── MCP Transaction Payload ──────────────────────────────────────────

export interface MCPTransactionStep {
  to: string;
  data: string;
  value: string;
  description?: string;
}

export interface MCPTransactionPayload {
  chainId: number;
  transactions: MCPTransactionStep[];
}

// ── Wallet Info ──────────────────────────────────────────────────────

export interface WalletAddresses {
  evm: `0x${string}`;
  solana: string;
}

export interface BalanceInfo {
  chain: string;
  address: string;
  nativeBalance: string;
  nativeSymbol: string;
}

export interface TokenBalanceInfo {
  chain: string;
  owner: string;
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  rawBalance: string;
}

export interface NFTBalanceInfo {
  chain: string;
  owner: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  balance: string;
  tokenIds: string[];
}
