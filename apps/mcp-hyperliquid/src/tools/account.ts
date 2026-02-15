import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getInfoClient } from "../clients.js";
import { jsonResult, errorResult } from "../utils.js";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Wallet address to query");

export function registerAccountTools(server: McpServer) {
  // ── Get Account Summary ─────────────────────────────────────────────
  server.tool(
    "hl_get_account_summary",
    "Get the overall Hyperliquid account summary: total account value, margin used, withdrawable balance, cross-margin details, and all open positions",
    {
      user: addressParam,
    },
    async ({ user }) => {
      try {
        const state = await getInfoClient().clearinghouseState({
          user: user as `0x${string}`,
        });

        const activePositions = state.assetPositions.filter(
          (p) => parseFloat(p.position.szi) !== 0
        );

        return jsonResult({
          user,
          network: process.env.HYPERLIQUID_TESTNET === "true" ? "testnet" : "mainnet",
          marginSummary: state.marginSummary,
          crossMarginSummary: state.crossMarginSummary,
          crossMaintenanceMarginUsed: state.crossMaintenanceMarginUsed,
          withdrawable: state.withdrawable,
          activePositionCount: activePositions.length,
        });
      } catch (e) {
        return errorResult(`Failed to get account summary: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ── Get Spot Balances ───────────────────────────────────────────────
  server.tool(
    "hl_get_balances",
    "Get the wallet's spot token balances on Hyperliquid",
    {
      user: addressParam,
    },
    async ({ user }) => {
      try {
        const spotState = await getInfoClient().spotClearinghouseState({
          user: user as `0x${string}`,
        });

        return jsonResult({
          user,
          balances: spotState.balances,
        });
      } catch (e) {
        return errorResult(`Failed to get balances: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );
}
