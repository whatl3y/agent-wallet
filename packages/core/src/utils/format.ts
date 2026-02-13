import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function formatWei(wei: bigint): string {
  return formatEther(wei);
}

export function parseToWei(ether: string): bigint {
  return parseEther(ether);
}

export function formatTokenUnits(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals);
}

export function parseTokenUnits(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

export function formatLamports(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toString();
}

export function parseToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}
