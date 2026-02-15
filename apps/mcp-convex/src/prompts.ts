import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  // ── Analyze Convex Positions ────────────────────────────────────────
  server.prompt(
    "analyze-convex-positions",
    "Analyze a user's complete Convex Finance portfolio: pool deposits, CVX staking, cvxCRV staking, and vlCVX locks",
    {
      user: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe("User wallet address"),
    },
    ({ user }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Please analyze my complete Convex Finance portfolio. My wallet address is ${user}.

Steps:
1. Use convex_get_user_positions to find all my active pool deposits and pending rewards.
2. Use convex_get_cvx_staking_info to check my CVX staking position.
3. Use convex_get_cvxcrv_staking_info to check my cvxCRV staking position.
4. Use convex_get_vlcvx_info to check my vlCVX lock status and rewards.
5. Provide a comprehensive summary including:
   - All pool positions with staked balances and pending rewards
   - CVX staking: staked amount, pending cvxCRV rewards
   - cvxCRV staking: staked amount, reward weight setting
   - vlCVX: locked amount, voting power, lock expiry dates, claimable rewards
   - Total unclaimed rewards across all positions
   - Recommendations (e.g. rewards to claim, expiring locks to relock)`,
          },
        },
      ],
    })
  );

  // ── Find Best Convex Yield ──────────────────────────────────────────
  server.prompt(
    "find-best-convex-yield",
    "Find the highest-yielding Convex pools currently active",
    {},
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Find the best Convex Finance yield opportunities.

Steps:
1. Use convex_get_pools to list all active Convex pools.
2. For the pools, use convex_get_pool_info to get detailed reward data (total staked, reward rate, extra rewards).
3. Present the top pools ranked by estimated APY, including:
   - Pool ID, LP token name
   - Total value staked
   - Reward rate and whether the reward period is active
   - Number of extra reward tokens
   - Any notable characteristics (e.g. high TVL, recently launched)
4. Note that actual APYs depend on CRV/CVX token prices and pool TVL.`,
          },
        },
      ],
    })
  );
}
