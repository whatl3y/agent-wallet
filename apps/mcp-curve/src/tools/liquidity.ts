import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getPublicClient } from "../clients.js";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { getPoolByAddress } from "../api/curve.js";
import { getPoolAbiForCoinCount } from "../abis/pool.js";
import {
  parseAmount,
  formatAmount,
  getTokenDecimals,
  getTokenBalance,
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

export function registerLiquidityTools(server: McpServer) {
  // ── Add Liquidity ──────────────────────────────────────────────────
  server.tool(
    "curve_add_liquidity",
    'Build transaction(s) to deposit tokens into a Curve Finance liquidity pool and receive LP tokens. This is the primary way to earn yield on Curve. Supports depositing one or more tokens (single-sided or balanced). Returns approval + deposit calldata. Use curve_get_pool_info to find pool addresses and coin details.',
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      pool: addressParam.describe(
        "Curve pool contract address (get from curve_get_pools)"
      ),
      amounts: z
        .array(z.string())
        .min(1)
        .describe(
          "Amounts for each coin in pool order (human-readable units, use '0' for coins you don't want to deposit). E.g. for a 3-coin pool: ['1000', '0', '500']. Order matches coins in curve_get_pool_info."
        ),
      minMintAmount: z
        .string()
        .optional()
        .default("0")
        .describe(
          "Minimum LP tokens to receive (slippage protection, human-readable with 18 decimals). Use curve_calc_token_amount to estimate."
        ),
    },
    async ({ chain, sender, pool, amounts, minMintAmount }) => {
      try {
        const config = getChainConfig(chain);
        const poolData = await getPoolByAddress(
          config.curve.apiBlockchainId,
          pool
        );

        if (!poolData) {
          return errorResult(
            `Pool ${pool} not found on ${chain}. Use curve_get_pools to discover available pools.`
          );
        }

        const coinCount = poolData.coins.length;
        if (amounts.length !== coinCount) {
          return errorResult(
            `Expected ${coinCount} amounts for this pool (has ${coinCount} coins), but got ${amounts.length}. Use '0' for coins you don't want to deposit.`
          );
        }

        const poolAbi = getPoolAbiForCoinCount(coinCount);
        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Parse amounts and build approvals for non-zero deposits
        const rawAmounts: bigint[] = [];
        for (let i = 0; i < coinCount; i++) {
          const coin = poolData.coins[i];
          const decimals = Number(coin.decimals);
          const rawAmount = parseAmount(amounts[i], decimals);
          rawAmounts.push(rawAmount);

          if (rawAmount > 0n) {
            const approval = await buildApprovalIfNeeded(
              chain,
              coin.address as `0x${string}`,
              sender as `0x${string}`,
              pool as `0x${string}`,
              rawAmount,
              coin.symbol
            );
            if (approval) {
              approval.step = stepNum++;
              transactions.push(approval);
            }
          }
        }

        // Build the add_liquidity call
        const minMint = parseAmount(minMintAmount, 18);
        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "add_liquidity",
          args: [rawAmounts, minMint] as any,
        });

        const depositDescription = amounts
          .map((amt, i) => {
            if (amt === "0") return null;
            return `${amt} ${poolData.coins[i].symbol}`;
          })
          .filter(Boolean)
          .join(" + ");

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Add liquidity to Curve ${poolData.name}: ${depositDescription}`,
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
        return errorResult(`Failed to build add_liquidity transaction: ${e}`);
      }
    }
  );

  // ── Remove Liquidity (balanced) ────────────────────────────────────
  server.tool(
    "curve_remove_liquidity",
    'Build transaction to withdraw tokens from a Curve pool by burning LP tokens. Returns all coins proportionally (balanced withdrawal). Use curve_remove_liquidity_one_coin for single-sided withdrawal. Use amount "max" to withdraw entire balance.',
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      pool: addressParam.describe("Curve pool contract address"),
      amount: z
        .string()
        .describe(
          'Amount of LP tokens to burn (human-readable, 18 decimals) or "max" for entire balance'
        ),
      minAmounts: z
        .array(z.string())
        .optional()
        .describe(
          "Minimum amounts for each coin (slippage protection, human-readable). Defaults to ['0', '0', ...] if not specified."
        ),
    },
    async ({ chain, sender, pool, amount, minAmounts }) => {
      try {
        const config = getChainConfig(chain);
        const poolData = await getPoolByAddress(
          config.curve.apiBlockchainId,
          pool
        );

        if (!poolData) {
          return errorResult(
            `Pool ${pool} not found on ${chain}. Use curve_get_pools to discover available pools.`
          );
        }

        const coinCount = poolData.coins.length;
        const poolAbi = getPoolAbiForCoinCount(coinCount);

        // Resolve "max" to actual LP token balance
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await getTokenBalance(
            chain,
            poolData.lpTokenAddress as `0x${string}`,
            sender as `0x${string}`
          );
          if (rawAmount === 0n) {
            return errorResult(
              "No LP tokens found in wallet. They may be staked in a gauge — use curve_unstake_lp first."
            );
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        // Build min amounts array
        const rawMinAmounts: bigint[] = [];
        for (let i = 0; i < coinCount; i++) {
          const decimals = Number(poolData.coins[i].decimals);
          if (minAmounts && minAmounts[i]) {
            rawMinAmounts.push(parseAmount(minAmounts[i], decimals));
          } else {
            rawMinAmounts.push(0n);
          }
        }

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "remove_liquidity",
          args: [rawAmount, rawMinAmounts] as any,
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Remove liquidity from Curve ${poolData.name} (balanced withdrawal of ${amount === "max" ? formatAmount(rawAmount, 18) : amount} LP tokens)`,
              to: pool,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(
          `Failed to build remove_liquidity transaction: ${e}`
        );
      }
    }
  );

  // ── Remove Liquidity One Coin ──────────────────────────────────────
  server.tool(
    "curve_remove_liquidity_one_coin",
    'Build transaction to withdraw a single token from a Curve pool by burning LP tokens. More gas efficient than balanced withdrawal when you only want one asset. Use amount "max" to withdraw entire LP balance.',
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      pool: addressParam.describe("Curve pool contract address"),
      amount: z
        .string()
        .describe(
          'Amount of LP tokens to burn (human-readable, 18 decimals) or "max"'
        ),
      coinIndex: z
        .number()
        .int()
        .min(0)
        .describe(
          "Index of the coin to withdraw (0-based, matches order in curve_get_pool_info coins array)"
        ),
      minAmount: z
        .string()
        .optional()
        .default("0")
        .describe("Minimum amount of the coin to receive (slippage protection, human-readable)"),
    },
    async ({ chain, sender, pool, amount, coinIndex, minAmount }) => {
      try {
        const config = getChainConfig(chain);
        const poolData = await getPoolByAddress(
          config.curve.apiBlockchainId,
          pool
        );

        if (!poolData) {
          return errorResult(
            `Pool ${pool} not found on ${chain}. Use curve_get_pools to discover available pools.`
          );
        }

        if (coinIndex >= poolData.coins.length) {
          return errorResult(
            `Coin index ${coinIndex} out of range. Pool has ${poolData.coins.length} coins (0-${poolData.coins.length - 1}).`
          );
        }

        const poolAbi = getPoolAbiForCoinCount(poolData.coins.length);
        const coin = poolData.coins[coinIndex];
        const coinDecimals = Number(coin.decimals);

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await getTokenBalance(
            chain,
            poolData.lpTokenAddress as `0x${string}`,
            sender as `0x${string}`
          );
          if (rawAmount === 0n) {
            return errorResult(
              "No LP tokens found in wallet. They may be staked in a gauge — use curve_unstake_lp first."
            );
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        const rawMinAmount = parseAmount(minAmount, coinDecimals);

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "remove_liquidity_one_coin",
          args: [rawAmount, BigInt(coinIndex), rawMinAmount] as any,
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Remove liquidity from Curve ${poolData.name} — withdraw ${coin.symbol} (burn ${amount === "max" ? formatAmount(rawAmount, 18) : amount} LP tokens)`,
              to: pool,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(
          `Failed to build remove_liquidity_one_coin transaction: ${e}`
        );
      }
    }
  );

  // ── Calc Token Amount ──────────────────────────────────────────────
  server.tool(
    "curve_calc_token_amount",
    "Estimate the LP tokens minted or burned for a given deposit or withdrawal. Use this before curve_add_liquidity or curve_remove_liquidity to calculate expected amounts and set slippage parameters.",
    {
      chain: chainParam,
      pool: addressParam.describe("Curve pool contract address"),
      amounts: z
        .array(z.string())
        .min(1)
        .describe("Amounts for each coin in pool order (human-readable, use '0' for coins not involved)"),
      isDeposit: z
        .boolean()
        .describe("true for deposit estimate, false for withdrawal estimate"),
    },
    async ({ chain, pool, amounts, isDeposit }) => {
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

        const coinCount = poolData.coins.length;
        if (amounts.length !== coinCount) {
          return errorResult(
            `Expected ${coinCount} amounts but got ${amounts.length}.`
          );
        }

        const poolAbi = getPoolAbiForCoinCount(coinCount);

        // Parse amounts using each coin's decimals
        const rawAmounts: bigint[] = [];
        for (let i = 0; i < coinCount; i++) {
          const decimals = Number(poolData.coins[i].decimals);
          rawAmounts.push(parseAmount(amounts[i], decimals));
        }

        const estimated = await client.readContract({
          address: pool as `0x${string}`,
          abi: poolAbi,
          functionName: "calc_token_amount",
          args: [rawAmounts, isDeposit] as any,
        });

        return jsonResult({
          chain,
          pool: poolData.address,
          name: poolData.name,
          isDeposit,
          estimatedLpTokens: formatAmount(estimated as bigint, 18),
          estimatedLpTokensRaw: (estimated as bigint).toString(),
          hint: isDeposit
            ? "Use a value slightly lower than estimatedLpTokens as minMintAmount in curve_add_liquidity for slippage protection (e.g. 99% of this value)."
            : "This is the estimated LP tokens that would be burned for this withdrawal.",
        });
      } catch (e) {
        return errorResult(`Failed to estimate token amount: ${e}`);
      }
    }
  );
}
