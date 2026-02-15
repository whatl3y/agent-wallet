import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SUPPORTED_CHAINS } from "./config/chains.js";

export function registerPrompts(server: McpServer) {
  // ── Analyze Positions ─────────────────────────────────────────────
  server.prompt(
    "analyze-curve-positions",
    "Analyze a user's Curve Finance LP positions, rewards, and yield across a chain",
    {
      chain: z
        .enum(SUPPORTED_CHAINS as [string, ...string[]])
        .describe("Chain to analyze"),
      user: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe("User wallet address"),
    },
    ({ chain, user }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Please analyze my Curve Finance positions on ${chain}. My wallet address is ${user}.

Steps:
1. Use curve_get_user_positions to find all my active positions.
2. For each position with staked LP tokens, use curve_get_claimable_rewards to check pending rewards.
3. Use curve_get_pool_apy to check current APYs for each pool I'm in.
4. Provide a summary including:
   - Total USD value across all positions
   - Breakdown by pool (staked vs unstaked LP, USD value)
   - Pending rewards to claim
   - Current APYs and whether positions are optimally staked
   - Any recommendations (e.g. unstaked LP that should be staked, rewards to claim)`,
          },
        },
      ],
    })
  );

  // ── Find Best Yield ───────────────────────────────────────────────
  server.prompt(
    "find-best-curve-yield",
    "Find the best Curve pool yields for a given asset type across chains",
    {
      assetType: z
        .enum(["usd", "eth", "btc", "crypto"])
        .describe("Asset type to find yields for"),
    },
    ({ assetType }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Find the best Curve Finance yield opportunities for ${assetType} pools.

Steps:
1. Use curve_get_pools on each supported chain (ethereum, polygon, arbitrum, optimism, base, avalanche) filtered by assetType="${assetType}" with minTvlUsd=100000.
2. For the top pools by APY on each chain, use curve_get_pool_apy to get detailed APY breakdowns.
3. Compare across all chains and present:
   - Top 10 pools ranked by total APY (base + CRV + extra rewards)
   - For each: chain, pool name, TVL, base APY, CRV APY range, extra rewards, total APY
   - Note which require veCRV boost for max APY
   - Highlight any pools with unusually high APY that might indicate low liquidity or risk`,
          },
        },
      ],
    })
  );
}
