import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPublicClient } from "../clients.js";
import { CONVEX_CONTRACTS, CHAIN_ID } from "../config/contracts.js";
import { boosterAbi } from "../abis/booster.js";
import { baseRewardPoolAbi } from "../abis/base-reward-pool.js";
import { erc20Abi } from "../abis/erc20.js";
import { getPools, getPoolByPid, getPoolRewardInfo, getLpTokenSymbol } from "../api/convex.js";
import { formatAmount, jsonResult, errorResult } from "../utils.js";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerPoolTools(server: McpServer) {
  // ── List Pools ────────────────────────────────────────────────────
  server.tool(
    "convex_get_pools",
    "List all Convex Finance pools. Each pool wraps a Curve gauge — depositing Curve LP tokens earns boosted CRV + CVX rewards without needing your own veCRV. Returns pool ID, LP token, reward contract, and status. Use convex_get_pool_info for detailed reward data.",
    {
      includeShutdown: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include shutdown/deprecated pools (default: false)"),
      limit: z
        .number()
        .int()
        .optional()
        .default(50)
        .describe("Max number of pools to return (default: 50, 0 = all)"),
      offset: z
        .number()
        .int()
        .optional()
        .default(0)
        .describe("Pool ID offset to start from (for pagination)"),
    },
    async ({ includeShutdown, limit, offset }) => {
      try {
        let pools = await getPools();

        if (!includeShutdown) {
          pools = pools.filter((p) => !p.shutdown);
        }

        // Apply pagination
        pools = pools.slice(offset, limit > 0 ? offset + limit : undefined);

        // Batch-resolve LP token symbols
        const symbolPromises = pools.map((p) =>
          getLpTokenSymbol(p.lpToken as `0x${string}`).catch(() => "UNKNOWN")
        );
        const symbols = await Promise.all(symbolPromises);

        return jsonResult({
          totalPools: pools.length,
          pools: pools.map((p, i) => ({
            pid: p.pid,
            lpToken: p.lpToken,
            lpTokenSymbol: symbols[i],
            depositToken: p.depositToken,
            gauge: p.gauge,
            crvRewards: p.crvRewards,
            shutdown: p.shutdown,
          })),
        });
      } catch (e) {
        return errorResult(`Failed to fetch Convex pools: ${e}`);
      }
    }
  );

  // ── Pool Info ─────────────────────────────────────────────────────
  server.tool(
    "convex_get_pool_info",
    "Get detailed info for a specific Convex pool by pool ID: LP token, reward contract, total staked, reward rate, extra reward tokens, and shutdown status. Use pool IDs from convex_get_pools.",
    {
      pid: z.number().int().min(0).describe("Convex pool ID"),
    },
    async ({ pid }) => {
      try {
        const pool = await getPoolByPid(pid);
        if (!pool) {
          return errorResult(
            `Pool ${pid} not found. Use convex_get_pools to list available pools.`
          );
        }

        const client = getPublicClient();

        // Get reward info and LP token details in parallel
        const [rewardInfo, lpSymbol, lpDecimals] = await Promise.all([
          getPoolRewardInfo(pool.crvRewards as `0x${string}`),
          getLpTokenSymbol(pool.lpToken as `0x${string}`),
          client.readContract({
            address: pool.lpToken as `0x${string}`,
            abi: erc20Abi,
            functionName: "decimals",
          }).catch(() => 18),
        ]);

        // Resolve extra reward token symbols
        const extraRewardDetails = await Promise.all(
          rewardInfo.extraRewards.map(async (er) => {
            const symbol = await client
              .readContract({
                address: er.rewardToken as `0x${string}`,
                abi: erc20Abi,
                functionName: "symbol",
              })
              .catch(() => "UNKNOWN");
            return {
              rewardPool: er.address,
              rewardToken: er.rewardToken,
              symbol,
            };
          })
        );

        const isActive =
          Number(rewardInfo.periodFinish) > Math.floor(Date.now() / 1000);

        return jsonResult({
          pid,
          lpToken: pool.lpToken,
          lpTokenSymbol: lpSymbol,
          depositToken: pool.depositToken,
          gauge: pool.gauge,
          crvRewards: pool.crvRewards,
          shutdown: pool.shutdown,
          totalStaked: formatAmount(rewardInfo.totalSupply as bigint, Number(lpDecimals)),
          rewardToken: rewardInfo.rewardToken,
          rewardRate: (rewardInfo.rewardRate as bigint).toString(),
          periodFinish: new Date(
            Number(rewardInfo.periodFinish) * 1000
          ).toISOString(),
          isActive,
          extraRewards: extraRewardDetails,
        });
      } catch (e) {
        return errorResult(`Failed to get pool info: ${e}`);
      }
    }
  );

  // ── User Positions ────────────────────────────────────────────────
  server.tool(
    "convex_get_user_positions",
    "Get a user's Convex Finance positions: staked deposit tokens in each pool's reward contract, pending CRV rewards, and extra reward tokens. Scans active pools for non-zero balances.",
    {
      user: addressParam.describe("User wallet address"),
    },
    async ({ user }) => {
      try {
        const client = getPublicClient();
        let pools = await getPools();

        // Only check active (non-shutdown) pools
        pools = pools.filter((p) => !p.shutdown);

        const positions: Array<{
          pid: number;
          lpToken: string;
          lpTokenSymbol: string;
          stakedBalance: string;
          earnedCrv: string;
          extraRewards: Array<{ token: string; symbol: string; earned: string }>;
        }> = [];

        // Batch check balances and earned rewards
        const checks = pools.map(async (p) => {
          try {
            const [staked, earned] = await Promise.all([
              client.readContract({
                address: p.crvRewards as `0x${string}`,
                abi: baseRewardPoolAbi,
                functionName: "balanceOf",
                args: [user as `0x${string}`],
              }),
              client.readContract({
                address: p.crvRewards as `0x${string}`,
                abi: baseRewardPoolAbi,
                functionName: "earned",
                args: [user as `0x${string}`],
              }),
            ]);

            if ((staked as bigint) === 0n) return null;

            // Get LP token symbol
            const lpSymbol = await getLpTokenSymbol(
              p.lpToken as `0x${string}`
            );

            // Check extra rewards
            let extraRewardsCount = 0;
            try {
              const count = await client.readContract({
                address: p.crvRewards as `0x${string}`,
                abi: baseRewardPoolAbi,
                functionName: "extraRewardsLength",
              });
              extraRewardsCount = Number(count);
            } catch {
              // Skip
            }

            const extraRewards: Array<{
              token: string;
              symbol: string;
              earned: string;
            }> = [];
            for (let i = 0; i < extraRewardsCount; i++) {
              try {
                const extraAddr = await client.readContract({
                  address: p.crvRewards as `0x${string}`,
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

            return {
              pid: p.pid,
              lpToken: p.lpToken,
              lpTokenSymbol: lpSymbol,
              stakedBalance: formatAmount(staked as bigint, 18),
              earnedCrv: formatAmount(earned as bigint, 18),
              extraRewards,
            };
          } catch {
            return null;
          }
        });

        const results = await Promise.all(checks);
        for (const r of results) {
          if (r) positions.push(r);
        }

        return jsonResult({
          user,
          positionCount: positions.length,
          positions,
        });
      } catch (e) {
        return errorResult(`Failed to get user positions: ${e}`);
      }
    }
  );
}
