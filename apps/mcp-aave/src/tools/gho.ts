import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData, parseUnits } from "viem";
import { getChainConfig } from "../config/chains.js";
import { poolAbi } from "../abis/pool.js";
import {
  buildApprovalIfNeeded,
  jsonResult,
  errorResult,
  type TransactionStep,
  type TransactionPayload,
} from "../utils.js";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

/** GHO token address on Ethereum mainnet */
const GHO_ADDRESS = "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f" as const;
const GHO_DECIMALS = 18;

export function registerGhoTools(server: McpServer) {
  // ── Borrow GHO ─────────────────────────────────────────────────────
  server.tool(
    "aave_borrow_gho",
    "Build transaction to borrow (mint) GHO stablecoin from AAVE V3 on Ethereum. GHO is minted when borrowed, not withdrawn from a pool. Requires sufficient collateral.",
    {
      sender: addressParam.describe("Address that will send the transaction"),
      amount: z.string().describe("Amount of GHO to borrow (e.g. '10000')"),
      onBehalfOf: addressParam
        .optional()
        .describe("Address that incurs the debt (defaults to sender)"),
    },
    async ({ sender, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig("ethereum");
        const rawAmount = parseUnits(amount, GHO_DECIMALS);
        const debtor = (onBehalfOf ?? sender) as `0x${string}`;

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "borrow",
          args: [GHO_ADDRESS, rawAmount, 2n, 0, debtor],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Borrow (mint) ${amount} GHO from AAVE V3`,
              to: config.aave.pool,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build GHO borrow transaction: ${e}`);
      }
    }
  );

  // ── Repay GHO ──────────────────────────────────────────────────────
  server.tool(
    "aave_repay_gho",
    'Build transaction(s) to repay (burn) GHO debt on AAVE V3. Includes approval if needed. Use "max" for full debt.',
    {
      sender: addressParam.describe("Address that will send the transaction"),
      amount: z.string().describe('Amount of GHO to repay, or "max" for full debt'),
      onBehalfOf: addressParam
        .optional()
        .describe("Address whose debt to repay (defaults to sender)"),
    },
    async ({ sender, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig("ethereum");
        const rawAmount =
          amount.toLowerCase() === "max"
            ? 2n ** 256n - 1n
            : parseUnits(amount, GHO_DECIMALS);
        const debtor = (onBehalfOf ?? sender) as `0x${string}`;

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        const approval = await buildApprovalIfNeeded(
          "ethereum",
          GHO_ADDRESS,
          sender as `0x${string}`,
          config.aave.pool,
          rawAmount,
          "GHO"
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "repay",
          args: [GHO_ADDRESS, rawAmount, 2n, debtor],
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Repay ${amount} GHO debt on AAVE V3`,
          to: config.aave.pool,
          data,
          value: "0",
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions,
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build GHO repay transaction: ${e}`);
      }
    }
  );
}
