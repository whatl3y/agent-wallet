import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  Swap,
  SwapKind,
  TokenAmount,
  Token,
  BalancerApi,
  type ExactInQueryOutput,
  type ExactOutQueryOutput,
} from "@balancer/sdk";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import {
  getTokenDecimals,
  getTokenSymbol,
  buildApprovalIfNeeded,
  formatAmount,
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
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerSwapTools(server: McpServer) {
  // ── Swap Quote ─────────────────────────────────────────────────────
  server.tool(
    "balancer_swap_quote",
    "Get an optimal swap quote from Balancer V3 via the Smart Order Router (SOR). Returns the best route across all Balancer V3 pools. NOTE: For general token swaps, PREFER using swap_evm_quote from the swap MCP server, which aggregates across all DEXes (including Balancer) for best prices. Use this Balancer-specific swap when: (1) targeting Balancer pools specifically, (2) the swap MCP server is unavailable, or (3) the user explicitly requests a Balancer swap.",
    {
      chain: chainParam,
      tokenIn: addressParam.describe("Token to sell"),
      tokenOut: addressParam.describe("Token to buy"),
      amount: z
        .string()
        .describe("Amount in human-readable units (of tokenIn for exact-in, tokenOut for exact-out)"),
      swapKind: z
        .enum(["exact_in", "exact_out"])
        .optional()
        .default("exact_in")
        .describe("Swap kind: exact_in (default) or exact_out"),
    },
    async ({ chain, tokenIn, tokenOut, amount, swapKind }) => {
      try {
        const config = getChainConfig(chain);
        const rpcUrl = process.env[config.rpcEnvVar];
        if (!rpcUrl) {
          return errorResult(`Missing RPC URL: set ${config.rpcEnvVar}`);
        }

        // Fetch token info
        const [inDecimals, outDecimals, inSymbol, outSymbol] =
          await Promise.all([
            getTokenDecimals(chain, tokenIn as `0x${string}`),
            getTokenDecimals(chain, tokenOut as `0x${string}`),
            getTokenSymbol(chain, tokenIn as `0x${string}`),
            getTokenSymbol(chain, tokenOut as `0x${string}`),
          ]);

        // Use Balancer API to get SOR swap paths
        const balancerApi = new BalancerApi(
          "https://api-v3.balancer.fi",
          config.balancer.sdkChainId
        );

        const tokenInObj = new Token(
          config.balancer.sdkChainId,
          tokenIn as `0x${string}`,
          inDecimals
        );
        const tokenOutObj = new Token(
          config.balancer.sdkChainId,
          tokenOut as `0x${string}`,
          outDecimals
        );

        const kind =
          swapKind === "exact_out"
            ? SwapKind.GivenOut
            : SwapKind.GivenIn;

        const referenceToken =
          kind === SwapKind.GivenIn ? tokenInObj : tokenOutObj;
        const referenceDecimals =
          kind === SwapKind.GivenIn ? inDecimals : outDecimals;
        const swapAmount = TokenAmount.fromHumanAmount(
          referenceToken,
          amount as `${number}`
        );

        const sorPaths = await balancerApi.sorSwapPaths.fetchSorSwapPaths({
          chainId: config.balancer.sdkChainId,
          tokenIn: tokenIn as `0x${string}`,
          tokenOut: tokenOut as `0x${string}`,
          swapKind: kind,
          swapAmount,
        });

        if (!sorPaths || sorPaths.length === 0) {
          return errorResult(
            `No swap route found for ${inSymbol} → ${outSymbol} on Balancer V3 (${chain}). The pair may not have sufficient liquidity.`
          );
        }

        // Build the Swap object and query on-chain for exact amounts
        const swap = new Swap({
          chainId: config.balancer.sdkChainId,
          paths: sorPaths,
          swapKind: kind,
        });

        const queryResult = await swap.query(rpcUrl);

        let expectedIn: string;
        let expectedOut: string;

        if (kind === SwapKind.GivenIn) {
          const result = queryResult as ExactInQueryOutput;
          expectedIn = amount;
          expectedOut = formatAmount(
            result.expectedAmountOut.amount,
            outDecimals
          );
        } else {
          const result = queryResult as ExactOutQueryOutput;
          expectedIn = formatAmount(
            result.expectedAmountIn.amount,
            inDecimals
          );
          expectedOut = amount;
        }

        return jsonResult({
          chain,
          swapKind,
          tokenIn: { address: tokenIn, symbol: inSymbol, amount: expectedIn },
          tokenOut: {
            address: tokenOut,
            symbol: outSymbol,
            amount: expectedOut,
          },
          pathCount: sorPaths.length,
          note: "For best execution across all DEXes, consider using swap_evm_quote from the swap MCP server instead.",
        });
      } catch (e) {
        return errorResult(`Failed to get Balancer swap quote: ${e}`);
      }
    }
  );

  // ── Swap Build ─────────────────────────────────────────────────────
  server.tool(
    "balancer_swap_build",
    "Build a swap transaction on Balancer V3. Uses the Smart Order Router (SOR) for optimal routing, then builds calldata with slippage protection. NOTE: For general token swaps, PREFER using swap_evm_build from the swap MCP server. Use this Balancer-specific swap when: (1) targeting Balancer pools specifically, (2) the swap MCP server is unavailable, or (3) the user explicitly requests a Balancer swap.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      tokenIn: addressParam.describe("Token to sell"),
      tokenOut: addressParam.describe("Token to buy"),
      amount: z
        .string()
        .describe("Amount in human-readable units (of tokenIn for exact-in, tokenOut for exact-out)"),
      swapKind: z
        .enum(["exact_in", "exact_out"])
        .optional()
        .default("exact_in")
        .describe("Swap kind: exact_in (default) or exact_out"),
      slippageBps: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .optional()
        .default(50)
        .describe("Slippage tolerance in basis points (default: 50 = 0.5%)"),
    },
    async ({ chain, sender, tokenIn, tokenOut, amount, swapKind, slippageBps }) => {
      try {
        const config = getChainConfig(chain);
        const rpcUrl = process.env[config.rpcEnvVar];
        if (!rpcUrl) {
          return errorResult(`Missing RPC URL: set ${config.rpcEnvVar}`);
        }

        // Fetch token info
        const [inDecimals, outDecimals, inSymbol, outSymbol] =
          await Promise.all([
            getTokenDecimals(chain, tokenIn as `0x${string}`),
            getTokenDecimals(chain, tokenOut as `0x${string}`),
            getTokenSymbol(chain, tokenIn as `0x${string}`),
            getTokenSymbol(chain, tokenOut as `0x${string}`),
          ]);

        // Get SOR paths
        const balancerApi = new BalancerApi(
          "https://api-v3.balancer.fi",
          config.balancer.sdkChainId
        );

        const tokenInObj = new Token(
          config.balancer.sdkChainId,
          tokenIn as `0x${string}`,
          inDecimals
        );
        const tokenOutObj = new Token(
          config.balancer.sdkChainId,
          tokenOut as `0x${string}`,
          outDecimals
        );

        const kind =
          swapKind === "exact_out"
            ? SwapKind.GivenOut
            : SwapKind.GivenIn;

        const referenceToken =
          kind === SwapKind.GivenIn ? tokenInObj : tokenOutObj;
        const swapAmount = TokenAmount.fromHumanAmount(
          referenceToken,
          amount as `${number}`
        );

        const sorPaths = await balancerApi.sorSwapPaths.fetchSorSwapPaths({
          chainId: config.balancer.sdkChainId,
          tokenIn: tokenIn as `0x${string}`,
          tokenOut: tokenOut as `0x${string}`,
          swapKind: kind,
          swapAmount,
        });

        if (!sorPaths || sorPaths.length === 0) {
          return errorResult(
            `No swap route found for ${inSymbol} → ${outSymbol} on Balancer V3 (${chain}).`
          );
        }

        // Build swap and query on-chain
        const swap = new Swap({
          chainId: config.balancer.sdkChainId,
          paths: sorPaths,
          swapKind: kind,
        });

        const queryResult = await swap.query(rpcUrl);

        // Build the calldata
        const slippagePercent = slippageBps / 100;
        const { Slippage } = await import("@balancer/sdk");
        const sdkSlippage = Slippage.fromPercentage(
          `${slippagePercent}` as `${number}`
        );

        const callData = swap.buildCall({
          slippage: sdkSlippage,
          sender: sender as `0x${string}`,
          recipient: sender as `0x${string}`,
          wethIsEth: false,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 1800),
          queryOutput: queryResult,
        });

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Build approval for tokenIn to the Router/Vault
        // In Balancer V3, tokens need to be approved to the Vault
        const approvalAmount =
          kind === SwapKind.GivenIn
            ? swapAmount.amount
            : (queryResult as ExactOutQueryOutput).expectedAmountIn.amount;

        const approval = await buildApprovalIfNeeded(
          chain,
          tokenIn as `0x${string}`,
          sender as `0x${string}`,
          config.balancer.vault,
          approvalAmount,
          inSymbol
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        // Build the swap transaction
        let expectedIn: string;
        let expectedOut: string;

        if (kind === SwapKind.GivenIn) {
          const result = queryResult as ExactInQueryOutput;
          expectedIn = amount;
          expectedOut = formatAmount(
            result.expectedAmountOut.amount,
            outDecimals
          );
        } else {
          const result = queryResult as ExactOutQueryOutput;
          expectedIn = formatAmount(
            result.expectedAmountIn.amount,
            inDecimals
          );
          expectedOut = amount;
        }

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Swap ${expectedIn} ${inSymbol} for ~${expectedOut} ${outSymbol} on Balancer V3 (${slippagePercent}% slippage)`,
          to: callData.to,
          data: callData.callData,
          value: callData.value.toString(),
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions,
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build Balancer swap transaction: ${e}`);
      }
    }
  );
}
