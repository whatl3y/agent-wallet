import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getInfoClient } from "../clients.js";
import { jsonResult, errorResult } from "../utils.js";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Wallet address to query");

export function registerPnlTools(server: McpServer) {
  // ── Get PNL Summary ─────────────────────────────────────────────────
  server.tool(
    "hl_get_pnl_summary",
    "Get a PNL breakdown for all current positions: unrealized PNL per position, total unrealized PNL, return on equity, and margin usage",
    {
      user: addressParam,
    },
    async ({ user }) => {
      try {
        const state = await getInfoClient().clearinghouseState({
          user: user as `0x${string}`,
        });

        const positions = state.assetPositions
          .filter((p) => parseFloat(p.position.szi) !== 0)
          .map((p) => {
            const pos = p.position;
            const size = parseFloat(pos.szi);
            return {
              coin: pos.coin,
              side: size > 0 ? "long" : "short",
              size: pos.szi,
              entryPrice: pos.entryPx,
              positionValue: pos.positionValue,
              unrealizedPnl: pos.unrealizedPnl,
              returnOnEquity: pos.returnOnEquity,
              marginUsed: pos.marginUsed,
              leverage: pos.leverage,
              liquidationPrice: pos.liquidationPx,
              cumFundingSinceOpen: pos.cumFunding.sinceOpen,
            };
          });

        const totalUnrealizedPnl = positions.reduce(
          (sum, p) => sum + parseFloat(p.unrealizedPnl),
          0
        );

        const totalMarginUsed = positions.reduce(
          (sum, p) => sum + parseFloat(p.marginUsed),
          0
        );

        return jsonResult({
          user,
          accountValue: state.marginSummary.accountValue,
          totalUnrealizedPnl: totalUnrealizedPnl.toFixed(2),
          totalMarginUsed: totalMarginUsed.toFixed(2),
          withdrawable: state.withdrawable,
          positions,
        });
      } catch (e) {
        return errorResult(`Failed to get PNL summary: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ── Get Recent Fills ────────────────────────────────────────────────
  server.tool(
    "hl_get_fills",
    "Get recent trade fills (executed orders) for the wallet, including prices, sizes, fees, and PNL",
    {
      user: addressParam,
    },
    async ({ user }) => {
      try {
        const fills = await getInfoClient().userFills({
          user: user as `0x${string}`,
        });

        const formatted = fills.slice(0, 100).map((f) => ({
          coin: f.coin,
          side: f.side,
          price: f.px,
          size: f.sz,
          time: f.time,
          fee: f.fee,
          closedPnl: f.closedPnl,
          crossed: f.crossed,
          oid: f.oid,
          tid: f.tid,
        }));

        return jsonResult({
          user,
          fillCount: formatted.length,
          totalAvailable: fills.length,
          fills: formatted,
        });
      } catch (e) {
        return errorResult(`Failed to get fills: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );
}
