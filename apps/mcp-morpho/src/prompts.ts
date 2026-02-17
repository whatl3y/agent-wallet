import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  // ── Portfolio Analysis ─────────────────────────────────────────────
  server.prompt(
    "analyze-morpho-portfolio",
    "Analyze a user's Morpho portfolio: positions across markets and vaults, yields, and risk assessment",
    {
      userAddress: z
        .string()
        .describe("Wallet address to analyze"),
      chain: z
        .string()
        .optional()
        .describe("Chain to analyze (ethereum, base, arbitrum). Omit for all."),
    },
    ({ userAddress, chain }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Analyze the Morpho portfolio for address ${userAddress}${chain ? ` on ${chain}` : " across all chains"}.

Steps:
1. Call morpho_get_user_positions to get all market and vault positions
2. For each market position with a non-zero balance:
   - Note the supply, borrow, and collateral amounts with USD values
   - Call morpho_get_market_details to get current APYs and utilization
3. For each vault position:
   - Note the deposited amount and USD value
   - Call morpho_get_vault_details to get current APY and vault info

Provide:
- Summary of all market positions (supplied, borrowed, collateral) with current APYs
- Summary of all vault positions with current APYs
- Total supplied value, total borrowed value, and net position
- Risk assessment for borrowed positions (proximity to LLTV)
- Suggestions for optimizing the portfolio (better APY markets, vault alternatives)`,
          },
        },
      ],
    })
  );

  // ── Yield Comparison ───────────────────────────────────────────────
  server.prompt(
    "compare-morpho-yields",
    "Compare Morpho supply and borrow rates across available markets for a given asset",
    {
      assetSymbol: z
        .string()
        .describe("Asset symbol to compare (e.g., USDC, WETH)"),
    },
    ({ assetSymbol }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Compare Morpho lending yields for ${assetSymbol} across all available markets.

Steps:
1. Call morpho_get_markets with a high limit (100) to get all markets
2. Filter for markets where the loan asset symbol matches ${assetSymbol}
3. Also call morpho_get_vaults to find vaults with ${assetSymbol} as underlying

Present a comparison showing:
- For markets: Collateral Asset | Supply APY | Borrow APY | Supply TVL | Utilization | LLTV
- For vaults: Vault Name | APY | Net APY | TVL | Fee
- Highlight the best options for supplying (highest APY) and borrowing (lowest APY)
- Note any markets with very high utilization (>90%) as potentially risky for withdrawals`,
          },
        },
      ],
    })
  );
}
