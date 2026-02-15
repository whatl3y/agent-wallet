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
import {
  OrderType,
  buildCreateOrderParams,
  buildOrderMulticall,
  buildApprovalIfNeeded,
  estimateExecutionFee,
  applySlippage,
  parseAmount,
  getTokenDecimals,
  getTokenSymbol,
  jsonResult,
  errorResult,
  type TransactionStep,
  type TransactionPayload,
} from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain (arbitrum or avalanche)");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerCollateralTools(server: McpServer) {
  // ── Deposit Collateral ─────────────────────────────────────────────
  server.tool(
    "gmx_deposit_collateral",
    "Build transaction to add collateral to an existing GMX V2 position without changing position size. Uses MarketIncrease with sizeDeltaUsd=0.",
    {
      chain: chainParam,
      sender: addressParam.describe("Wallet address"),
      market: addressParam.describe("Market token address"),
      collateralToken: addressParam.describe("Collateral token address"),
      isLong: z.boolean(),
      collateralAmount: z
        .string()
        .describe("Amount of collateral to deposit in human-readable units"),
    },
    async ({ chain, sender, market, collateralToken, isLong, collateralAmount }) => {
      try {
        const config = getChainConfig(chain);

        const decimals = await getTokenDecimals(
          chain,
          collateralToken as `0x${string}`
        );
        const symbol = await getTokenSymbol(
          chain,
          collateralToken as `0x${string}`
        );
        const rawAmount = parseAmount(collateralAmount, decimals);

        // Get prices for acceptable price
        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const priceMap = buildPriceMap(tickers);
        const symbolMap = buildSymbolMap(tickers);

        const client = getPublicClient(chain);
        const marketData = await client.readContract({
          address: config.gmx.syntheticsReader,
          abi: syntheticsReaderAbi,
          functionName: "getMarket",
          args: [config.gmx.dataStore, market as `0x${string}`],
        });

        const indexSymbol =
          symbolMap.get(marketData.indexToken.toLowerCase()) || "?";
        const indexPrice = priceMap.get(marketData.indexToken.toLowerCase());
        if (!indexPrice) {
          return errorResult(`No price for index token`);
        }

        const markPrice = isLong ? indexPrice.max : indexPrice.min;
        const acceptablePrice = applySlippage(markPrice, 30, isLong);
        const executionFee = await estimateExecutionFee(chain, "increase");

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        const approval = await buildApprovalIfNeeded(
          chain,
          collateralToken as `0x${string}`,
          sender as `0x${string}`,
          config.gmx.syntheticsRouter,
          rawAmount,
          symbol
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        const orderParams = buildCreateOrderParams({
          receiver: sender as `0x${string}`,
          market: market as `0x${string}`,
          initialCollateralToken: collateralToken as `0x${string}`,
          sizeDeltaUsd: 0n,
          initialCollateralDeltaAmount: 0n,
          triggerPrice: 0n,
          acceptablePrice,
          executionFee,
          orderType: OrderType.MarketIncrease,
          isLong,
          shouldUnwrapNativeToken: false,
          autoCancel: false,
        });

        const multicall = buildOrderMulticall({
          config,
          executionFee,
          collateralToken: collateralToken as `0x${string}`,
          collateralAmount: rawAmount,
          createOrderParams: orderParams,
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Deposit ${collateralAmount} ${symbol} collateral to ${indexSymbol}/USD ${isLong ? "long" : "short"}`,
          to: config.gmx.exchangeRouter,
          data: multicall.data,
          value: multicall.value.toString(),
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions,
        };

        return jsonResult(payload);
      } catch (error) {
        return errorResult(
          `Failed to deposit collateral: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // ── Withdraw Collateral ────────────────────────────────────────────
  server.tool(
    "gmx_withdraw_collateral",
    "Build transaction to withdraw collateral from an existing GMX V2 position without changing position size. Uses MarketDecrease with sizeDeltaUsd=0.",
    {
      chain: chainParam,
      sender: addressParam.describe("Wallet address"),
      market: addressParam.describe("Market token address"),
      collateralToken: addressParam.describe("Collateral token address"),
      isLong: z.boolean(),
      collateralAmount: z
        .string()
        .describe("Amount of collateral to withdraw in human-readable units"),
    },
    async ({ chain, sender, market, collateralToken, isLong, collateralAmount }) => {
      try {
        const config = getChainConfig(chain);

        const decimals = await getTokenDecimals(
          chain,
          collateralToken as `0x${string}`
        );
        const symbol = await getTokenSymbol(
          chain,
          collateralToken as `0x${string}`
        );
        const rawAmount = parseAmount(collateralAmount, decimals);

        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const priceMap = buildPriceMap(tickers);
        const symbolMap = buildSymbolMap(tickers);

        const client = getPublicClient(chain);
        const marketData = await client.readContract({
          address: config.gmx.syntheticsReader,
          abi: syntheticsReaderAbi,
          functionName: "getMarket",
          args: [config.gmx.dataStore, market as `0x${string}`],
        });

        const indexSymbol =
          symbolMap.get(marketData.indexToken.toLowerCase()) || "?";
        const indexPrice = priceMap.get(marketData.indexToken.toLowerCase());
        if (!indexPrice) {
          return errorResult(`No price for index token`);
        }

        const markPrice = isLong ? indexPrice.min : indexPrice.max;
        const acceptablePrice = applySlippage(markPrice, 30, !isLong);
        const executionFee = await estimateExecutionFee(chain, "decrease");

        const orderParams = buildCreateOrderParams({
          receiver: sender as `0x${string}`,
          market: market as `0x${string}`,
          initialCollateralToken: collateralToken as `0x${string}`,
          sizeDeltaUsd: 0n,
          initialCollateralDeltaAmount: rawAmount,
          triggerPrice: 0n,
          acceptablePrice,
          executionFee,
          orderType: OrderType.MarketDecrease,
          isLong,
          shouldUnwrapNativeToken: true,
          autoCancel: false,
        });

        const multicall = buildOrderMulticall({
          config,
          executionFee,
          createOrderParams: orderParams,
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Withdraw ${collateralAmount} ${symbol} collateral from ${indexSymbol}/USD ${isLong ? "long" : "short"}`,
              to: config.gmx.exchangeRouter,
              data: multicall.data,
              value: multicall.value.toString(),
            },
          ],
        };

        return jsonResult(payload);
      } catch (error) {
        return errorResult(
          `Failed to withdraw collateral: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
