import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import { erc20Abi } from "./abis/erc20.js";
import { getPublicClient } from "./clients.js";
import { ZEROX_ALLOWANCE_HOLDER } from "./config/chains.js";

export interface TransactionStep {
  step: number;
  type: "approval" | "swap";
  description: string;
  to: string;
  data: string;
  value: string;
}

export interface TransactionPayload {
  chainId: number;
  transactions: TransactionStep[];
}

export interface SolanaSwapPayload {
  cluster: string;
  serializedTransaction: string;
  description: string;
}

/**
 * Parse a human-readable amount string into the raw BigInt value.
 */
export function parseAmount(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

/**
 * Format a raw BigInt amount into a human-readable string.
 */
export function formatAmount(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals);
}

/**
 * Query a token's decimals from on-chain.
 */
export async function getTokenDecimals(
  chainName: string,
  tokenAddress: `0x${string}`
): Promise<number> {
  const client = getPublicClient(chainName);
  const decimals = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "decimals",
  });
  return decimals;
}

/**
 * Query a token's symbol from on-chain.
 */
export async function getTokenSymbol(
  chainName: string,
  tokenAddress: `0x${string}`
): Promise<string> {
  const client = getPublicClient(chainName);
  const symbol = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "symbol",
  });
  return symbol;
}

/**
 * Check the current ERC20 allowance and build an approval transaction
 * to the 0x AllowanceHolder if the allowance is insufficient.
 * Returns null if no approval needed (e.g. native token or sufficient allowance).
 */
export async function buildApprovalIfNeeded(
  chainName: string,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  requiredAmount: bigint,
  tokenSymbol?: string
): Promise<TransactionStep | null> {
  const client = getPublicClient(chainName);
  const currentAllowance = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [ownerAddress, ZEROX_ALLOWANCE_HOLDER],
  });

  if (currentAllowance >= requiredAmount) return null;

  const symbol =
    tokenSymbol ?? (await getTokenSymbol(chainName, tokenAddress));
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [ZEROX_ALLOWANCE_HOLDER, requiredAmount],
  });

  return {
    step: 1,
    type: "approval",
    description: `Approve ${symbol} for 0x AllowanceHolder`,
    to: tokenAddress,
    data,
    value: "0",
  };
}

/**
 * Return a JSON text result for MCP tool responses.
 */
export function jsonResult(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, bigIntReplacer, 2) },
    ],
  };
}

/**
 * Return an error result for MCP tool responses.
 */
export function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

/**
 * JSON replacer that converts BigInts to strings.
 */
function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}
