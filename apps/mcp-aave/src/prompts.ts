import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  // ── Portfolio Analysis ─────────────────────────────────────────────
  server.prompt(
    "analyze-portfolio",
    "Analyze an AAVE portfolio: health factor, risk assessment, and optimization suggestions",
    {
      chain: z.string().describe("Chain to analyze (e.g., ethereum, base)"),
      userAddress: z
        .string()
        .describe("Wallet address to analyze"),
    },
    ({ chain, userAddress }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Analyze the AAVE V3 portfolio for address ${userAddress} on ${chain}.

Steps:
1. Call aave_get_user_account_data to get the overall position (health factor, collateral, debt)
2. Call aave_get_all_reserves to list available assets
3. For each reserve, call aave_get_user_reserve_data to find which assets the user has supplied or borrowed
4. Call aave_get_asset_prices for the relevant assets to get current USD values
5. Check aave_get_user_emode to see if efficiency mode is active

Provide:
- Summary of all supplied assets with current values and APY
- Summary of all borrowed assets with current values and APR
- Health factor assessment (safe > 2.0, moderate 1.5-2.0, risky 1.0-1.5, liquidatable < 1.0)
- Suggestions for improving the position (e.g., repay debt, add collateral, enable eMode)`,
          },
        },
      ],
    })
  );

  // ── Yield Comparison ───────────────────────────────────────────────
  server.prompt(
    "compare-yields",
    "Compare supply and borrow rates for an asset across all supported AAVE chains",
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
            text: `Compare AAVE V3 supply and borrow rates for ${assetSymbol} across all supported chains.

Steps:
1. For each chain (ethereum, polygon, arbitrum, optimism, base, avalanche):
   a. Call aave_get_all_reserves to find the ${assetSymbol} token address on that chain
   b. Call aave_get_reserve_data to get the liquidity rate (supply APY) and variable borrow rate
   c. Call aave_get_reserve_config to check if the asset is active and not frozen
   d. Call aave_get_asset_price for the current price

Present a comparison table showing:
- Chain | Supply APY | Borrow APR | Total Supply | Total Borrows | Utilization
- Highlight the best chain for supplying (highest APY) and borrowing (lowest APR)`,
          },
        },
      ],
    })
  );

  // ── Liquidation Scanner ────────────────────────────────────────────
  server.prompt(
    "check-liquidation-risk",
    "Assess liquidation risk for a specific AAVE position",
    {
      chain: z.string().describe("Chain to check"),
      userAddress: z.string().describe("Wallet address to assess"),
    },
    ({ chain, userAddress }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Assess the liquidation risk of the AAVE V3 position for ${userAddress} on ${chain}.

Steps:
1. Call aave_get_user_account_data — focus on healthFactor, totalCollateral, totalDebt
2. If health factor < 2.0, investigate further:
   a. Call aave_get_all_reserves and aave_get_user_reserve_data for each to find all positions
   b. Call aave_get_asset_prices for all involved assets
   c. Call aave_get_reserve_config for each to get liquidation thresholds and bonuses

Provide:
- Current health factor and risk level
- How much the collateral value would need to drop (in %) to trigger liquidation
- Which asset price movements pose the biggest risk
- Concrete steps to reduce risk (repay X amount, supply Y more collateral)`,
          },
        },
      ],
    })
  );
}
