import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getPublicClient } from "../clients.js";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { getPoolByAddress } from "../api/curve.js";
import { poolViewAbi } from "../abis/pool.js";
import {
  parseAmount,
  formatAmount,
  getTokenDecimals,
  getTokenSymbol,
  buildApprovalIfNeeded,
  jsonResult,
  errorResult,
  type TransactionStep,
  type TransactionPayload,
} from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

/**
 * Resolve the index of a token within a Curve pool's coins array.
 */
async function resolveCoinIndex(
  poolCoins: Array<{ address: string; symbol: string }>,
  tokenAddress: string
): Promise<number> {
  const idx = poolCoins.findIndex(
    (c) => c.address.toLowerCase() === tokenAddress.toLowerCase()
  );
  if (idx === -1) {
    const available = poolCoins
      .map((c) => `${c.symbol} (${c.address})`)
      .join(", ");
    throw new Error(
      `Token ${tokenAddress} is not in this pool. Available coins: ${available}`
    );
  }
  return idx;
}

export function registerSwapTools(server: McpServer) {
  // ── Swap Quote ─────────────────────────────────────────────────────
  server.tool(
    "curve_swap_quote",
    "Get a swap quote from a specific Curve pool. NOTE: For general token swaps, PREFER using swap_evm_quote from the swap MCP server, which aggregates across all DEXes (including Curve) for best prices. Use this Curve-specific swap only when: (1) swapping between stablecoins or like-kind assets where Curve's StableSwap algorithm excels, (2) the swap MCP server is unavailable, or (3) the user explicitly requests a Curve swap.",
    {
      chain: chainParam,
      pool: addressParam.describe(
        "Curve pool contract address (get from curve_get_pools)"
      ),
      tokenIn: addressParam.describe("Token to sell (must be a coin in the pool)"),
      tokenOut: addressParam.describe("Token to buy (must be a coin in the pool)"),
      amountIn: z
        .string()
        .describe("Amount to sell (human-readable units)"),
    },
    async ({ chain, pool, tokenIn, tokenOut, amountIn }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);
        const poolData = await getPoolByAddress(
          config.curve.apiBlockchainId,
          pool
        );

        if (!poolData) {
          return errorResult(
            `Pool ${pool} not found on ${chain}. Use curve_get_pools to discover available pools.`
          );
        }

        const i = await resolveCoinIndex(poolData.coins, tokenIn);
        const j = await resolveCoinIndex(poolData.coins, tokenOut);
        const inDecimals = Number(poolData.coins[i].decimals);
        const outDecimals = Number(poolData.coins[j].decimals);
        const rawAmountIn = parseAmount(amountIn, inDecimals);

        const rawAmountOut = await client.readContract({
          address: pool as `0x${string}`,
          abi: poolViewAbi,
          functionName: "get_dy",
          args: [BigInt(i), BigInt(j), rawAmountIn],
        });

        const amountOut = formatAmount(rawAmountOut, outDecimals);
        const inSymbol = poolData.coins[i].symbol;
        const outSymbol = poolData.coins[j].symbol;

        // Calculate price impact if prices are available
        let priceImpact: string | null = null;
        const inPrice = poolData.coins[i].usdPrice;
        const outPrice = poolData.coins[j].usdPrice;
        if (inPrice && outPrice && inPrice > 0 && outPrice > 0) {
          const inUsd = Number(amountIn) * inPrice;
          const outUsd = Number(amountOut) * outPrice;
          const impact = ((inUsd - outUsd) / inUsd) * 100;
          priceImpact = `${impact.toFixed(4)}%`;
        }

        return jsonResult({
          chain,
          pool: poolData.address,
          poolName: poolData.name,
          tokenIn: { address: tokenIn, symbol: inSymbol, amount: amountIn },
          tokenOut: {
            address: tokenOut,
            symbol: outSymbol,
            amount: amountOut,
          },
          priceImpact,
          note: "For best execution across all DEXes, consider using swap_evm_quote from the swap MCP server instead.",
        });
      } catch (e) {
        return errorResult(`Failed to get Curve swap quote: ${e}`);
      }
    }
  );

  // ── Swap Build ─────────────────────────────────────────────────────
  server.tool(
    "curve_swap_build",
    "Build a swap transaction on a specific Curve pool. NOTE: For general token swaps, PREFER using swap_evm_build from the swap MCP server, which aggregates across all DEXes for best prices. Use this Curve-specific swap only when: (1) swapping between stablecoins or like-kind assets where Curve excels, (2) the swap MCP server is unavailable, or (3) the user explicitly requests a Curve swap.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      pool: addressParam.describe(
        "Curve pool contract address (get from curve_get_pools)"
      ),
      tokenIn: addressParam.describe("Token to sell (must be a coin in the pool)"),
      tokenOut: addressParam.describe("Token to buy (must be a coin in the pool)"),
      amountIn: z
        .string()
        .describe("Amount to sell (human-readable units)"),
      slippageBps: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .optional()
        .default(50)
        .describe("Slippage tolerance in basis points (default: 50 = 0.5%)"),
    },
    async ({ chain, sender, pool, tokenIn, tokenOut, amountIn, slippageBps }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);
        const poolData = await getPoolByAddress(
          config.curve.apiBlockchainId,
          pool
        );

        if (!poolData) {
          return errorResult(
            `Pool ${pool} not found on ${chain}. Use curve_get_pools to discover available pools.`
          );
        }

        const i = await resolveCoinIndex(poolData.coins, tokenIn);
        const j = await resolveCoinIndex(poolData.coins, tokenOut);
        const inDecimals = Number(poolData.coins[i].decimals);
        const rawAmountIn = parseAmount(amountIn, inDecimals);
        const inSymbol = poolData.coins[i].symbol;
        const outSymbol = poolData.coins[j].symbol;

        // Get expected output
        const expectedOut = await client.readContract({
          address: pool as `0x${string}`,
          abi: poolViewAbi,
          functionName: "get_dy",
          args: [BigInt(i), BigInt(j), rawAmountIn],
        });

        // Apply slippage
        const minDy =
          (expectedOut * BigInt(10000 - slippageBps)) / 10000n;

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Build approval for tokenIn to the pool
        const approval = await buildApprovalIfNeeded(
          chain,
          tokenIn as `0x${string}`,
          sender as `0x${string}`,
          pool as `0x${string}`,
          rawAmountIn,
          inSymbol
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        // Build the exchange call
        const data = encodeFunctionData({
          abi: poolViewAbi,
          functionName: "exchange",
          args: [BigInt(i), BigInt(j), rawAmountIn, minDy],
        });

        const outDecimals = Number(poolData.coins[j].decimals);
        transactions.push({
          step: stepNum,
          type: "action",
          description: `Swap ${amountIn} ${inSymbol} for ~${formatAmount(expectedOut, outDecimals)} ${outSymbol} on Curve ${poolData.name}`,
          to: pool,
          data,
          value: "0",
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions,
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build Curve swap transaction: ${e}`);
      }
    }
  );
}
