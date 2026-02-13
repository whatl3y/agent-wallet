import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { poolAbi } from "../abis/pool.js";
import {
  parseAmount,
  getTokenDecimals,
  jsonResult,
  errorResult,
  type TransactionPayload,
} from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerFlashLoanTools(server: McpServer) {
  // ── Flash Loan (multi-asset) ───────────────────────────────────────
  server.tool(
    "aave_flash_loan",
    "Build a multi-asset flash loan transaction. The receiver contract must implement IFlashLoanReceiver. interestRateModes: 0 = repay in same tx, 2 = open variable debt.",
    {
      chain: chainParam,
      receiverAddress: addressParam.describe(
        "Contract that will receive the flash loan and execute the callback"
      ),
      assets: z
        .array(addressParam)
        .min(1)
        .describe("Array of token addresses to borrow"),
      amounts: z
        .array(z.string())
        .min(1)
        .describe("Array of amounts in human-readable units, matching assets order"),
      interestRateModes: z
        .array(z.number().int().min(0).max(2))
        .min(1)
        .describe("Per-asset: 0 = no debt (repay same tx), 2 = open variable debt"),
      onBehalfOf: addressParam.describe(
        "Address that will incur debt if interestRateMode != 0"
      ),
      params: z
        .string()
        .default("0x")
        .describe("Arbitrary bytes to pass to the receiver callback (hex-encoded)"),
    },
    async ({
      chain,
      receiverAddress,
      assets,
      amounts,
      interestRateModes,
      onBehalfOf,
      params,
    }) => {
      try {
        if (assets.length !== amounts.length || assets.length !== interestRateModes.length) {
          return errorResult("assets, amounts, and interestRateModes must have the same length");
        }

        const config = getChainConfig(chain);

        const rawAmounts = await Promise.all(
          assets.map(async (asset, i) => {
            const decimals = await getTokenDecimals(chain, asset as `0x${string}`);
            return parseAmount(amounts[i], decimals);
          })
        );

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "flashLoan",
          args: [
            receiverAddress as `0x${string}`,
            assets as `0x${string}`[],
            rawAmounts,
            interestRateModes.map(BigInt),
            onBehalfOf as `0x${string}`,
            params as `0x${string}`,
            0,
          ],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Flash loan ${assets.length} asset(s) from AAVE V3`,
              to: config.aave.pool,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build flash loan transaction: ${e}`);
      }
    }
  );

  // ── Flash Loan Simple (single asset) ───────────────────────────────
  server.tool(
    "aave_flash_loan_simple",
    "Build a single-asset flash loan transaction. Simpler than multi-asset: no debt opening, no fee waiver.",
    {
      chain: chainParam,
      receiverAddress: addressParam.describe(
        "Contract that will receive the flash loan and execute the callback"
      ),
      asset: addressParam.describe("Token address to borrow"),
      amount: z.string().describe("Amount in human-readable units"),
      params: z
        .string()
        .default("0x")
        .describe("Arbitrary bytes to pass to the receiver callback (hex-encoded)"),
    },
    async ({ chain, receiverAddress, asset, amount, params }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, asset as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "flashLoanSimple",
          args: [
            receiverAddress as `0x${string}`,
            asset as `0x${string}`,
            rawAmount,
            params as `0x${string}`,
            0,
          ],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Flash loan ${amount} of asset from AAVE V3`,
              to: config.aave.pool,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build flash loan simple transaction: ${e}`);
      }
    }
  );
}
