import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getPublicClient } from "../clients.js";
import { CONVEX_CONTRACTS, CHAIN_ID } from "../config/contracts.js";
import { boosterAbi } from "../abis/booster.js";
import { baseRewardPoolAbi } from "../abis/base-reward-pool.js";
import { erc20Abi } from "../abis/erc20.js";
import { getPoolByPid } from "../api/convex.js";
import { formatAmount, jsonResult, errorResult, type TransactionPayload } from "../utils.js";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerRewardTools(server: McpServer) {
  // ── Claim Rewards ─────────────────────────────────────────────────
  server.tool(
    "convex_claim_rewards",
    "Build transaction to claim all pending CRV + CVX + extra reward tokens from a Convex pool's reward contract. The caller receives CRV, CVX (if still minting), and any bonus reward tokens.",
    {
      sender: addressParam.describe("Address that will send the transaction"),
      pid: z.number().int().min(0).describe("Convex pool ID"),
    },
    async ({ sender, pid }) => {
      try {
        const pool = await getPoolByPid(pid);
        if (!pool) {
          return errorResult(
            `Pool ${pid} not found. Use convex_get_pools to list available pools.`
          );
        }

        const data = encodeFunctionData({
          abi: baseRewardPoolAbi,
          functionName: "getReward(address,bool)",
          args: [sender as `0x${string}`, true],
        });

        const payload: TransactionPayload = {
          chainId: CHAIN_ID,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Claim all pending rewards (CRV + extras) from Convex pool ${pid}`,
              to: pool.crvRewards,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build claim rewards transaction: ${e}`);
      }
    }
  );

  // ── Get Claimable Rewards ─────────────────────────────────────────
  server.tool(
    "convex_get_claimable_rewards",
    "Check how much CRV and extra reward tokens are pending for a user in a Convex pool's reward contract.",
    {
      user: addressParam.describe("User wallet address"),
      pid: z.number().int().min(0).describe("Convex pool ID"),
    },
    async ({ user, pid }) => {
      try {
        const pool = await getPoolByPid(pid);
        if (!pool) {
          return errorResult(
            `Pool ${pid} not found. Use convex_get_pools to list available pools.`
          );
        }

        const client = getPublicClient();

        // Get staked balance and earned CRV
        const [staked, earnedCrv] = await Promise.all([
          client.readContract({
            address: pool.crvRewards as `0x${string}`,
            abi: baseRewardPoolAbi,
            functionName: "balanceOf",
            args: [user as `0x${string}`],
          }),
          client.readContract({
            address: pool.crvRewards as `0x${string}`,
            abi: baseRewardPoolAbi,
            functionName: "earned",
            args: [user as `0x${string}`],
          }),
        ]);

        // Check extra rewards
        let extraCount = 0;
        try {
          const count = await client.readContract({
            address: pool.crvRewards as `0x${string}`,
            abi: baseRewardPoolAbi,
            functionName: "extraRewardsLength",
          });
          extraCount = Number(count);
        } catch {
          // Older pools may not support this
        }

        const extraRewards: Array<{
          token: string;
          symbol: string;
          earned: string;
        }> = [];

        for (let i = 0; i < extraCount; i++) {
          try {
            const extraAddr = await client.readContract({
              address: pool.crvRewards as `0x${string}`,
              abi: baseRewardPoolAbi,
              functionName: "extraRewards",
              args: [BigInt(i)],
            });
            const [extraToken, extraEarned] = await Promise.all([
              client.readContract({
                address: extraAddr as `0x${string}`,
                abi: baseRewardPoolAbi,
                functionName: "rewardToken",
              }),
              client.readContract({
                address: extraAddr as `0x${string}`,
                abi: baseRewardPoolAbi,
                functionName: "earned",
                args: [user as `0x${string}`],
              }),
            ]);
            const symbol = await client
              .readContract({
                address: extraToken as `0x${string}`,
                abi: erc20Abi,
                functionName: "symbol",
              })
              .catch(() => "UNKNOWN");
            extraRewards.push({
              token: extraToken as string,
              symbol: symbol as string,
              earned: formatAmount(extraEarned as bigint, 18),
            });
          } catch {
            // Skip
          }
        }

        return jsonResult({
          user,
          pid,
          crvRewards: pool.crvRewards,
          stakedBalance: formatAmount(staked as bigint, 18),
          earnedCrv: formatAmount(earnedCrv as bigint, 18),
          extraRewards,
          hint: "CVX is fully minted (100M supply reached). New CRV claims no longer produce CVX minting rewards.",
        });
      } catch (e) {
        return errorResult(`Failed to get claimable rewards: ${e}`);
      }
    }
  );

  // ── Earmark Rewards ───────────────────────────────────────────────
  server.tool(
    "convex_earmark_rewards",
    "Build transaction to harvest CRV rewards from the Curve gauge for a Convex pool and distribute them to stakers. Anyone can call this — the caller earns a small incentive fee. This updates the reward rate for the pool.",
    {
      pid: z.number().int().min(0).describe("Convex pool ID to earmark"),
    },
    async ({ pid }) => {
      try {
        const pool = await getPoolByPid(pid);
        if (!pool) {
          return errorResult(
            `Pool ${pid} not found. Use convex_get_pools to list available pools.`
          );
        }

        const data = encodeFunctionData({
          abi: boosterAbi,
          functionName: "earmarkRewards",
          args: [BigInt(pid)],
        });

        const payload: TransactionPayload = {
          chainId: CHAIN_ID,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Earmark (harvest) CRV rewards for Convex pool ${pid} from Curve gauge`,
              to: CONVEX_CONTRACTS.booster,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build earmark transaction: ${e}`);
      }
    }
  );
}
