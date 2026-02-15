import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { getPublicClient } from "../clients.js";
import { syntheticsReaderAbi } from "../abis/synthetics-reader.js";
import {
  getCachedTickerPrices,
  getCachedTokens,
  buildPriceMap,
  buildSymbolMap,
  buildDecimalsMap,
} from "../api/gmx.js";
import { formatUsdPrice, jsonResult, errorResult } from "../utils.js";

/**
 * Normalise an oracle-format price (10^(30-tokenDecimals)) to full
 * 30-decimal USD so that formatUsdPrice produces a human-readable value.
 */
function normPrice(oracle: bigint, tokenDecimals: number): bigint {
  return oracle * 10n ** BigInt(tokenDecimals);
}

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain (arbitrum or avalanche)");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerMarketTools(server: McpServer) {
  server.tool(
    "gmx_get_markets",
    "List all available GMX V2 perpetual markets on a chain with index token, long/short tokens, and market token addresses.",
    { chain: chainParam },
    async ({ chain }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        const markets = await client.readContract({
          address: config.gmx.syntheticsReader,
          abi: syntheticsReaderAbi,
          functionName: "getMarkets",
          args: [config.gmx.dataStore, 0n, 1000n],
        });

        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const tokens = await getCachedTokens(config.gmx.apiBaseUrl);
        const symbolMap = buildSymbolMap(tickers);
        const priceMap = buildPriceMap(tickers);
        const decimalsMap = buildDecimalsMap(tokens);

        const formatted = markets.map((m) => {
          const indexSymbol =
            symbolMap.get(m.indexToken.toLowerCase()) || "unknown";
          const longSymbol =
            symbolMap.get(m.longToken.toLowerCase()) || "unknown";
          const shortSymbol =
            symbolMap.get(m.shortToken.toLowerCase()) || "unknown";

          const indexPrice = priceMap.get(m.indexToken.toLowerCase());
          const dec = decimalsMap.get(m.indexToken.toLowerCase()) ?? 18;
          const midPrice = indexPrice
            ? normPrice((indexPrice.min + indexPrice.max) / 2n, dec)
            : 0n;

          return {
            marketToken: m.marketToken,
            indexToken: m.indexToken,
            indexSymbol,
            longToken: m.longToken,
            longSymbol,
            shortToken: m.shortToken,
            shortSymbol,
            label: `${indexSymbol}/USD [${longSymbol}-${shortSymbol}]`,
            currentPriceUsd: formatUsdPrice(midPrice),
          };
        });

        return jsonResult({
          chain,
          count: formatted.length,
          markets: formatted,
        });
      } catch (error) {
        return errorResult(
          `Failed to get markets: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  server.tool(
    "gmx_get_market_info",
    "Get detailed info for a specific GMX V2 market: current prices, market tokens. Use with a market token address from gmx_get_markets.",
    {
      chain: chainParam,
      market: addressParam.describe("Market token address"),
    },
    async ({ chain, market }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        const marketData = await client.readContract({
          address: config.gmx.syntheticsReader,
          abi: syntheticsReaderAbi,
          functionName: "getMarket",
          args: [config.gmx.dataStore, market as `0x${string}`],
        });

        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const tokens = await getCachedTokens(config.gmx.apiBaseUrl);
        const symbolMap = buildSymbolMap(tickers);
        const priceMap = buildPriceMap(tickers);
        const decimalsMap = buildDecimalsMap(tokens);

        const indexSymbol =
          symbolMap.get(marketData.indexToken.toLowerCase()) || "unknown";
        const longSymbol =
          symbolMap.get(marketData.longToken.toLowerCase()) || "unknown";
        const shortSymbol =
          symbolMap.get(marketData.shortToken.toLowerCase()) || "unknown";

        const indexPrice = priceMap.get(marketData.indexToken.toLowerCase());
        const longPrice = priceMap.get(marketData.longToken.toLowerCase());
        const shortPrice = priceMap.get(marketData.shortToken.toLowerCase());

        const idxDec = decimalsMap.get(marketData.indexToken.toLowerCase()) ?? 18;
        const longDec = decimalsMap.get(marketData.longToken.toLowerCase()) ?? 18;
        const shortDec = decimalsMap.get(marketData.shortToken.toLowerCase()) ?? 18;

        return jsonResult({
          chain,
          market,
          label: `${indexSymbol}/USD [${longSymbol}-${shortSymbol}]`,
          indexToken: {
            address: marketData.indexToken,
            symbol: indexSymbol,
            minPriceUsd: indexPrice ? formatUsdPrice(normPrice(indexPrice.min, idxDec)) : null,
            maxPriceUsd: indexPrice ? formatUsdPrice(normPrice(indexPrice.max, idxDec)) : null,
          },
          longToken: {
            address: marketData.longToken,
            symbol: longSymbol,
            minPriceUsd: longPrice ? formatUsdPrice(normPrice(longPrice.min, longDec)) : null,
            maxPriceUsd: longPrice ? formatUsdPrice(normPrice(longPrice.max, longDec)) : null,
          },
          shortToken: {
            address: marketData.shortToken,
            symbol: shortSymbol,
            minPriceUsd: shortPrice ? formatUsdPrice(normPrice(shortPrice.min, shortDec)) : null,
            maxPriceUsd: shortPrice ? formatUsdPrice(normPrice(shortPrice.max, shortDec)) : null,
          },
        });
      } catch (error) {
        return errorResult(
          `Failed to get market info: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  server.tool(
    "gmx_get_prices",
    "Get current GMX oracle prices for all tokens on a chain. Returns min/max prices in USD.",
    { chain: chainParam },
    async ({ chain }) => {
      try {
        const config = getChainConfig(chain);
        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const tokens = await getCachedTokens(config.gmx.apiBaseUrl);
        const decimalsMap = buildDecimalsMap(tokens);

        const formatted = tickers.map((t) => {
          const dec = decimalsMap.get(t.tokenAddress.toLowerCase()) ?? 18;
          const min = BigInt(t.minPrice);
          const max = BigInt(t.maxPrice);
          return {
            symbol: t.tokenSymbol,
            address: t.tokenAddress,
            minPriceUsd: formatUsdPrice(normPrice(min, dec)),
            maxPriceUsd: formatUsdPrice(normPrice(max, dec)),
            midPriceUsd: formatUsdPrice(normPrice((min + max) / 2n, dec)),
          };
        });

        return jsonResult({ chain, count: formatted.length, prices: formatted });
      } catch (error) {
        return errorResult(
          `Failed to get prices: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
