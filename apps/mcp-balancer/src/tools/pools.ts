import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPublicClient } from "../clients.js";
import { getChainConfig, SUPPORTED_CHAINS, API_CHAIN_NAMES } from "../config/chains.js";
import { getPools, getPool } from "../api/balancer.js";
import { erc20Abi } from "../abis/erc20.js";
import { formatAmount, jsonResult, errorResult } from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Chain to query (ethereum, arbitrum, base, optimism, avalanche)");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerPoolTools(server: McpServer) {
  // ── List Pools ───────────────────────────────────────────────────────
  server.tool(
    "balancer_get_pools",
    "List Balancer V3 liquidity pools on a chain. Returns pool name, address, type, TVL, volume, fees, swap fee, tokens, and APR breakdown. Use this to discover pools for providing liquidity, swapping, or to find yield opportunities.",
    {
      chain: chainParam,
      minTvlUsd: z
        .number()
        .optional()
        .default(10000)
        .describe("Minimum TVL in USD to filter small/empty pools (default: 10000)"),
      poolType: z
        .string()
        .optional()
        .describe(
          'Filter by pool type: "WEIGHTED", "STABLE", "GYRO", "GYROE", "LBP", "FX", "COMPOSABLE_STABLE"'
        ),
    },
    async ({ chain, minTvlUsd, poolType }) => {
      try {
        const apiChain = API_CHAIN_NAMES[chain];
        if (!apiChain) {
          return errorResult(`Chain ${chain} not supported by Balancer API`);
        }

        let pools = await getPools(apiChain, { minTvl: minTvlUsd, poolType });

        // Filter by TVL client-side for precision
        pools = pools.filter(
          (p) => Number(p.dynamicData.totalLiquidity) >= minTvlUsd
        );

        return jsonResult({
          chain,
          poolCount: pools.length,
          pools: pools.map((p) => ({
            name: p.name,
            address: p.address,
            id: p.id,
            type: p.type,
            tvlUsd: Number(p.dynamicData.totalLiquidity).toFixed(2),
            volume24h: Number(p.dynamicData.volume24h).toFixed(2),
            fees24h: Number(p.dynamicData.fees24h).toFixed(2),
            swapFee: `${(Number(p.dynamicData.swapFee) * 100).toFixed(4)}%`,
            totalApr: `${(p.dynamicData.aprItems.reduce((sum, item) => sum + item.apr, 0) * 100).toFixed(2)}%`,
            tokens: p.poolTokens.map((t) => ({
              symbol: t.symbol,
              address: t.address,
              decimals: t.decimals,
              weight: t.weight
                ? `${(Number(t.weight) * 100).toFixed(1)}%`
                : null,
              balanceUsd: Number(t.balanceUSD).toFixed(2),
            })),
          })),
        });
      } catch (e) {
        return errorResult(`Failed to fetch Balancer pools: ${e}`);
      }
    }
  );

  // ── Pool Info ────────────────────────────────────────────────────────
  server.tool(
    "balancer_get_pool_info",
    "Get detailed info for a specific Balancer V3 pool: TVL, APR breakdown, tokens with balances/prices/weights, swap fee, volume, and pool type. Use the pool address from balancer_get_pools.",
    {
      chain: chainParam,
      pool: addressParam.describe(
        "Pool contract address (get from balancer_get_pools)"
      ),
    },
    async ({ chain, pool }) => {
      try {
        const apiChain = API_CHAIN_NAMES[chain];
        if (!apiChain) {
          return errorResult(`Chain ${chain} not supported by Balancer API`);
        }

        const poolData = await getPool(apiChain, pool.toLowerCase());

        if (!poolData) {
          return errorResult(
            `Pool ${pool} not found on ${chain}. Use balancer_get_pools to discover available pools.`
          );
        }

        return jsonResult({
          chain,
          name: poolData.name,
          address: poolData.address,
          id: poolData.id,
          type: poolData.type,
          protocolVersion: poolData.protocolVersion,
          tvlUsd: Number(poolData.dynamicData.totalLiquidity).toFixed(2),
          volume24h: Number(poolData.dynamicData.volume24h).toFixed(2),
          fees24h: Number(poolData.dynamicData.fees24h).toFixed(2),
          swapFee: `${(Number(poolData.dynamicData.swapFee) * 100).toFixed(4)}%`,
          apr: {
            total: `${(poolData.dynamicData.aprItems.reduce((sum, item) => sum + item.apr, 0) * 100).toFixed(2)}%`,
            breakdown: poolData.dynamicData.aprItems.map((item) => ({
              type: item.type,
              rewardToken: item.rewardTokenSymbol,
              apr: `${(item.apr * 100).toFixed(2)}%`,
            })),
          },
          tokens: poolData.poolTokens.map((t) => ({
            symbol: t.symbol,
            name: t.name,
            address: t.address,
            decimals: t.decimals,
            weight: t.weight
              ? `${(Number(t.weight) * 100).toFixed(1)}%`
              : null,
            balance: t.balance,
            balanceUsd: Number(t.balanceUSD).toFixed(2),
            priceRate: t.priceRate,
          })),
        });
      } catch (e) {
        return errorResult(`Failed to get pool info: ${e}`);
      }
    }
  );

  // ── User Positions ───────────────────────────────────────────────────
  server.tool(
    "balancer_get_user_positions",
    "Get a user's Balancer V3 positions: BPT (Balancer Pool Token) balances across pools with estimated USD values. Checks the user's BPT token balances for the top pools on the chain.",
    {
      chain: chainParam,
      user: addressParam.describe("User wallet address"),
    },
    async ({ chain, user }) => {
      try {
        const apiChain = API_CHAIN_NAMES[chain];
        if (!apiChain) {
          return errorResult(`Chain ${chain} not supported by Balancer API`);
        }

        const client = getPublicClient(chain);
        const pools = await getPools(apiChain, { minTvl: 1000 });

        const positions: Array<{
          poolName: string;
          poolAddress: string;
          poolType: string;
          bptBalance: string;
          estimatedUsdValue: string;
          tokens: Array<{ symbol: string; address: string }>;
        }> = [];

        // Check BPT balances in parallel — pool address is the BPT token in Balancer V3
        const checks = pools.map(async (p) => {
          try {
            const bptBalance = await client.readContract({
              address: p.address as `0x${string}`,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [user as `0x${string}`],
            });

            if (bptBalance === 0n) return null;

            // Estimate USD value: BPT balance / total supply * TVL
            let estimatedUsd = 0;
            try {
              const totalSupply = await client.readContract({
                address: p.address as `0x${string}`,
                abi: erc20Abi,
                functionName: "totalSupply",
              });
              if (totalSupply > 0n) {
                const tvl = Number(p.dynamicData.totalLiquidity);
                estimatedUsd =
                  (Number(formatAmount(bptBalance, 18)) /
                    Number(formatAmount(totalSupply, 18))) *
                  tvl;
              }
            } catch {
              // If totalSupply fails, skip USD estimation
            }

            return {
              poolName: p.name,
              poolAddress: p.address,
              poolType: p.type,
              bptBalance: formatAmount(bptBalance, 18),
              estimatedUsdValue: estimatedUsd.toFixed(2),
              tokens: p.poolTokens.map((t) => ({
                symbol: t.symbol,
                address: t.address,
              })),
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
          chain,
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
