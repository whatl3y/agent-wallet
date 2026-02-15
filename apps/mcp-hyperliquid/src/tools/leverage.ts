import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCoinIndex, isHyperliquidTestnet } from "../clients.js";
import { jsonResult, errorResult } from "../utils.js";

export function registerLeverageTools(server: McpServer) {
  // ── Update Leverage ─────────────────────────────────────────────────
  server.tool(
    "hl_update_leverage",
    "Prepare to update the leverage setting for a coin. Returns an action descriptor that must be signed and submitted separately.",
    {
      coin: z.string().describe("Coin symbol, e.g. 'BTC', 'ETH'"),
      leverage: z.number().int().min(1).max(200).describe("New leverage multiplier"),
      isCross: z
        .boolean()
        .default(true)
        .describe("true for cross margin, false for isolated margin"),
    },
    async ({ coin, leverage, isCross }) => {
      try {
        const upperCoin = coin.toUpperCase();
        const assetIndex = await getCoinIndex(upperCoin);

        return jsonResult({
          action: "hl_update_leverage",
          isTestnet: isHyperliquidTestnet(),
          params: {
            asset: assetIndex,
            isCross,
            leverage,
          },
          summary: {
            coin: upperCoin,
            leverage,
            marginType: isCross ? "cross" : "isolated",
          },
        });
      } catch (e) {
        return errorResult(`Failed to prepare leverage update: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ── Update Isolated Margin ──────────────────────────────────────────
  server.tool(
    "hl_update_margin",
    "Prepare to add or remove margin from an isolated margin position. Returns an action descriptor that must be signed and submitted separately.",
    {
      coin: z.string().describe("Coin symbol of the isolated position"),
      isBuy: z.boolean().describe("true if the position is long, false if short"),
      amount: z
        .number()
        .describe(
          "Amount of USD to add (positive) or remove (negative) as margin. Value in raw USD units (1 = $0.000001, so use e.g. 1000000 for $1)."
        ),
    },
    async ({ coin, isBuy, amount }) => {
      try {
        const upperCoin = coin.toUpperCase();
        const assetIndex = await getCoinIndex(upperCoin);

        return jsonResult({
          action: "hl_update_isolated_margin",
          isTestnet: isHyperliquidTestnet(),
          params: {
            asset: assetIndex,
            isBuy,
            ntli: amount,
          },
          summary: {
            coin: upperCoin,
            action: amount > 0 ? "add margin" : "remove margin",
            amount,
          },
        });
      } catch (e) {
        return errorResult(`Failed to prepare margin update: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );
}
