import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { getPublicClient } from "../clients.js";
import { syntheticsReaderAbi } from "../abis/synthetics-reader.js";
import {
  getCachedTickerPrices,
  buildPriceMap,
  buildSymbolMap,
} from "../api/gmx.js";
import { dataStoreAbi } from "../abis/data-store.js";
import {
  computePositionKey,
  calcEntryPrice,
  estimateLiquidationPrice,
  buildMarketPrices,
  formatUsd,
  formatUsdPrice,
  formatAmount,
  getTokenDecimals,
  accountOrderListKey,
  ZERO_ADDRESS,
  ORDER_TYPE_LABELS,
  jsonResult,
  errorResult,
} from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain (arbitrum or avalanche)");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerPositionTools(server: McpServer) {
  server.tool(
    "gmx_get_positions",
    "Get all open GMX V2 positions for a wallet address. Shows position type (long/short), market, leverage, notional size, PNL, entry price, mark price, liquidation price estimate, and collateral details.",
    {
      chain: chainParam,
      account: addressParam.describe("Wallet address to query positions for"),
    },
    async ({ chain, account }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        const positions = await client.readContract({
          address: config.gmx.syntheticsReader,
          abi: syntheticsReaderAbi,
          functionName: "getAccountPositions",
          args: [config.gmx.dataStore, account as `0x${string}`, 0n, 1000n],
        });

        if (positions.length === 0) {
          return jsonResult({ chain, account, positions: [], count: 0 });
        }

        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const priceMap = buildPriceMap(tickers);
        const symbolMap = buildSymbolMap(tickers);

        const formatted = await Promise.all(
          positions.map(async (pos) => {
            const marketAddr = pos.addresses.market;
            const collateralAddr = pos.addresses.collateralToken;
            const isLong = pos.flags.isLong;

            // Get market info to find index/long/short tokens
            const market = await client.readContract({
              address: config.gmx.syntheticsReader,
              abi: syntheticsReaderAbi,
              functionName: "getMarket",
              args: [config.gmx.dataStore, marketAddr],
            });

            const indexSymbol =
              symbolMap.get(market.indexToken.toLowerCase()) || "?";
            const collateralSymbol =
              symbolMap.get(collateralAddr.toLowerCase()) || "?";

            // Get detailed position info with PNL
            const positionKey = computePositionKey(
              account as `0x${string}`,
              marketAddr,
              collateralAddr,
              isLong
            );

            const marketPrices = buildMarketPrices(
              priceMap,
              market.indexToken,
              market.longToken,
              market.shortToken
            );

            let basePnlUsd = 0n;
            let borrowingFeeUsd = 0n;
            let fundingFeeAmount = 0n;
            let positionFeeAmount = 0n;

            try {
              // usePositionSizeAsSizeDeltaUsd = true so positionFeeAmount
              // reflects the fee to close the full position (needed for
              // accurate liquidation price estimation).
              const posInfo = await client.readContract({
                address: config.gmx.syntheticsReader,
                abi: syntheticsReaderAbi,
                functionName: "getPositionInfo",
                args: [
                  config.gmx.dataStore,
                  config.gmx.referralStorage,
                  positionKey,
                  marketPrices,
                  0n,
                  ZERO_ADDRESS,
                  true,
                ],
              });

              basePnlUsd = posInfo.basePnlUsd;
              borrowingFeeUsd = posInfo.fees.borrowing.borrowingFeeUsd;
              fundingFeeAmount = posInfo.fees.funding.fundingFeeAmount;
              positionFeeAmount = posInfo.fees.positionFeeAmount;
            } catch {
              // Position info may fail if prices are stale, continue with raw data
            }

            const sizeInUsd = pos.numbers.sizeInUsd;
            const sizeInTokens = pos.numbers.sizeInTokens;
            const collateralAmount = pos.numbers.collateralAmount;

            // Get actual index token decimals for proper price formatting
            let indexTokenDecimals = 18;
            try {
              indexTokenDecimals = await getTokenDecimals(
                chain,
                market.indexToken as `0x${string}`
              );
            } catch {
              // Synthetic tokens may not have on-chain decimals; default to 18
            }

            const collateralPrice =
              priceMap.get(collateralAddr.toLowerCase());
            const collateralMidPrice = collateralPrice
              ? (collateralPrice.min + collateralPrice.max) / 2n
              : 0n;

            // Collateral value in USD (30 decimals).
            // Oracle prices are in 10^(30-tokenDecimals) format, so
            // amount (10^tokenDecimals) * oraclePrice (10^(30-tokenDecimals)) = USD * 10^30.
            const collateralUsd = collateralAmount * collateralMidPrice;

            const entryPrice = calcEntryPrice(
              sizeInUsd,
              sizeInTokens,
              indexTokenDecimals
            );

            const indexPrice = priceMap.get(market.indexToken.toLowerCase());
            // Oracle prices are in 10^(30-tokenDecimals) format; multiply by
            // 10^tokenDecimals to normalize to 30-decimal USD for formatUsdPrice.
            const markPrice = indexPrice
              ? ((indexPrice.min + indexPrice.max) / 2n) *
                10n ** BigInt(indexTokenDecimals)
              : 0n;

            // Convert token-denominated fees to 30-decimal USD.
            // feeInTokens (10^tokenDec) * oraclePrice (10^(30-tokenDec)) = USD * 10^30
            const fundingFeeUsd = fundingFeeAmount * collateralMidPrice;
            const closeFeeUsd = positionFeeAmount * collateralMidPrice;

            // GMX requires a minimum collateral of ~1% of position size
            // (exact factor is per-market in DataStore; 1% is the common default).
            const minCollateralUsd = sizeInUsd / 100n;

            const totalPendingFees =
              borrowingFeeUsd + fundingFeeUsd + closeFeeUsd + minCollateralUsd;
            const liqPrice = estimateLiquidationPrice(
              isLong,
              sizeInUsd,
              sizeInTokens,
              collateralUsd,
              totalPendingFees,
              indexTokenDecimals
            );

            const leverage =
              collateralUsd > 0n
                ? Number((sizeInUsd * 10n) / collateralUsd) / 10
                : 0;

            return {
              market: marketAddr,
              indexSymbol,
              positionType: isLong ? "LONG" : "SHORT",
              collateralToken: collateralAddr,
              collateralSymbol,
              leverage: `${leverage.toFixed(1)}x`,
              sizeUsd: formatUsd(sizeInUsd),
              collateralUsd: formatUsd(collateralUsd),
              entryPriceUsd: formatUsdPrice(entryPrice),
              markPriceUsd: formatUsdPrice(markPrice),
              liqPriceUsd: formatUsdPrice(liqPrice),
              pnlUsd: formatUsd(basePnlUsd),
              borrowingFeeUsd: formatUsd(borrowingFeeUsd),
            };
          })
        );

        return jsonResult({ chain, account, count: formatted.length, positions: formatted });
      } catch (error) {
        return errorResult(
          `Failed to get positions: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  server.tool(
    "gmx_get_position_pnl",
    "Get detailed PNL breakdown for a specific GMX V2 position: base PNL, borrowing fees, funding fees, price impact, close fee estimate, net PNL.",
    {
      chain: chainParam,
      account: addressParam.describe("Wallet address"),
      market: addressParam.describe("Market token address"),
      collateralToken: addressParam.describe("Collateral token address"),
      isLong: z.boolean().describe("true for long, false for short"),
    },
    async ({ chain, account, market, collateralToken, isLong }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        const positionKey = computePositionKey(
          account as `0x${string}`,
          market as `0x${string}`,
          collateralToken as `0x${string}`,
          isLong
        );

        const marketData = await client.readContract({
          address: config.gmx.syntheticsReader,
          abi: syntheticsReaderAbi,
          functionName: "getMarket",
          args: [config.gmx.dataStore, market as `0x${string}`],
        });

        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const priceMap = buildPriceMap(tickers);
        const symbolMap = buildSymbolMap(tickers);

        const marketPrices = buildMarketPrices(
          priceMap,
          marketData.indexToken,
          marketData.longToken,
          marketData.shortToken
        );

        const posInfo = await client.readContract({
          address: config.gmx.syntheticsReader,
          abi: syntheticsReaderAbi,
          functionName: "getPositionInfo",
          args: [
            config.gmx.dataStore,
            config.gmx.referralStorage,
            positionKey,
            marketPrices,
            0n,
            ZERO_ADDRESS,
            true, // usePositionSizeAsSizeDeltaUsd = simulate full close
          ],
        });

        const indexSymbol =
          symbolMap.get(marketData.indexToken.toLowerCase()) || "?";
        const collateralSymbol =
          symbolMap.get(collateralToken.toLowerCase()) || "?";

        const basePnl = posInfo.basePnlUsd;
        const borrowFee = posInfo.fees.borrowing.borrowingFeeUsd;
        const fundingFee = posInfo.fees.funding.fundingFeeAmount;
        const positionFee = posInfo.fees.positionFeeAmount;
        const priceImpact = posInfo.executionPriceResult.priceImpactUsd;
        const pnlAfterImpact = posInfo.pnlAfterPriceImpactUsd;

        return jsonResult({
          chain,
          market,
          indexSymbol,
          collateralToken,
          collateralSymbol,
          positionType: isLong ? "LONG" : "SHORT",
          pnlBreakdown: {
            basePnlUsd: formatUsd(basePnl),
            borrowingFeeUsd: `-${formatUsd(borrowFee)}`,
            fundingFeeAmount: fundingFee.toString(),
            closeFeeAmount: positionFee.toString(),
            priceImpactUsd: formatUsd(priceImpact),
            pnlAfterPriceImpactUsd: formatUsd(pnlAfterImpact),
          },
          sizeUsd: formatUsd(posInfo.position.numbers.sizeInUsd),
          collateralAmount: posInfo.position.numbers.collateralAmount.toString(),
          totalCostAmount: posInfo.fees.totalCostAmount.toString(),
        });
      } catch (error) {
        return errorResult(
          `Failed to get PNL breakdown: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  server.tool(
    "gmx_get_orders",
    "Get all pending orders (TP/SL, limit orders) for a wallet on GMX V2.",
    {
      chain: chainParam,
      account: addressParam.describe("Wallet address"),
    },
    async ({ chain, account }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        const [orders, orderKeys] = await Promise.all([
          client.readContract({
            address: config.gmx.syntheticsReader,
            abi: syntheticsReaderAbi,
            functionName: "getAccountOrders",
            args: [config.gmx.dataStore, account as `0x${string}`, 0n, 1000n],
          }),
          client.readContract({
            address: config.gmx.dataStore,
            abi: dataStoreAbi,
            functionName: "getBytes32ValuesAt",
            args: [accountOrderListKey(account as `0x${string}`), 0n, 1000n],
          }),
        ]);

        if (orders.length === 0) {
          return jsonResult({ chain, account, orders: [], count: 0 });
        }

        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const symbolMap = buildSymbolMap(tickers);

        // Build a decimals lookup for each unique market's index token so
        // we can normalise oracle-format prices for display.
        const decimalsMap = new Map<string, number>();
        const uniqueMarkets = [
          ...new Set(orders.map((o) => o.addresses.market.toLowerCase())),
        ];
        await Promise.all(
          uniqueMarkets.map(async (marketAddr) => {
            try {
              const mkt = await client.readContract({
                address: config.gmx.syntheticsReader,
                abi: syntheticsReaderAbi,
                functionName: "getMarket",
                args: [config.gmx.dataStore, marketAddr as `0x${string}`],
              });
              const dec = await getTokenDecimals(
                chain,
                mkt.indexToken as `0x${string}`
              );
              decimalsMap.set(marketAddr, dec);
            } catch {
              decimalsMap.set(marketAddr, 18);
            }
          })
        );

        const formatted = orders.map((order, index) => {
          const marketSymbol =
            symbolMap.get(order.addresses.market.toLowerCase()) || "?";
          const collateralSymbol =
            symbolMap.get(
              order.addresses.initialCollateralToken.toLowerCase()
            ) || "?";

          // Normalise oracle-format prices to 30-decimal for display
          const dec = BigInt(
            decimalsMap.get(order.addresses.market.toLowerCase()) ?? 18
          );
          const normTrigger =
            order.numbers.triggerPrice * 10n ** dec;
          const normAcceptable =
            order.numbers.acceptablePrice * 10n ** dec;

          return {
            orderKey: orderKeys[index] ?? null,
            market: order.addresses.market,
            marketSymbol,
            collateralToken: order.addresses.initialCollateralToken,
            collateralSymbol,
            orderType: ORDER_TYPE_LABELS[order.numbers.orderType] || `Unknown(${order.numbers.orderType})`,
            isLong: order.flags.isLong,
            sizeDeltaUsd: formatUsd(order.numbers.sizeDeltaUsd),
            triggerPriceUsd: formatUsdPrice(normTrigger),
            acceptablePriceUsd: formatUsdPrice(normAcceptable),
            autoCancel: order.flags.autoCancel,
            isFrozen: order.flags.isFrozen,
          };
        });

        return jsonResult({ chain, account, count: formatted.length, orders: formatted });
      } catch (error) {
        return errorResult(
          `Failed to get orders: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
