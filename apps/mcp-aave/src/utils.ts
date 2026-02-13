import { encodeFunctionData, parseUnits, formatUnits, maxUint256 } from "viem";
import { erc20Abi } from "./abis/erc20.js";
import { getPublicClient } from "./clients.js";

export interface TransactionStep {
  step: number;
  type: "approval" | "action";
  description: string;
  to: string;
  data: string;
  value: string;
}

export interface TransactionPayload {
  chainId: number;
  transactions: TransactionStep[];
}

/**
 * Parse a human-readable amount string into the raw BigInt value
 * using the token's decimals. "max" returns maxUint256.
 */
export function parseAmount(amount: string, decimals: number): bigint {
  if (amount.toLowerCase() === "max") return maxUint256;
  return parseUnits(amount, decimals);
}

/**
 * Format a raw BigInt amount into a human-readable string.
 */
export function formatAmount(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals);
}

/**
 * Format a RAY value (27 decimals) as a percentage string.
 * AAVE rates are expressed in RAY (1e27).
 */
export function rayToPercent(ray: bigint): string {
  // rate / 1e27 * 100 = rate / 1e25
  const pct = Number(ray) / 1e25;
  return `${pct.toFixed(2)}%`;
}

/**
 * Format a WAD value (18 decimals) as a human-readable number string.
 */
export function formatWad(wad: bigint): string {
  return formatUnits(wad, 18);
}

/**
 * Format a base currency amount (8 decimals, USD) as a dollar string.
 */
export function formatBaseCurrency(amount: bigint): string {
  return formatUnits(amount, 8);
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
 * if the allowance is insufficient. Returns null if no approval needed.
 */
export async function buildApprovalIfNeeded(
  chainName: string,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  requiredAmount: bigint,
  tokenSymbol?: string
): Promise<TransactionStep | null> {
  const client = getPublicClient(chainName);
  const currentAllowance = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [ownerAddress, spenderAddress],
  });

  if (currentAllowance >= requiredAmount) return null;

  const symbol = tokenSymbol ?? (await getTokenSymbol(chainName, tokenAddress));
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spenderAddress, requiredAmount],
  });

  return {
    step: 1,
    type: "approval",
    description: `Approve ${symbol} spending by AAVE Pool`,
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
