import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getInfoClient } from "../clients.js";
import { jsonResult, errorResult } from "../utils.js";

export function registerMarketInfoTools(server: McpServer) {
  // ── Get All Markets ─────────────────────────────────────────────────
  server.tool(
    "hl_get_markets",
    "Get all available Hyperliquid perpetual markets with current mid prices, 24h volume, open interest, and funding rates",
    {},
    async () => {
      try {
        const [metaAndCtxs, mids] = await Promise.all([
          getInfoClient().metaAndAssetCtxs(),
          getInfoClient().allMids(),
        ]);

        const [meta, assetCtxs] = metaAndCtxs;
        const markets = meta.universe.map((asset, i) => {
          const ctx = assetCtxs[i];
          return {
            coin: asset.name,
            szDecimals: asset.szDecimals,
            maxLeverage: asset.maxLeverage,
            midPrice: mids[asset.name] ?? null,
            markPrice: ctx?.markPx ?? null,
            dayVolume: ctx?.dayNtlVlm ?? null,
            openInterest: ctx?.openInterest ?? null,
            funding: ctx?.funding ?? null,
            prevDayPrice: ctx?.prevDayPx ?? null,
          };
        });

        return jsonResult({
          network: process.env.HYPERLIQUID_TESTNET === "true" ? "testnet" : "mainnet",
          totalMarkets: markets.length,
          markets,
        });
      } catch (e) {
        return errorResult(`Failed to get markets: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ── Get Market Price ────────────────────────────────────────────────
  server.tool(
    "hl_get_market_price",
    "Get the current mid price and market context for a specific Hyperliquid perpetual market",
    {
      coin: z.string().describe("Coin symbol, e.g. 'BTC', 'ETH', 'SOL'"),
    },
    async ({ coin }) => {
      try {
        const [metaAndCtxs, mids] = await Promise.all([
          getInfoClient().metaAndAssetCtxs(),
          getInfoClient().allMids(),
        ]);

        const [meta, assetCtxs] = metaAndCtxs;
        const idx = meta.universe.findIndex(
          (a) => a.name.toUpperCase() === coin.toUpperCase()
        );

        if (idx === -1) {
          return errorResult(
            `Unknown coin: ${coin}. Available: ${meta.universe.map((a) => a.name).join(", ")}`
          );
        }

        const asset = meta.universe[idx];
        const ctx = assetCtxs[idx];

        return jsonResult({
          coin: asset.name,
          midPrice: mids[asset.name] ?? null,
          markPrice: ctx?.markPx ?? null,
          oraclePrice: ctx?.oraclePx ?? null,
          dayVolume: ctx?.dayNtlVlm ?? null,
          openInterest: ctx?.openInterest ?? null,
          funding: ctx?.funding ?? null,
          prevDayPrice: ctx?.prevDayPx ?? null,
          maxLeverage: asset.maxLeverage,
          szDecimals: asset.szDecimals,
        });
      } catch (e) {
        return errorResult(`Failed to get market price: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ── Get Order Book ──────────────────────────────────────────────────
  server.tool(
    "hl_get_orderbook",
    "Get the L2 order book (bids and asks) for a specific Hyperliquid perpetual market",
    {
      coin: z.string().describe("Coin symbol, e.g. 'BTC', 'ETH'"),
      nSigFigs: z
        .number()
        .int()
        .min(2)
        .max(5)
        .optional()
        .describe("Number of significant figures for price grouping (2-5)"),
    },
    async ({ coin, nSigFigs }) => {
      try {
        const params: { coin: string; nSigFigs?: 2 | 3 | 4 | 5 } = { coin: coin.toUpperCase() };
        if (nSigFigs !== undefined) params.nSigFigs = nSigFigs as 2 | 3 | 4 | 5;

        const book = await getInfoClient().l2Book(params);

        return jsonResult({
          coin: coin.toUpperCase(),
          levels: book.levels,
        });
      } catch (e) {
        return errorResult(`Failed to get orderbook: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );
}
