import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPublicClient } from "../clients.js";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { getPools, getPoolByAddress, getBaseApys } from "../api/curve.js";
import { erc20Abi } from "../abis/erc20.js";
import { gaugeAbi } from "../abis/gauge.js";
import { poolViewAbi } from "../abis/pool.js";
import { formatAmount, jsonResult, errorResult } from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Chain to query (ethereum, polygon, arbitrum, optimism, base, avalanche)");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerQueryTools(server: McpServer) {
  // ── List Pools ───────────────────────────────────────────────────────
  server.tool(
    "curve_get_pools",
    "List all Curve Finance liquidity pools on a chain. Returns pool name, address, LP token, gauge, TVL, tokens, and CRV APY. Use this to discover pools for providing liquidity or to find the best yield opportunities.",
    {
      chain: chainParam,
      minTvlUsd: z
        .number()
        .optional()
        .default(10000)
        .describe("Minimum TVL in USD to filter small/empty pools (default: 10000)"),
      assetType: z
        .string()
        .optional()
        .describe(
          'Filter by asset type: "usd" for stablecoin pools, "eth" for ETH pools, "btc" for BTC pools, "crypto" for volatile pairs'
        ),
    },
    async ({ chain, minTvlUsd, assetType }) => {
      try {
        const config = getChainConfig(chain);
        let pools = await getPools(config.curve.apiBlockchainId);

        // Filter by TVL
        pools = pools.filter((p) => p.usdTotal >= minTvlUsd);

        // Filter by asset type
        if (assetType) {
          const lowerType = assetType.toLowerCase();
          pools = pools.filter(
            (p) => p.assetTypeName.toLowerCase() === lowerType
          );
        }

        // Sort by TVL descending
        pools.sort((a, b) => b.usdTotal - a.usdTotal);

        return jsonResult({
          chain,
          poolCount: pools.length,
          pools: pools.map((p) => ({
            name: p.name,
            address: p.address,
            lpTokenAddress: p.lpTokenAddress,
            gaugeAddress: p.gaugeAddress,
            tvlUsd: p.usdTotal.toFixed(2),
            assetType: p.assetTypeName,
            isMetaPool: p.isMetaPool,
            coins: p.coins.map((c) => ({
              symbol: c.symbol,
              address: c.address,
              decimals: c.decimals,
            })),
            crvApyMin: p.gaugeCrvApy?.[0] ?? null,
            crvApyMax: p.gaugeCrvApy?.[1] ?? null,
            extraRewards: p.gaugeRewards.map((r) => ({
              symbol: r.symbol,
              apy: r.apy,
            })),
          })),
        });
      } catch (e) {
        return errorResult(`Failed to fetch Curve pools: ${e}`);
      }
    }
  );

  // ── Pool Info ────────────────────────────────────────────────────────
  server.tool(
    "curve_get_pool_info",
    "Get detailed info for a specific Curve pool: TVL, APY, tokens with balances and prices, virtual price, fee, amplification coefficient, and gauge address. Use the pool address from curve_get_pools.",
    {
      chain: chainParam,
      pool: addressParam.describe("Pool contract address"),
    },
    async ({ chain, pool }) => {
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

        // Read on-chain data for additional details
        const client = getPublicClient(chain);
        let virtualPrice: string | null = null;
        let fee: string | null = null;

        try {
          const vpRaw = await client.readContract({
            address: pool as `0x${string}`,
            abi: poolViewAbi,
            functionName: "get_virtual_price",
          });
          virtualPrice = formatAmount(vpRaw, 18);
        } catch {
          virtualPrice = poolData.virtualPrice || null;
        }

        try {
          const feeRaw = await client.readContract({
            address: pool as `0x${string}`,
            abi: poolViewAbi,
            functionName: "fee",
          });
          // Curve fees are in units of 1e-10 (so 4000000 = 0.04%)
          fee = `${(Number(feeRaw) / 1e8).toFixed(4)}%`;
        } catch {
          fee = null;
        }

        return jsonResult({
          chain,
          name: poolData.name,
          address: poolData.address,
          lpTokenAddress: poolData.lpTokenAddress,
          gaugeAddress: poolData.gaugeAddress,
          tvlUsd: poolData.usdTotal.toFixed(2),
          virtualPrice,
          fee,
          amplificationCoefficient: poolData.amplificationCoefficient,
          assetType: poolData.assetTypeName,
          isMetaPool: poolData.isMetaPool,
          registryId: poolData.registryId,
          coins: poolData.coins.map((c) => ({
            symbol: c.symbol,
            address: c.address,
            decimals: c.decimals,
            usdPrice: c.usdPrice,
            poolBalance: c.poolBalance,
          })),
          crvApyMin: poolData.gaugeCrvApy?.[0] ?? null,
          crvApyMax: poolData.gaugeCrvApy?.[1] ?? null,
          extraRewards: poolData.gaugeRewards.map((r) => ({
            symbol: r.symbol,
            apy: r.apy,
            tokenAddress: r.tokenAddress,
          })),
        });
      } catch (e) {
        return errorResult(`Failed to get pool info: ${e}`);
      }
    }
  );

  // ── Pool APY ─────────────────────────────────────────────────────────
  server.tool(
    "curve_get_pool_apy",
    "Get the current APY breakdown for a Curve pool: base APY from trading fees, CRV rewards APY (min/max based on veCRV boost), and any additional reward token APYs.",
    {
      chain: chainParam,
      pool: addressParam.describe("Pool contract address"),
    },
    async ({ chain, pool }) => {
      try {
        const config = getChainConfig(chain);
        const [poolData, baseApys] = await Promise.all([
          getPoolByAddress(config.curve.apiBlockchainId, pool),
          getBaseApys(config.curve.apiBlockchainId),
        ]);

        if (!poolData) {
          return errorResult(
            `Pool ${pool} not found on ${chain}. Use curve_get_pools to discover available pools.`
          );
        }

        const baseApy = baseApys.get(pool.toLowerCase());

        const crvApyMin = poolData.gaugeCrvApy?.[0] ?? 0;
        const crvApyMax = poolData.gaugeCrvApy?.[1] ?? 0;
        const extraRewardsApy = poolData.gaugeRewards.reduce(
          (sum, r) => sum + r.apy,
          0
        );
        const baseApyDaily = baseApy?.daily ?? 0;
        const baseApyWeekly = baseApy?.weekly ?? 0;

        return jsonResult({
          chain,
          pool: poolData.address,
          name: poolData.name,
          baseApyDaily: `${baseApyDaily.toFixed(4)}%`,
          baseApyWeekly: `${baseApyWeekly.toFixed(4)}%`,
          crvApyMin: `${crvApyMin.toFixed(4)}%`,
          crvApyMax: `${crvApyMax.toFixed(4)}%`,
          extraRewardsApy: `${extraRewardsApy.toFixed(4)}%`,
          extraRewards: poolData.gaugeRewards.map((r) => ({
            symbol: r.symbol,
            apy: `${r.apy.toFixed(4)}%`,
          })),
          totalApyMin: `${(baseApyWeekly + crvApyMin + extraRewardsApy).toFixed(4)}%`,
          totalApyMax: `${(baseApyWeekly + crvApyMax + extraRewardsApy).toFixed(4)}%`,
        });
      } catch (e) {
        return errorResult(`Failed to get pool APY: ${e}`);
      }
    }
  );

  // ── User Positions ───────────────────────────────────────────────────
  server.tool(
    "curve_get_user_positions",
    "Get a user's Curve Finance positions: LP token balances (in wallet and staked in gauges), claimable CRV rewards, and estimated USD value. Checks all pools with gauges on the chain.",
    {
      chain: chainParam,
      user: addressParam.describe("User wallet address"),
    },
    async ({ chain, user }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);
        const pools = await getPools(config.curve.apiBlockchainId);

        // Only check pools with gauges that have meaningful TVL
        const poolsWithGauges = pools.filter(
          (p) => p.gaugeAddress && p.usdTotal > 0
        );

        const positions: Array<{
          poolName: string;
          poolAddress: string;
          lpTokenAddress: string;
          gaugeAddress: string;
          walletBalance: string;
          stakedBalance: string;
          totalLpBalance: string;
          estimatedUsdValue: string;
        }> = [];

        // Batch check balances — check LP token and gauge balances in parallel
        const checks = poolsWithGauges.map(async (p) => {
          try {
            const [walletBal, gaugeBal] = await Promise.all([
              client.readContract({
                address: p.lpTokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [user as `0x${string}`],
              }),
              p.gaugeAddress
                ? client.readContract({
                    address: p.gaugeAddress as `0x${string}`,
                    abi: gaugeAbi,
                    functionName: "balanceOf",
                    args: [user as `0x${string}`],
                  })
                : 0n,
            ]);

            if (walletBal === 0n && gaugeBal === 0n) return null;

            const totalLp = walletBal + gaugeBal;

            // Estimate USD value: LP tokens are 18 decimals,
            // value ≈ totalLp * virtualPrice / 1e18 * (tvl / totalSupply)
            let estimatedUsd = 0;
            if (p.totalSupply && Number(p.totalSupply) > 0) {
              estimatedUsd =
                (Number(formatAmount(totalLp, 18)) / Number(p.totalSupply)) *
                p.usdTotal;
            }

            return {
              poolName: p.name,
              poolAddress: p.address,
              lpTokenAddress: p.lpTokenAddress,
              gaugeAddress: p.gaugeAddress!,
              walletBalance: formatAmount(walletBal, 18),
              stakedBalance: formatAmount(gaugeBal, 18),
              totalLpBalance: formatAmount(totalLp, 18),
              estimatedUsdValue: estimatedUsd.toFixed(2),
            };
          } catch {
            // Skip pools where balance check fails (e.g. incompatible ABI)
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
