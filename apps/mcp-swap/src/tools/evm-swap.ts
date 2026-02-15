import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, getAddress } from "viem";
import {
  getChainConfig,
  SUPPORTED_CHAINS,
  NATIVE_TOKEN_ADDRESS,
} from "../config/chains.js";
import { getSwapPrice, getSwapQuote } from "../api/zerox.js";
import {
  getTokenDecimals,
  getTokenSymbol,
  buildApprovalIfNeeded,
  jsonResult,
  errorResult,
  type TransactionStep,
  type TransactionPayload,
} from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain");

const addressParam = z
  .string()
  .describe(
    'Token contract address (0x-prefixed) or "native" for the chain\'s native token (ETH, POL, AVAX, etc.)'
  );

export function registerEvmSwapTools(server: McpServer) {
  // ── Quote ───────────────────────────────────────────────────────────
  server.tool(
    "swap_evm_quote",
    "Get a swap price quote on an EVM chain using 0x. Returns expected output amount and route info. No transaction data — use swap_evm_build to get executable calldata.",
    {
      chain: chainParam,
      sellToken: addressParam.describe("Token to sell"),
      buyToken: addressParam.describe("Token to buy"),
      sellAmount: z
        .string()
        .describe(
          'Amount to sell in human-readable units (e.g. "100.5"). For native tokens use 18 decimals.'
        ),
    },
    async ({ chain, sellToken, buyToken, sellAmount }) => {
      try {
        const config = getChainConfig(chain);

        const resolvedSellToken = resolveTokenAddress(sellToken);
        const resolvedBuyToken = resolveTokenAddress(buyToken);

        // Get decimals for the sell token to convert human amount to raw
        const sellDecimals = isNativeToken(resolvedSellToken)
          ? 18
          : await getTokenDecimals(chain, resolvedSellToken as `0x${string}`);
        const rawSellAmount = BigInt(
          Math.round(parseFloat(sellAmount) * 10 ** sellDecimals)
        ).toString();

        const price = await getSwapPrice({
          chainId: config.zeroxChainId,
          sellToken: resolvedSellToken,
          buyToken: resolvedBuyToken,
          sellAmount: rawSellAmount,
        });

        // Get buy token info for formatting
        const buyDecimals = isNativeToken(resolvedBuyToken)
          ? 18
          : await getTokenDecimals(chain, resolvedBuyToken as `0x${string}`);
        const buySymbol = isNativeToken(resolvedBuyToken)
          ? getNativeSymbol(chain)
          : await getTokenSymbol(chain, resolvedBuyToken as `0x${string}`);
        const sellSymbol = isNativeToken(resolvedSellToken)
          ? getNativeSymbol(chain)
          : await getTokenSymbol(chain, resolvedSellToken as `0x${string}`);

        const formattedBuyAmount = formatUnits(
          BigInt(price.buyAmount),
          buyDecimals
        );

        const routeSources = price.route.fills.map(
          (f) => `${f.source} (${(parseInt(f.proportionBps) / 100).toFixed(1)}%)`
        );

        return jsonResult({
          chain,
          sellToken: resolvedSellToken,
          sellSymbol,
          sellAmount,
          buyToken: resolvedBuyToken,
          buySymbol,
          buyAmount: formattedBuyAmount,
          rawBuyAmount: price.buyAmount,
          route: routeSources,
          networkFee: price.totalNetworkFee,
        });
      } catch (error) {
        return errorResult(
          `Failed to get swap quote: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // ── Build ───────────────────────────────────────────────────────────
  server.tool(
    "swap_evm_build",
    "Build executable swap transaction(s) on an EVM chain using 0x. Returns calldata for wallet_execute_calldata. Includes ERC20 approval if needed.",
    {
      chain: chainParam,
      sellToken: addressParam.describe("Token to sell"),
      buyToken: addressParam.describe("Token to buy"),
      sellAmount: z
        .string()
        .describe('Amount to sell in human-readable units (e.g. "100.5")'),
      taker: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe("Address executing the swap (the wallet address)"),
      slippageBps: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(100)
        .describe("Slippage tolerance in basis points (default: 100 = 1%)"),
    },
    async ({ chain, sellToken, buyToken, sellAmount, taker, slippageBps }) => {
      try {
        const config = getChainConfig(chain);

        const resolvedSellToken = resolveTokenAddress(sellToken);
        const resolvedBuyToken = resolveTokenAddress(buyToken);

        // Get decimals and convert amount
        const sellDecimals = isNativeToken(resolvedSellToken)
          ? 18
          : await getTokenDecimals(chain, resolvedSellToken as `0x${string}`);
        const rawSellAmount = BigInt(
          Math.round(parseFloat(sellAmount) * 10 ** sellDecimals)
        ).toString();

        // Get the firm quote with transaction data
        const quote = await getSwapQuote({
          chainId: config.zeroxChainId,
          sellToken: resolvedSellToken,
          buyToken: resolvedBuyToken,
          sellAmount: rawSellAmount,
          taker,
          slippageBps,
        });

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Check if ERC20 approval is needed (skip for native tokens)
        if (!isNativeToken(resolvedSellToken)) {
          const sellSymbol = await getTokenSymbol(
            chain,
            resolvedSellToken as `0x${string}`
          );
          const approval = await buildApprovalIfNeeded(
            chain,
            resolvedSellToken as `0x${string}`,
            taker as `0x${string}`,
            BigInt(rawSellAmount),
            sellSymbol
          );
          if (approval) {
            approval.step = stepNum++;
            transactions.push(approval);
          }
        }

        // Get token symbols for description
        const sellSymbol = isNativeToken(resolvedSellToken)
          ? getNativeSymbol(chain)
          : await getTokenSymbol(chain, resolvedSellToken as `0x${string}`);
        const buyDecimals = isNativeToken(resolvedBuyToken)
          ? 18
          : await getTokenDecimals(chain, resolvedBuyToken as `0x${string}`);
        const buySymbol = isNativeToken(resolvedBuyToken)
          ? getNativeSymbol(chain)
          : await getTokenSymbol(chain, resolvedBuyToken as `0x${string}`);
        const formattedBuyAmount = formatUnits(
          BigInt(quote.buyAmount),
          buyDecimals
        );

        // Add the swap transaction (normalize address to proper EIP-55 checksum)
        transactions.push({
          step: stepNum,
          type: "swap",
          description: `Swap ${sellAmount} ${sellSymbol} for ~${formattedBuyAmount} ${buySymbol}`,
          to: getAddress(quote.transaction.to),
          data: quote.transaction.data,
          value: quote.transaction.value,
        });

        const payload: TransactionPayload = {
          chainId: config.zeroxChainId,
          transactions,
        };

        return jsonResult(payload);
      } catch (error) {
        return errorResult(
          `Failed to build swap transaction: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}

function resolveTokenAddress(token: string): string {
  if (token.toLowerCase() === "native") return NATIVE_TOKEN_ADDRESS;
  return token;
}

function isNativeToken(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

function getNativeSymbol(chain: string): string {
  const symbols: Record<string, string> = {
    ethereum: "ETH",
    polygon: "POL",
    arbitrum: "ETH",
    optimism: "ETH",
    base: "ETH",
    avalanche: "AVAX",
  };
  return symbols[chain.toLowerCase()] || "ETH";
}
