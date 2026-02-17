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

export function registerSupplyTools(server: McpServer) {
  // ── Supply (lend) to a market ───────────────────────────────────────
  server.tool(
    "morpho_supply",
    "Build transaction(s) to supply (lend) tokens to a Morpho market. Returns approval + supply calldata. You earn interest on supplied tokens.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      loanToken: addressParam.describe("Loan token address (the token being supplied)"),
      collateralToken: addressParam.describe("Collateral token address for this market"),
      oracle: addressParam.describe("Oracle address for this market"),
      irm: addressParam.describe("IRM (interest rate model) address for this market"),
      lltv: z.string().describe("LLTV for this market (raw value from market details, e.g. '860000000000000000')"),
      amount: amountParam,
      onBehalfOf: addressParam.optional().describe("Address to receive the supply position (defaults to sender)"),
    },
    async ({ chain, sender, loanToken, collateralToken, oracle, irm, lltv, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, loanToken as `0x${string}`);
        const symbol = await getTokenSymbol(chain, loanToken as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);
        const recipient = (onBehalfOf ?? sender) as `0x${string}`;

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
          functionName: "supply",
          args: [marketParams, rawAmount, 0n, recipient, "0x"],
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Supply ${amount} ${symbol} to Morpho market`,
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
        return errorResult(`Failed to build supply transaction: ${e}`);
      }
    }
  );

  // ── Withdraw supplied assets ────────────────────────────────────────
  server.tool(
    "morpho_withdraw",
    "Build transaction to withdraw supplied (lent) assets from a Morpho market.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      loanToken: addressParam.describe("Loan token address"),
      collateralToken: addressParam.describe("Collateral token address for this market"),
      oracle: addressParam.describe("Oracle address for this market"),
      irm: addressParam.describe("IRM address for this market"),
      lltv: z.string().describe("LLTV for this market (raw value)"),
      amount: amountParam,
      receiver: addressParam.optional().describe("Address to receive the withdrawn tokens (defaults to sender)"),
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
          functionName: "withdraw",
          args: [marketParams, rawAmount, 0n, sender as `0x${string}`, to],
        });

        const payload: TransactionPayload = {
          chainId: config.chainId,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Withdraw ${amount} ${symbol} from Morpho market`,
              to: config.morpho.morpho,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build withdraw transaction: ${e}`);
      }
    }
  );

  // ── Supply Collateral ───────────────────────────────────────────────
  server.tool(
    "morpho_supply_collateral",
    "Build transaction(s) to supply collateral to a Morpho market. Required before borrowing.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      loanToken: addressParam.describe("Loan token address for this market"),
      collateralToken: addressParam.describe("Collateral token address (the token being deposited)"),
      oracle: addressParam.describe("Oracle address for this market"),
      irm: addressParam.describe("IRM address for this market"),
      lltv: z.string().describe("LLTV for this market (raw value)"),
      amount: amountParam.describe("Amount of collateral to supply"),
      onBehalfOf: addressParam.optional().describe("Address to receive the collateral position (defaults to sender)"),
    },
    async ({ chain, sender, loanToken, collateralToken, oracle, irm, lltv, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, collateralToken as `0x${string}`);
        const symbol = await getTokenSymbol(chain, collateralToken as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);
        const recipient = (onBehalfOf ?? sender) as `0x${string}`;

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        const approval = await buildApprovalIfNeeded(
          chain,
          collateralToken as `0x${string}`,
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
          functionName: "supplyCollateral",
          args: [marketParams, rawAmount, recipient, "0x"],
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Supply ${amount} ${symbol} as collateral to Morpho market`,
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
        return errorResult(`Failed to build supply collateral transaction: ${e}`);
      }
    }
  );

  // ── Withdraw Collateral ─────────────────────────────────────────────
  server.tool(
    "morpho_withdraw_collateral",
    "Build transaction to withdraw collateral from a Morpho market.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      loanToken: addressParam.describe("Loan token address for this market"),
      collateralToken: addressParam.describe("Collateral token address"),
      oracle: addressParam.describe("Oracle address for this market"),
      irm: addressParam.describe("IRM address for this market"),
      lltv: z.string().describe("LLTV for this market (raw value)"),
      amount: amountParam.describe("Amount of collateral to withdraw"),
      receiver: addressParam.optional().describe("Address to receive the withdrawn collateral (defaults to sender)"),
    },
    async ({ chain, sender, loanToken, collateralToken, oracle, irm, lltv, amount, receiver }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, collateralToken as `0x${string}`);
        const symbol = await getTokenSymbol(chain, collateralToken as `0x${string}`);
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
          functionName: "withdrawCollateral",
          args: [marketParams, rawAmount, sender as `0x${string}`, to],
        });

        const payload: TransactionPayload = {
          chainId: config.chainId,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Withdraw ${amount} ${symbol} collateral from Morpho market`,
              to: config.morpho.morpho,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build withdraw collateral transaction: ${e}`);
      }
    }
  );
}
