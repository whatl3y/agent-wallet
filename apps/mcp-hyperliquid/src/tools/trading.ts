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

export function registerTradingTools(server: McpServer) {
  // ── Place Order ─────────────────────────────────────────────────────
  server.tool(
    "hl_place_order",
    "Prepare a new perpetual order on Hyperliquid. Returns an action descriptor that must be signed and submitted separately. Supports market and limit orders.",
    {
      coin: z.string().describe("Coin symbol, e.g. 'BTC', 'ETH', 'SOL'"),
      isBuy: z.boolean().describe("true for long/buy, false for short/sell"),
      size: z.number().positive().describe("Position size in base asset units (e.g. 0.01 for 0.01 BTC)"),
      price: z
        .number()
        .positive()
        .optional()
        .describe("Limit price in USD. Required for limit orders. For market orders, derived from mid price with slippage."),
      reduceOnly: z.boolean().default(false).describe("If true, order can only reduce an existing position"),
      orderType: z
        .enum(["limit", "market"])
        .default("market")
        .describe("Order type: 'market' uses IOC with slippage, 'limit' uses GTC"),
      slippage: z
        .number()
        .min(0)
        .max(0.1)
        .default(0.01)
        .describe("Slippage tolerance for market orders as decimal (0.01 = 1%)"),
    },
    async ({ coin, isBuy, size, price, reduceOnly, orderType, slippage }) => {
      try {
        const upperCoin = coin.toUpperCase();
        const assetIndex = await getCoinIndex(upperCoin);
        const meta = await getMeta();
        const szDecimals = meta.universe[assetIndex].szDecimals;

        // Round size to valid decimals
        const roundedSize = parseFloat(size.toFixed(szDecimals));
        if (roundedSize <= 0) {
          return errorResult(`Size ${size} rounds to 0 with ${szDecimals} decimal places for ${upperCoin}`);
        }

        let limitPx: string;
        let orderTypeParam: { limit: { tif: "Gtc" } } | { limit: { tif: "Ioc" } };

        if (orderType === "market" || !price) {
          // Market order: get mid price and apply slippage
          const mids = await getInfoClient().allMids();
          const midStr = mids[upperCoin];
          if (!midStr) {
            return errorResult(`No mid price available for ${upperCoin}`);
          }
          const mid = parseFloat(midStr);
          const slippageMultiplier = isBuy ? 1 + slippage : 1 - slippage;
          limitPx = (mid * slippageMultiplier).toPrecision(5);
          orderTypeParam = { limit: { tif: "Ioc" } };
        } else {
          // Limit order
          limitPx = price.toString();
          orderTypeParam = { limit: { tif: "Gtc" } };
        }

        return jsonResult({
          action: "hl_order",
          isTestnet: isHyperliquidTestnet(),
          params: {
            orders: [
              {
                a: assetIndex,
                b: isBuy,
                p: limitPx,
                s: roundedSize.toString(),
                r: reduceOnly,
                t: orderTypeParam,
              },
            ],
            grouping: "na",
          },
          summary: {
            coin: upperCoin,
            side: isBuy ? "buy/long" : "sell/short",
            size: roundedSize,
            price: limitPx,
            orderType,
            reduceOnly,
          },
        });
      } catch (e) {
        return errorResult(`Failed to prepare order: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ── Close Position ──────────────────────────────────────────────────
  server.tool(
    "hl_close_position",
    "Prepare to close an existing perpetual position entirely or partially. Returns an action descriptor that must be signed and submitted separately.",
    {
      user: addressParam,
      coin: z.string().describe("Coin symbol of the position to close"),
      size: z
        .number()
        .positive()
        .optional()
        .describe("Amount to close in base units. Omit to close entire position."),
      price: z
        .number()
        .positive()
        .optional()
        .describe("Limit price. Omit for market close."),
      slippage: z
        .number()
        .min(0)
        .max(0.1)
        .default(0.01)
        .describe("Slippage tolerance for market close (0.01 = 1%)"),
    },
    async ({ user, coin, size, price, slippage }) => {
      try {
        const upperCoin = coin.toUpperCase();
        const assetIndex = await getCoinIndex(upperCoin);

        // Get current position
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
        const isBuy = !isLong; // Counter-side to close

        const meta = await getMeta();
        const szDecimals = meta.universe[assetIndex].szDecimals;

        // Determine close size
        const closeSize = size
          ? parseFloat(Math.min(size, Math.abs(currentSize)).toFixed(szDecimals))
          : parseFloat(Math.abs(currentSize).toFixed(szDecimals));

        let limitPx: string;
        let orderTypeParam: { limit: { tif: "Gtc" } } | { limit: { tif: "Ioc" } };

        if (price) {
          limitPx = price.toString();
          orderTypeParam = { limit: { tif: "Gtc" } };
        } else {
          const mids = await getInfoClient().allMids();
          const midStr = mids[upperCoin];
          if (!midStr) {
            return errorResult(`No mid price available for ${upperCoin}`);
          }
          const mid = parseFloat(midStr);
          const slippageMultiplier = isBuy ? 1 + slippage : 1 - slippage;
          limitPx = (mid * slippageMultiplier).toPrecision(5);
          orderTypeParam = { limit: { tif: "Ioc" } };
        }

        return jsonResult({
          action: "hl_order",
          isTestnet: isHyperliquidTestnet(),
          params: {
            orders: [
              {
                a: assetIndex,
                b: isBuy,
                p: limitPx,
                s: closeSize.toString(),
                r: true, // reduce-only for closing
                t: orderTypeParam,
              },
            ],
            grouping: "na",
          },
          summary: {
            coin: upperCoin,
            action: size ? "partial close" : "full close",
            closedSide: isLong ? "long" : "short",
            closeSize,
            price: limitPx,
          },
        });
      } catch (e) {
        return errorResult(`Failed to prepare close: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ── Cancel Order ────────────────────────────────────────────────────
  server.tool(
    "hl_cancel_order",
    "Prepare to cancel a specific open order by order ID. Returns an action descriptor that must be signed and submitted separately.",
    {
      coin: z.string().describe("Coin symbol of the order"),
      orderId: z.number().int().describe("The order ID to cancel (from hl_get_open_orders)"),
    },
    async ({ coin, orderId }) => {
      try {
        const upperCoin = coin.toUpperCase();
        const assetIndex = await getCoinIndex(upperCoin);

        return jsonResult({
          action: "hl_cancel",
          isTestnet: isHyperliquidTestnet(),
          params: {
            cancels: [{ a: assetIndex, o: orderId }],
          },
          summary: {
            coin: upperCoin,
            cancelledOrderId: orderId,
          },
        });
      } catch (e) {
        return errorResult(`Failed to prepare cancel: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ── Cancel All Orders ───────────────────────────────────────────────
  server.tool(
    "hl_cancel_all_orders",
    "Prepare to cancel all open orders, optionally filtered to a specific coin. Returns an action descriptor that must be signed and submitted separately.",
    {
      user: addressParam,
      coin: z
        .string()
        .optional()
        .describe("If provided, only cancel orders for this coin. Otherwise cancel all."),
    },
    async ({ user, coin }) => {
      try {
        const orders = await getInfoClient().frontendOpenOrders({
          user: user as `0x${string}`,
        });

        let toCancel = orders;
        if (coin) {
          const upperCoin = coin.toUpperCase();
          toCancel = orders.filter(
            (o) => o.coin.toUpperCase() === upperCoin
          );
        }

        if (toCancel.length === 0) {
          return jsonResult({
            success: true,
            message: coin
              ? `No open orders found for ${coin.toUpperCase()}`
              : "No open orders to cancel",
            cancelledCount: 0,
          });
        }

        // Build cancel requests grouped by coin
        const cancels = await Promise.all(
          toCancel.map(async (o) => ({
            a: await getCoinIndex(o.coin),
            o: o.oid,
          }))
        );

        return jsonResult({
          action: "hl_cancel",
          isTestnet: isHyperliquidTestnet(),
          params: { cancels },
          summary: {
            cancelledCount: toCancel.length,
            cancelledOrders: toCancel.map((o) => ({
              coin: o.coin,
              orderId: o.oid,
              side: o.side,
              price: o.limitPx,
              size: o.sz,
            })),
          },
        });
      } catch (e) {
        return errorResult(`Failed to prepare cancel: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );
}
