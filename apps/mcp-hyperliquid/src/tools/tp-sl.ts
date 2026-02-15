import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getInfoClient,
  getCoinIndex,
  getMeta,
  isHyperliquidTestnet,
} from "../clients.js";
import { jsonResult, errorResult } from "../utils.js";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Wallet address to query");

export function registerTpSlTools(server: McpServer) {
  // ── Set TP/SL ───────────────────────────────────────────────────────
  server.tool(
    "hl_set_tp_sl",
    "Prepare take-profit and/or stop-loss orders on an existing position. Returns action descriptor(s) that must be signed and submitted separately.",
    {
      user: addressParam,
      coin: z.string().describe("Coin symbol of the position"),
      takeProfit: z
        .number()
        .positive()
        .optional()
        .describe("Take-profit trigger price in USD"),
      stopLoss: z
        .number()
        .positive()
        .optional()
        .describe("Stop-loss trigger price in USD"),
      tpSize: z
        .number()
        .positive()
        .optional()
        .describe("Size for TP order in base units (defaults to full position)"),
      slSize: z
        .number()
        .positive()
        .optional()
        .describe("Size for SL order in base units (defaults to full position)"),
    },
    async ({ user, coin, takeProfit, stopLoss, tpSize, slSize }) => {
      try {
        if (!takeProfit && !stopLoss) {
          return errorResult("Must specify at least one of takeProfit or stopLoss");
        }

        const upperCoin = coin.toUpperCase();
        const assetIndex = await getCoinIndex(upperCoin);

        // Get current position to determine side and size
        const state = await getInfoClient().clearinghouseState({
          user: user as `0x${string}`,
        });

        const position = state.assetPositions.find(
          (p) => p.position.coin.toUpperCase() === upperCoin
        );

        if (!position || parseFloat(position.position.szi) === 0) {
          return errorResult(`No open position found for ${upperCoin}`);
        }

        const currentSize = parseFloat(position.position.szi);
        const isLong = currentSize > 0;
        const posSize = Math.abs(currentSize);

        const meta = await getMeta();
        const szDecimals = meta.universe[assetIndex].szDecimals;

        const orders: Array<{
          a: number;
          b: boolean;
          p: string;
          s: string;
          r: boolean;
          t: { trigger: { triggerPx: string; isMarket: boolean; tpsl: "tp" | "sl" } };
        }> = [];

        // Take-profit: counter-side order that triggers at TP price
        if (takeProfit) {
          const sz = tpSize
            ? parseFloat(Math.min(tpSize, posSize).toFixed(szDecimals))
            : parseFloat(posSize.toFixed(szDecimals));

          orders.push({
            a: assetIndex,
            b: !isLong,
            p: takeProfit.toString(),
            s: sz.toString(),
            r: true,
            t: {
              trigger: {
                triggerPx: takeProfit.toString(),
                isMarket: true,
                tpsl: "tp",
              },
            },
          });
        }

        // Stop-loss: counter-side order that triggers at SL price
        if (stopLoss) {
          const sz = slSize
            ? parseFloat(Math.min(slSize, posSize).toFixed(szDecimals))
            : parseFloat(posSize.toFixed(szDecimals));

          orders.push({
            a: assetIndex,
            b: !isLong,
            p: stopLoss.toString(),
            s: sz.toString(),
            r: true,
            t: {
              trigger: {
                triggerPx: stopLoss.toString(),
                isMarket: true,
                tpsl: "sl",
              },
            },
          });
        }

        return jsonResult({
          action: "hl_order",
          isTestnet: isHyperliquidTestnet(),
          params: {
            orders,
            grouping: "na",
          },
          summary: {
            coin: upperCoin,
            positionSide: isLong ? "long" : "short",
            takeProfit: takeProfit ?? null,
            stopLoss: stopLoss ?? null,
          },
        });
      } catch (e) {
        return errorResult(`Failed to prepare TP/SL: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ── Cancel TP/SL ────────────────────────────────────────────────────
  server.tool(
    "hl_cancel_tp_sl",
    "Prepare to cancel existing take-profit and/or stop-loss trigger orders on a position. Returns an action descriptor that must be signed and submitted separately.",
    {
      user: addressParam,
      coin: z.string().describe("Coin symbol of the position"),
      cancelTp: z
        .boolean()
        .default(true)
        .describe("Cancel take-profit orders"),
      cancelSl: z
        .boolean()
        .default(true)
        .describe("Cancel stop-loss orders"),
    },
    async ({ user, coin, cancelTp, cancelSl }) => {
      try {
        const upperCoin = coin.toUpperCase();

        // Get open orders and find TP/SL trigger orders for this coin
        const orders = await getInfoClient().frontendOpenOrders({
          user: user as `0x${string}`,
        });

        const triggerOrders = orders.filter(
          (o) =>
            o.coin.toUpperCase() === upperCoin &&
            o.isTrigger &&
            ((cancelTp && o.orderType === "Take Profit Market") ||
              (cancelTp && o.orderType === "Take Profit Limit") ||
              (cancelSl && o.orderType === "Stop Market") ||
              (cancelSl && o.orderType === "Stop Limit"))
        );

        if (triggerOrders.length === 0) {
          return jsonResult({
            success: true,
            message: `No TP/SL orders found for ${upperCoin}`,
            cancelledCount: 0,
          });
        }

        const cancels = await Promise.all(
          triggerOrders.map(async (o) => ({
            a: await getCoinIndex(o.coin),
            o: o.oid,
          }))
        );

        return jsonResult({
          action: "hl_cancel",
          isTestnet: isHyperliquidTestnet(),
          params: { cancels },
          summary: {
            coin: upperCoin,
            cancelledCount: triggerOrders.length,
            cancelledOrders: triggerOrders.map((o) => ({
              orderId: o.oid,
              type: o.orderType,
              triggerPrice: o.triggerPx,
              size: o.sz,
            })),
          },
        });
      } catch (e) {
        return errorResult(`Failed to prepare TP/SL cancel: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );
}
