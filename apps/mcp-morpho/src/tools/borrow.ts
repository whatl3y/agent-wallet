import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { SUPPORTED_CHAINS, getChainConfig } from "../config.js";
import { morphoAbi } from "../abis/morpho.js";
import {
  parseAmount,
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
  .describe("Target chain (ethereum, base, arbitrum)");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

const amountParam = z
  .string()
  .describe('Amount in human-readable units (e.g. "1000.5")');

export function registerBorrowTools(server: McpServer) {
  // ── Borrow ──────────────────────────────────────────────────────────
  server.tool(
    "morpho_borrow",
    "Build transaction to borrow tokens from a Morpho market against supplied collateral.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      loanToken: addressParam.describe("Loan token address (the token being borrowed)"),
      collateralToken: addressParam.describe("Collateral token address for this market"),
      oracle: addressParam.describe("Oracle address for this market"),
      irm: addressParam.describe("IRM address for this market"),
      lltv: z.string().describe("LLTV for this market (raw value)"),
      amount: amountParam,
      receiver: addressParam.optional().describe("Address to receive borrowed tokens (defaults to sender)"),
    },
    async ({ chain, sender, loanToken, collateralToken, oracle, irm, lltv, amount, receiver }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, loanToken as `0x${string}`);
        const symbol = await getTokenSymbol(chain, loanToken as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);
        const to = (receiver ?? sender) as `0x${string}`;

        const marketParams = {
          loanToken: loanToken as `0x${string}`,
          collateralToken: collateralToken as `0x${string}`,
          oracle: oracle as `0x${string}`,
          irm: irm as `0x${string}`,
          lltv: BigInt(lltv),
        };

        const data = encodeFunctionData({
          abi: morphoAbi,
          functionName: "borrow",
          args: [marketParams, rawAmount, 0n, sender as `0x${string}`, to],
        });

        const payload: TransactionPayload = {
          chainId: config.chainId,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Borrow ${amount} ${symbol} from Morpho market`,
              to: config.morpho.morpho,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build borrow transaction: ${e}`);
      }
    }
  );

  // ── Repay ───────────────────────────────────────────────────────────
  server.tool(
    "morpho_repay",
    "Build transaction(s) to repay borrowed tokens on a Morpho market. Returns approval + repay calldata.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      loanToken: addressParam.describe("Loan token address (the token being repaid)"),
      collateralToken: addressParam.describe("Collateral token address for this market"),
      oracle: addressParam.describe("Oracle address for this market"),
      irm: addressParam.describe("IRM address for this market"),
      lltv: z.string().describe("LLTV for this market (raw value)"),
      amount: amountParam,
      onBehalfOf: addressParam.optional().describe("Address whose debt to repay (defaults to sender)"),
    },
    async ({ chain, sender, loanToken, collateralToken, oracle, irm, lltv, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, loanToken as `0x${string}`);
        const symbol = await getTokenSymbol(chain, loanToken as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);
        const debtor = (onBehalfOf ?? sender) as `0x${string}`;

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        const approval = await buildApprovalIfNeeded(
          chain,
          loanToken as `0x${string}`,
          sender as `0x${string}`,
          config.morpho.morpho,
          rawAmount,
          symbol
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        const marketParams = {
          loanToken: loanToken as `0x${string}`,
          collateralToken: collateralToken as `0x${string}`,
          oracle: oracle as `0x${string}`,
          irm: irm as `0x${string}`,
          lltv: BigInt(lltv),
        };

        const data = encodeFunctionData({
          abi: morphoAbi,
          functionName: "repay",
          args: [marketParams, rawAmount, 0n, debtor, "0x"],
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Repay ${amount} ${symbol} on Morpho market`,
          to: config.morpho.morpho,
          data,
          value: "0",
        });

        const payload: TransactionPayload = {
          chainId: config.chainId,
          transactions,
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build repay transaction: ${e}`);
      }
    }
  );
}
