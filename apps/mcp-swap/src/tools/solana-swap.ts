import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getJupiterQuote, getJupiterSwap } from "../api/jupiter.js";
import { jsonResult, errorResult, type SolanaSwapPayload } from "../utils.js";

/** SOL native mint address used by Jupiter */
const SOL_MINT = "So11111111111111111111111111111111111111112";

export function registerSolanaSwapTools(server: McpServer) {
  // ── Quote ───────────────────────────────────────────────────────────
  server.tool(
    "swap_solana_quote",
    "Get a swap price quote on Solana using Jupiter. Returns expected output amount, price impact, and route info. No transaction data — use swap_solana_build to get an executable transaction.",
    {
      inputMint: z
        .string()
        .describe(
          'Token mint address to sell, or "SOL" for native SOL'
        ),
      outputMint: z
        .string()
        .describe(
          'Token mint address to buy, or "SOL" for native SOL'
        ),
      amount: z
        .string()
        .describe(
          'Amount to sell in human-readable units (e.g. "1.5" for 1.5 SOL)'
        ),
      inputDecimals: z
        .number()
        .int()
        .default(9)
        .describe(
          "Decimals of the input token (default: 9 for SOL). Set to 6 for USDC/USDT."
        ),
    },
    async ({ inputMint, outputMint, amount, inputDecimals }) => {
      try {
        const resolvedInputMint = resolveMint(inputMint);
        const resolvedOutputMint = resolveMint(outputMint);

        // Convert human amount to base units
        const rawAmount = BigInt(
          Math.round(parseFloat(amount) * 10 ** inputDecimals)
        ).toString();

        const quote = await getJupiterQuote({
          inputMint: resolvedInputMint,
          outputMint: resolvedOutputMint,
          amount: rawAmount,
        });

        const routeSummary = quote.routePlan.map(
          (step) =>
            `${step.swapInfo.label} (${step.percent}%): ${step.swapInfo.inAmount} → ${step.swapInfo.outAmount}`
        );

        return jsonResult({
          inputMint: resolvedInputMint,
          outputMint: resolvedOutputMint,
          inputAmount: amount,
          outputAmount: quote.outAmount,
          priceImpactPct: quote.priceImpactPct,
          slippageBps: quote.slippageBps,
          route: routeSummary,
        });
      } catch (error) {
        return errorResult(
          `Failed to get Jupiter quote: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // ── Build ───────────────────────────────────────────────────────────
  server.tool(
    "swap_solana_build",
    "Build an executable Solana swap transaction using Jupiter. Returns a base64-encoded serialized transaction for wallet_execute_solana_transaction.",
    {
      inputMint: z
        .string()
        .describe(
          'Token mint address to sell, or "SOL" for native SOL'
        ),
      outputMint: z
        .string()
        .describe(
          'Token mint address to buy, or "SOL" for native SOL'
        ),
      amount: z
        .string()
        .describe(
          'Amount to sell in human-readable units (e.g. "1.5" for 1.5 SOL)'
        ),
      inputDecimals: z
        .number()
        .int()
        .default(9)
        .describe(
          "Decimals of the input token (default: 9 for SOL). Set to 6 for USDC/USDT."
        ),
      userPublicKey: z
        .string()
        .describe("Solana wallet public key (base58-encoded)"),
      slippageBps: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(100)
        .describe("Slippage tolerance in basis points (default: 100 = 1%)"),
    },
    async ({
      inputMint,
      outputMint,
      amount,
      inputDecimals,
      userPublicKey,
      slippageBps,
    }) => {
      try {
        const resolvedInputMint = resolveMint(inputMint);
        const resolvedOutputMint = resolveMint(outputMint);

        // Convert human amount to base units
        const rawAmount = BigInt(
          Math.round(parseFloat(amount) * 10 ** inputDecimals)
        ).toString();

        // Step 1: Get quote
        const quote = await getJupiterQuote({
          inputMint: resolvedInputMint,
          outputMint: resolvedOutputMint,
          amount: rawAmount,
          slippageBps,
        });

        // Step 2: Build transaction
        const swap = await getJupiterSwap({
          quoteResponse: quote,
          userPublicKey,
        });

        const description = `Swap ${amount} ${inputMint === "SOL" ? "SOL" : resolvedInputMint.slice(0, 8) + "..."} for ~${quote.outAmount} ${outputMint === "SOL" ? "SOL" : resolvedOutputMint.slice(0, 8) + "..."}`;

        const payload: SolanaSwapPayload = {
          cluster: "solana-mainnet",
          serializedTransaction: swap.swapTransaction,
          description,
        };

        return jsonResult(payload);
      } catch (error) {
        return errorResult(
          `Failed to build Solana swap transaction: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}

function resolveMint(mint: string): string {
  if (mint.toUpperCase() === "SOL") return SOL_MINT;
  return mint;
}
