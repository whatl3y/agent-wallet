import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { getPublicClient } from "../clients.js";
import { exchangeRouterAbi } from "../abis/exchange-router.js";
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
  leverageToSizeDeltaUsd,
  applySlippage,
  parseAmount,
  parseUsdPrice,
  formatUsd,
  formatUsdPrice,
  computePositionKey,
  buildMarketPrices,
  getTokenDecimals,
  getTokenSymbol,
  ZERO_ADDRESS,
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

export function registerOrderTools(server: McpServer) {
  // ── Open Position ──────────────────────────────────────────────────
  server.tool(
    "gmx_open_position",
    "Build transaction(s) to open a new GMX V2 perpetual position (long or short), or add to an existing one. Returns ERC20 approval (if needed) + ExchangeRouter.multicall with createOrder(MarketIncrease). Optionally creates TP/SL orders.",
    {
      chain: chainParam,
      sender: addressParam.describe("Wallet address executing the trade"),
      market: addressParam.describe("Market token address (from gmx_get_markets)"),
      collateralToken: addressParam.describe(
        "Collateral token address (e.g., USDC for shorts, WETH for longs)"
      ),
      collateralAmount: z
        .string()
        .describe('Collateral amount in human-readable units (e.g., "1000")'),
      leverage: z
        .number()
        .min(1.1)
        .max(100)
        .describe("Leverage multiplier (e.g., 10 for 10x)"),
      isLong: z.boolean().describe("true for long, false for short"),
      slippageBps: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(30)
        .describe("Slippage tolerance in basis points (default: 30 = 0.3%)"),
      takeProfitPrice: z
        .string()
        .optional()
        .describe('Optional take profit trigger price in USD (e.g., "4500.00")'),
      stopLossPrice: z
        .string()
        .optional()
        .describe('Optional stop loss trigger price in USD (e.g., "3000.00")'),
    },
    async ({
      chain,
      sender,
      market,
      collateralToken,
      collateralAmount,
      leverage,
      isLong,
      slippageBps,
      takeProfitPrice,
      stopLossPrice,
    }) => {
      try {
        const config = getChainConfig(chain);

        // Get token info
        const decimals = await getTokenDecimals(
          chain,
          collateralToken as `0x${string}`
        );
        const symbol = await getTokenSymbol(
          chain,
          collateralToken as `0x${string}`
        );
        const rawCollateral = parseAmount(collateralAmount, decimals);

        // Get current prices
        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const priceMap = buildPriceMap(tickers);
        const symbolMap = buildSymbolMap(tickers);

        const collateralPrice = priceMap.get(collateralToken.toLowerCase());
        if (!collateralPrice) {
          return errorResult(`No price data for collateral token ${collateralToken}`);
        }
        const collateralMidPrice =
          (collateralPrice.min + collateralPrice.max) / 2n;

        // Get market info for index token
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
          return errorResult(`No price data for index token ${marketData.indexToken}`);
        }

        // Calculate size
        const sizeDeltaUsd = leverageToSizeDeltaUsd(
          rawCollateral,
          decimals,
          collateralMidPrice,
          leverage
        );

        // Calculate acceptable price with slippage
        const markPrice = isLong ? indexPrice.max : indexPrice.min;
        const acceptablePrice = applySlippage(markPrice, slippageBps, isLong);

        // Estimate execution fee
        const executionFee = await estimateExecutionFee(chain, "increase");

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Check if collateral is the wrapped native token (e.g. WETH on Arbitrum).
        // If so, detect whether the user has WETH ERC20 tokens or native ETH and
        // pick the appropriate path.
        const isWrappedNative =
          collateralToken.toLowerCase() ===
          config.gmx.wrappedNativeToken.toLowerCase();

        let useNativeEth = false;
        if (isWrappedNative) {
          const { erc20Abi } = await import("../abis/erc20.js");
          const wethBalance = await client.readContract({
            address: config.gmx.wrappedNativeToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [sender as `0x${string}`],
          });
          // If WETH ERC20 balance is insufficient, fall back to native ETH
          useNativeEth = wethBalance < rawCollateral;
        }

        if (!useNativeEth) {
          // ERC20 collateral (WETH ERC20, USDC, etc.) — needs approval + sendTokens
          const approval = await buildApprovalIfNeeded(
            chain,
            collateralToken as `0x${string}`,
            sender as `0x${string}`,
            config.gmx.syntheticsRouter,
            rawCollateral,
            symbol
          );
          if (approval) {
            approval.step = stepNum++;
            transactions.push(approval);
          }
        }

        // Build open position multicall
        const orderParams = buildCreateOrderParams({
          receiver: sender as `0x${string}`,
          market: market as `0x${string}`,
          initialCollateralToken: collateralToken as `0x${string}`,
          sizeDeltaUsd,
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
          collateralAmount: rawCollateral,
          useNativeCollateral: useNativeEth,
          createOrderParams: orderParams,
        });

        const sizeFormatted = formatUsd(sizeDeltaUsd);
        transactions.push({
          step: stepNum++,
          type: "action",
          description: `Open ${leverage}x ${isLong ? "long" : "short"} ${indexSymbol}/USD ($${sizeFormatted}) with ${collateralAmount} ${symbol} collateral`,
          to: config.gmx.exchangeRouter,
          data: multicall.data,
          value: multicall.value.toString(),
        });

        // Build TP order if specified
        if (takeProfitPrice) {
          const tpExecutionFee = await estimateExecutionFee(chain, "decrease");
          const tpTriggerPrice = parseUsdPrice(takeProfitPrice);
          const tpAcceptablePrice = applySlippage(
            tpTriggerPrice,
            slippageBps,
            !isLong // TP for long = price going up, acceptable price below trigger
          );

          const tpParams = buildCreateOrderParams({
            receiver: sender as `0x${string}`,
            market: market as `0x${string}`,
            initialCollateralToken: collateralToken as `0x${string}`,
            sizeDeltaUsd,
            initialCollateralDeltaAmount: 0n,
            triggerPrice: tpTriggerPrice,
            acceptablePrice: tpAcceptablePrice,
            executionFee: tpExecutionFee,
            orderType: OrderType.LimitDecrease,
            isLong,
            shouldUnwrapNativeToken: false,
            autoCancel: true,
          });

          const tpMulticall = buildOrderMulticall({
            config,
            executionFee: tpExecutionFee,
            createOrderParams: tpParams,
          });

          transactions.push({
            step: stepNum++,
            type: "action",
            description: `Set take profit at $${takeProfitPrice} for ${indexSymbol}/USD ${isLong ? "long" : "short"}`,
            to: config.gmx.exchangeRouter,
            data: tpMulticall.data,
            value: tpMulticall.value.toString(),
          });
        }

        // Build SL order if specified
        if (stopLossPrice) {
          const slExecutionFee = await estimateExecutionFee(chain, "decrease");
          const slTriggerPrice = parseUsdPrice(stopLossPrice);
          const slAcceptablePrice = applySlippage(
            slTriggerPrice,
            slippageBps,
            !isLong
          );

          const slParams = buildCreateOrderParams({
            receiver: sender as `0x${string}`,
            market: market as `0x${string}`,
            initialCollateralToken: collateralToken as `0x${string}`,
            sizeDeltaUsd,
            initialCollateralDeltaAmount: 0n,
            triggerPrice: slTriggerPrice,
            acceptablePrice: slAcceptablePrice,
            executionFee: slExecutionFee,
            orderType: OrderType.StopLossDecrease,
            isLong,
            shouldUnwrapNativeToken: false,
            autoCancel: true,
          });

          const slMulticall = buildOrderMulticall({
            config,
            executionFee: slExecutionFee,
            createOrderParams: slParams,
          });

          transactions.push({
            step: stepNum++,
            type: "action",
            description: `Set stop loss at $${stopLossPrice} for ${indexSymbol}/USD ${isLong ? "long" : "short"}`,
            to: config.gmx.exchangeRouter,
            data: slMulticall.data,
            value: slMulticall.value.toString(),
          });
        }

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions,
        };

        return jsonResult(payload);
      } catch (error) {
        return errorResult(
          `Failed to build open position: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // ── Close Position ─────────────────────────────────────────────────
  server.tool(
    "gmx_close_position",
    "Build transaction to fully or partially close a GMX V2 position. Use closeSizeUsd='max' to close the entire position.",
    {
      chain: chainParam,
      sender: addressParam.describe("Wallet address"),
      market: addressParam.describe("Market token address"),
      collateralToken: addressParam.describe("Collateral token address"),
      isLong: z.boolean().describe("true for long, false for short"),
      closeSizeUsd: z
        .string()
        .describe(
          'USD size to close in human-readable (e.g., "5000") or "max" for full position'
        ),
      slippageBps: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(30)
        .describe("Slippage tolerance in basis points (default: 30 = 0.3%)"),
    },
    async ({ chain, sender, market, collateralToken, isLong, closeSizeUsd, slippageBps }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        let sizeDeltaUsd: bigint;

        if (closeSizeUsd.toLowerCase() === "max") {
          // Fetch current position size
          const positions = await client.readContract({
            address: config.gmx.syntheticsReader,
            abi: syntheticsReaderAbi,
            functionName: "getAccountPositions",
            args: [config.gmx.dataStore, sender as `0x${string}`, 0n, 1000n],
          });

          const pos = positions.find(
            (p) =>
              p.addresses.market.toLowerCase() === market.toLowerCase() &&
              p.addresses.collateralToken.toLowerCase() ===
                collateralToken.toLowerCase() &&
              p.flags.isLong === isLong
          );

          if (!pos) {
            return errorResult("Position not found");
          }

          sizeDeltaUsd = pos.numbers.sizeInUsd;
        } else {
          sizeDeltaUsd = parseUsdPrice(closeSizeUsd);
        }

        // Get current index price for acceptable price
        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const priceMap = buildPriceMap(tickers);
        const symbolMap = buildSymbolMap(tickers);

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
          return errorResult(`No price for index token ${marketData.indexToken}`);
        }

        // For close: longs want price high (sell), shorts want price low (buy back)
        const markPrice = isLong ? indexPrice.min : indexPrice.max;
        const acceptablePrice = applySlippage(markPrice, slippageBps, !isLong);

        const executionFee = await estimateExecutionFee(chain, "decrease");

        const orderParams = buildCreateOrderParams({
          receiver: sender as `0x${string}`,
          market: market as `0x${string}`,
          initialCollateralToken: collateralToken as `0x${string}`,
          sizeDeltaUsd,
          initialCollateralDeltaAmount: 0n,
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

        const isFullClose = closeSizeUsd.toLowerCase() === "max";
        const sizeFormatted = formatUsd(sizeDeltaUsd);

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `${isFullClose ? "Close" : "Partially close"} ${indexSymbol}/USD ${isLong ? "long" : "short"} ($${sizeFormatted})`,
              to: config.gmx.exchangeRouter,
              data: multicall.data,
              value: multicall.value.toString(),
            },
          ],
        };

        return jsonResult(payload);
      } catch (error) {
        return errorResult(
          `Failed to build close position: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // ── Set Take Profit ────────────────────────────────────────────────
  server.tool(
    "gmx_set_take_profit",
    "Build transaction to set a take profit order (LimitDecrease) on an existing GMX V2 position. Auto-cancels when position is closed.",
    {
      chain: chainParam,
      sender: addressParam.describe("Wallet address"),
      market: addressParam.describe("Market token address"),
      collateralToken: addressParam.describe("Collateral token address"),
      isLong: z.boolean(),
      triggerPrice: z
        .string()
        .describe('Take profit trigger price in USD (e.g., "4500.00")'),
      closeSizeUsd: z
        .string()
        .describe(
          'USD size to close when triggered (e.g., "5000") or "max" for full'
        ),
      slippageBps: z.number().int().default(30),
    },
    async ({ chain, sender, market, collateralToken, isLong, triggerPrice, closeSizeUsd, slippageBps }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        let sizeDeltaUsd: bigint;
        if (closeSizeUsd.toLowerCase() === "max") {
          const positions = await client.readContract({
            address: config.gmx.syntheticsReader,
            abi: syntheticsReaderAbi,
            functionName: "getAccountPositions",
            args: [config.gmx.dataStore, sender as `0x${string}`, 0n, 1000n],
          });
          const pos = positions.find(
            (p) =>
              p.addresses.market.toLowerCase() === market.toLowerCase() &&
              p.addresses.collateralToken.toLowerCase() === collateralToken.toLowerCase() &&
              p.flags.isLong === isLong
          );
          if (!pos) return errorResult("Position not found");
          sizeDeltaUsd = pos.numbers.sizeInUsd;
        } else {
          sizeDeltaUsd = parseUsdPrice(closeSizeUsd);
        }

        const tpTriggerPrice = parseUsdPrice(triggerPrice);
        const acceptablePrice = applySlippage(tpTriggerPrice, slippageBps, !isLong);
        const executionFee = await estimateExecutionFee(chain, "decrease");

        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const symbolMap = buildSymbolMap(tickers);
        const marketData = await client.readContract({
          address: config.gmx.syntheticsReader,
          abi: syntheticsReaderAbi,
          functionName: "getMarket",
          args: [config.gmx.dataStore, market as `0x${string}`],
        });
        const indexSymbol = symbolMap.get(marketData.indexToken.toLowerCase()) || "?";

        const orderParams = buildCreateOrderParams({
          receiver: sender as `0x${string}`,
          market: market as `0x${string}`,
          initialCollateralToken: collateralToken as `0x${string}`,
          sizeDeltaUsd,
          initialCollateralDeltaAmount: 0n,
          triggerPrice: tpTriggerPrice,
          acceptablePrice,
          executionFee,
          orderType: OrderType.LimitDecrease,
          isLong,
          shouldUnwrapNativeToken: true,
          autoCancel: true,
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
              description: `Set take profit at $${triggerPrice} for ${indexSymbol}/USD ${isLong ? "long" : "short"}`,
              to: config.gmx.exchangeRouter,
              data: multicall.data,
              value: multicall.value.toString(),
            },
          ],
        };

        return jsonResult(payload);
      } catch (error) {
        return errorResult(
          `Failed to set take profit: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // ── Set Stop Loss ──────────────────────────────────────────────────
  server.tool(
    "gmx_set_stop_loss",
    "Build transaction to set a stop loss order (StopLossDecrease) on an existing GMX V2 position. Auto-cancels when position is closed.",
    {
      chain: chainParam,
      sender: addressParam.describe("Wallet address"),
      market: addressParam.describe("Market token address"),
      collateralToken: addressParam.describe("Collateral token address"),
      isLong: z.boolean(),
      triggerPrice: z
        .string()
        .describe('Stop loss trigger price in USD (e.g., "3000.00")'),
      closeSizeUsd: z
        .string()
        .describe(
          'USD size to close when triggered (e.g., "5000") or "max" for full'
        ),
      slippageBps: z.number().int().default(30),
    },
    async ({ chain, sender, market, collateralToken, isLong, triggerPrice, closeSizeUsd, slippageBps }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        let sizeDeltaUsd: bigint;
        if (closeSizeUsd.toLowerCase() === "max") {
          const positions = await client.readContract({
            address: config.gmx.syntheticsReader,
            abi: syntheticsReaderAbi,
            functionName: "getAccountPositions",
            args: [config.gmx.dataStore, sender as `0x${string}`, 0n, 1000n],
          });
          const pos = positions.find(
            (p) =>
              p.addresses.market.toLowerCase() === market.toLowerCase() &&
              p.addresses.collateralToken.toLowerCase() === collateralToken.toLowerCase() &&
              p.flags.isLong === isLong
          );
          if (!pos) return errorResult("Position not found");
          sizeDeltaUsd = pos.numbers.sizeInUsd;
        } else {
          sizeDeltaUsd = parseUsdPrice(closeSizeUsd);
        }

        const slTriggerPrice = parseUsdPrice(triggerPrice);
        const acceptablePrice = applySlippage(slTriggerPrice, slippageBps, !isLong);
        const executionFee = await estimateExecutionFee(chain, "decrease");

        const tickers = await getCachedTickerPrices(config.gmx.apiBaseUrl);
        const symbolMap = buildSymbolMap(tickers);
        const marketData = await client.readContract({
          address: config.gmx.syntheticsReader,
          abi: syntheticsReaderAbi,
          functionName: "getMarket",
          args: [config.gmx.dataStore, market as `0x${string}`],
        });
        const indexSymbol = symbolMap.get(marketData.indexToken.toLowerCase()) || "?";

        const orderParams = buildCreateOrderParams({
          receiver: sender as `0x${string}`,
          market: market as `0x${string}`,
          initialCollateralToken: collateralToken as `0x${string}`,
          sizeDeltaUsd,
          initialCollateralDeltaAmount: 0n,
          triggerPrice: slTriggerPrice,
          acceptablePrice,
          executionFee,
          orderType: OrderType.StopLossDecrease,
          isLong,
          shouldUnwrapNativeToken: true,
          autoCancel: true,
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
              description: `Set stop loss at $${triggerPrice} for ${indexSymbol}/USD ${isLong ? "long" : "short"}`,
              to: config.gmx.exchangeRouter,
              data: multicall.data,
              value: multicall.value.toString(),
            },
          ],
        };

        return jsonResult(payload);
      } catch (error) {
        return errorResult(
          `Failed to set stop loss: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // ── Update Order ───────────────────────────────────────────────────
  server.tool(
    "gmx_update_order",
    "Build transaction to update an existing pending GMX V2 order's trigger price, size, or acceptable price.",
    {
      chain: chainParam,
      orderKey: z
        .string()
        .regex(/^0x[a-fA-F0-9]{64}$/)
        .describe("Order key (bytes32 hex)"),
      sizeDeltaUsd: z.string().optional().describe("New size delta in USD"),
      triggerPrice: z.string().optional().describe("New trigger price in USD"),
      acceptablePrice: z.string().optional().describe("New acceptable price in USD"),
      autoCancel: z.boolean().optional().describe("Auto-cancel when position is closed"),
    },
    async ({ chain, orderKey, sizeDeltaUsd, triggerPrice, acceptablePrice, autoCancel }) => {
      try {
        const config = getChainConfig(chain);

        const data = encodeFunctionData({
          abi: exchangeRouterAbi,
          functionName: "updateOrder",
          args: [
            orderKey as `0x${string}`,
            sizeDeltaUsd ? parseUsdPrice(sizeDeltaUsd) : 0n,
            acceptablePrice ? parseUsdPrice(acceptablePrice) : 0n,
            triggerPrice ? parseUsdPrice(triggerPrice) : 0n,
            0n, // minOutputAmount
            0n, // validFromTime
            autoCancel ?? true,
          ],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Update order ${orderKey.slice(0, 10)}...`,
              to: config.gmx.exchangeRouter,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (error) {
        return errorResult(
          `Failed to update order: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // ── Cancel Order ───────────────────────────────────────────────────
  server.tool(
    "gmx_cancel_order",
    "Build transaction to cancel a pending GMX V2 order. The execution fee is refunded.",
    {
      chain: chainParam,
      orderKey: z
        .string()
        .regex(/^0x[a-fA-F0-9]{64}$/)
        .describe("Order key (bytes32 hex)"),
    },
    async ({ chain, orderKey }) => {
      try {
        const config = getChainConfig(chain);

        const data = encodeFunctionData({
          abi: exchangeRouterAbi,
          functionName: "cancelOrder",
          args: [orderKey as `0x${string}`],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Cancel order ${orderKey.slice(0, 10)}... (execution fee refunded)`,
              to: config.gmx.exchangeRouter,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (error) {
        return errorResult(
          `Failed to cancel order: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
