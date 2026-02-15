import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getInfoClient } from "../clients.js";
import { jsonResult, errorResult } from "../utils.js";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Wallet address to query");

export function registerPositionTools(server: McpServer) {
  // ── Get Positions ───────────────────────────────────────────────────
  server.tool(
    "hl_get_positions",
    "Get all open perpetual positions for the wallet, including coin, size, leverage, entry price, mark price, liquidation price, unrealized PNL, margin, and position type (long/short)",
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
              absSize: Math.abs(size).toString(),
              entryPrice: pos.entryPx,
              positionValue: pos.positionValue,
              unrealizedPnl: pos.unrealizedPnl,
              returnOnEquity: pos.returnOnEquity,
              liquidationPrice: pos.liquidationPx,
              marginUsed: pos.marginUsed,
              leverage: pos.leverage,
              maxLeverage: pos.maxLeverage,
              cumFunding: pos.cumFunding,
            };
          });

        return jsonResult({
          user,
          positionCount: positions.length,
          positions,
        });
      } catch (e) {
        return errorResult(`Failed to get positions: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ── Get Open Orders ─────────────────────────────────────────────────
  server.tool(
    "hl_get_open_orders",
    "Get all currently open orders for the wallet, including coin, side, price, size, order type, and order ID",
    {
      user: addressParam,
    },
    async ({ user }) => {
      try {
        const orders = await getInfoClient().frontendOpenOrders({
          user: user as `0x${string}`,
        });

        const formatted = orders.map((o) => ({
          coin: o.coin,
          side: o.side,
          price: o.limitPx,
          size: o.sz,
          originalSize: o.origSz,
          orderId: o.oid,
          timestamp: o.timestamp,
          orderType: o.orderType,
          triggerCondition: o.triggerCondition,
          triggerPrice: o.triggerPx,
          isTrigger: o.isTrigger,
          isPositionTpsl: o.isPositionTpsl,
          reduceOnly: o.reduceOnly,
          cloid: o.cloid,
        }));

        return jsonResult({
          user,
          orderCount: formatted.length,
          orders: formatted,
        });
      } catch (e) {
        return errorResult(`Failed to get open orders: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );
}
