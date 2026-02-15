import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getPublicClient } from "../clients.js";
import { CONVEX_CONTRACTS, CHAIN_ID } from "../config/contracts.js";
import { boosterAbi } from "../abis/booster.js";
import { baseRewardPoolAbi } from "../abis/base-reward-pool.js";
import { getPoolByPid, getPoolByLpToken } from "../api/convex.js";
import {
  parseAmount,
  formatAmount,
  getTokenBalance,
  buildApprovalIfNeeded,
  jsonResult,
  errorResult,
  type TransactionStep,
  type TransactionPayload,
} from "../utils.js";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerDepositTools(server: McpServer) {
  // ── Deposit ────────────────────────────────────────────────────────
  server.tool(
    "convex_deposit",
    'Build transaction(s) to deposit Curve LP tokens into Convex Finance via the Booster contract. Depositing through Convex auto-stakes in the gauge to earn boosted CRV + CVX rewards. Set stake=true (default) to auto-stake in the reward contract for immediate reward accrual. Requires approval of LP tokens to the Booster.',
    {
      sender: addressParam.describe("Address that will send the transaction"),
      pid: z.number().int().min(0).describe("Convex pool ID (get from convex_get_pools)"),
      amount: z
        .string()
        .describe(
          'Amount of Curve LP tokens to deposit (human-readable, 18 decimals) or "max" for entire balance'
        ),
      stake: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Auto-stake deposit tokens in the reward contract (default: true, highly recommended)"
        ),
    },
    async ({ sender, pid, amount, stake }) => {
      try {
        const pool = await getPoolByPid(pid);
        if (!pool) {
          return errorResult(
            `Pool ${pid} not found. Use convex_get_pools to list available pools.`
          );
        }
        if (pool.shutdown) {
          return errorResult(
            `Pool ${pid} is shut down and no longer accepting deposits.`
          );
        }

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await getTokenBalance(
            pool.lpToken as `0x${string}`,
            sender as `0x${string}`
          );
          if (rawAmount === 0n) {
            return errorResult(
              "No Curve LP tokens found in wallet for this pool."
            );
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        // Build approval for LP token to Booster
        const approval = await buildApprovalIfNeeded(
          pool.lpToken as `0x${string}`,
          sender as `0x${string}`,
          CONVEX_CONTRACTS.booster,
          rawAmount,
          "Curve LP Token"
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        // Build Booster.deposit call
        const data = encodeFunctionData({
          abi: boosterAbi,
          functionName: "deposit",
          args: [BigInt(pid), rawAmount, stake],
        });

        const displayAmount =
          amount.toLowerCase() === "max"
            ? formatAmount(rawAmount, 18)
            : amount;

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Deposit ${displayAmount} Curve LP tokens into Convex pool ${pid}${stake ? " (auto-staked for rewards)" : ""}`,
          to: CONVEX_CONTRACTS.booster,
          data,
          value: "0",
        });

        const payload: TransactionPayload = {
          chainId: CHAIN_ID,
          transactions,
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build deposit transaction: ${e}`);
      }
    }
  );

  // ── Withdraw ──────────────────────────────────────────────────────
  server.tool(
    "convex_withdraw",
    'Build transaction to withdraw Curve LP tokens from Convex. If tokens are staked in the reward contract, use convex_unstake_and_withdraw instead, or first use convex_unstake then this. This withdraws unwrapped deposit tokens back to Curve LP tokens via the Booster.',
    {
      sender: addressParam.describe("Address that will send the transaction"),
      pid: z.number().int().min(0).describe("Convex pool ID"),
      amount: z
        .string()
        .describe(
          'Amount of deposit tokens to withdraw (human-readable, 18 decimals) or "max"'
        ),
    },
    async ({ sender, pid, amount }) => {
      try {
        const pool = await getPoolByPid(pid);
        if (!pool) {
          return errorResult(
            `Pool ${pid} not found. Use convex_get_pools to list available pools.`
          );
        }

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await getTokenBalance(
            pool.depositToken as `0x${string}`,
            sender as `0x${string}`
          );
          if (rawAmount === 0n) {
            return errorResult(
              "No Convex deposit tokens found in wallet. They may be staked in the reward contract — use convex_unstake_and_withdraw instead."
            );
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        const data = encodeFunctionData({
          abi: boosterAbi,
          functionName: "withdraw",
          args: [BigInt(pid), rawAmount],
        });

        const displayAmount =
          amount.toLowerCase() === "max"
            ? formatAmount(rawAmount, 18)
            : amount;

        const payload: TransactionPayload = {
          chainId: CHAIN_ID,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Withdraw ${displayAmount} Curve LP tokens from Convex pool ${pid}`,
              to: CONVEX_CONTRACTS.booster,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build withdraw transaction: ${e}`);
      }
    }
  );

  // ── Unstake and Withdraw ──────────────────────────────────────────
  server.tool(
    "convex_unstake_and_withdraw",
    'Build transaction to unstake from the reward contract AND withdraw Curve LP tokens from Convex in a single call. This calls withdrawAndUnwrap on the BaseRewardPool, which unstakes, unwraps to Curve LP tokens, and optionally claims pending rewards — all in one transaction.',
    {
      sender: addressParam.describe("Address that will send the transaction"),
      pid: z.number().int().min(0).describe("Convex pool ID"),
      amount: z
        .string()
        .describe(
          'Amount to unstake and withdraw (human-readable, 18 decimals) or "max"'
        ),
      claimRewards: z
        .boolean()
        .optional()
        .default(true)
        .describe("Also claim pending CRV + extra rewards (default: true)"),
    },
    async ({ sender, pid, amount, claimRewards }) => {
      try {
        const pool = await getPoolByPid(pid);
        if (!pool) {
          return errorResult(
            `Pool ${pid} not found. Use convex_get_pools to list available pools.`
          );
        }

        const client = getPublicClient();

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await client.readContract({
            address: pool.crvRewards as `0x${string}`,
            abi: baseRewardPoolAbi,
            functionName: "balanceOf",
            args: [sender as `0x${string}`],
          }) as bigint;
          if (rawAmount === 0n) {
            return errorResult(
              "No staked tokens found in this pool's reward contract."
            );
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        const data = encodeFunctionData({
          abi: baseRewardPoolAbi,
          functionName: "withdrawAndUnwrap",
          args: [rawAmount, claimRewards],
        });

        const displayAmount =
          amount.toLowerCase() === "max"
            ? formatAmount(rawAmount, 18)
            : amount;

        const payload: TransactionPayload = {
          chainId: CHAIN_ID,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Unstake & withdraw ${displayAmount} Curve LP tokens from Convex pool ${pid}${claimRewards ? " (claiming rewards)" : ""}`,
              to: pool.crvRewards,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(
          `Failed to build unstake-and-withdraw transaction: ${e}`
        );
      }
    }
  );
}
