import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { SUPPORTED_CHAINS } from "../config/chains.js";
import { variableDebtTokenAbi } from "../abis/variable-debt-token.js";
import {
  parseAmount,
  getTokenDecimals,
  jsonResult,
  errorResult,
  type TransactionPayload,
} from "../utils.js";
import { getChainConfig } from "../config/chains.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerDelegationTools(server: McpServer) {
  server.tool(
    "aave_approve_delegation",
    "Build transaction to approve credit delegation on a variable debt token. Allows the delegatee to borrow up to the specified amount on behalf of the delegator.",
    {
      chain: chainParam,
      variableDebtToken: addressParam.describe(
        "Variable debt token address (get via aave_get_reserve_token_addresses)"
      ),
      delegatee: addressParam.describe("Address to grant borrowing rights to"),
      amount: z
        .string()
        .describe(
          'Maximum amount the delegatee can borrow, in human-readable units. Use "max" for unlimited.'
        ),
      underlyingAsset: addressParam.describe(
        "Underlying asset address (to resolve decimals)"
      ),
    },
    async ({ chain, variableDebtToken, delegatee, amount, underlyingAsset }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(
          chain,
          underlyingAsset as `0x${string}`
        );
        const rawAmount = parseAmount(amount, decimals);

        const data = encodeFunctionData({
          abi: variableDebtTokenAbi,
          functionName: "approveDelegation",
          args: [delegatee as `0x${string}`, rawAmount],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Approve credit delegation of ${amount} to ${delegatee}`,
              to: variableDebtToken,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build delegation approval transaction: ${e}`);
      }
    }
  );
}
