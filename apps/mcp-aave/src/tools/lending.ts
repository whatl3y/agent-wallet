import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { poolAbi } from "../abis/pool.js";
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
  .describe("Target chain");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

const amountParam = z
  .string()
  .describe('Amount in human-readable units (e.g. "1000.5") or "max" for maximum');

export function registerLendingTools(server: McpServer) {
  // ── Supply ─────────────────────────────────────────────────────────
  server.tool(
    "aave_supply",
    "Build transaction(s) to supply (deposit) an ERC20 token into AAVE V3. Returns approval + supply calldata.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      asset: addressParam.describe("Token address to supply"),
      amount: amountParam,
      onBehalfOf: addressParam
        .optional()
        .describe("Address to receive aTokens (defaults to sender)"),
    },
    async ({ chain, sender, asset, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, asset as `0x${string}`);
        const symbol = await getTokenSymbol(chain, asset as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);
        const recipient = (onBehalfOf ?? sender) as `0x${string}`;

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        const approval = await buildApprovalIfNeeded(
          chain,
          asset as `0x${string}`,
          sender as `0x${string}`,
          config.aave.pool,
          rawAmount,
          symbol
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "supply",
          args: [asset as `0x${string}`, rawAmount, recipient, 0],
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Supply ${amount} ${symbol} to AAVE V3`,
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
        return errorResult(`Failed to build supply transaction: ${e}`);
      }
    }
  );

  // ── Withdraw ───────────────────────────────────────────────────────
  server.tool(
    "aave_withdraw",
    'Build transaction to withdraw a supplied asset from AAVE V3. Use amount "max" to withdraw entire balance.',
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      asset: addressParam.describe("Underlying token address to withdraw"),
      amount: amountParam,
      to: addressParam
        .optional()
        .describe("Recipient of withdrawn tokens (defaults to sender)"),
    },
    async ({ chain, sender, asset, amount, to }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, asset as `0x${string}`);
        const symbol = await getTokenSymbol(chain, asset as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);
        const recipient = (to ?? sender) as `0x${string}`;

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "withdraw",
          args: [asset as `0x${string}`, rawAmount, recipient],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Withdraw ${amount} ${symbol} from AAVE V3`,
              to: config.aave.pool,
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

  // ── Borrow ─────────────────────────────────────────────────────────
  server.tool(
    "aave_borrow",
    "Build transaction to borrow an asset from AAVE V3 against supplied collateral. Uses variable rate.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      asset: addressParam.describe("Token address to borrow"),
      amount: amountParam,
      onBehalfOf: addressParam
        .optional()
        .describe("Address that will incur the debt (defaults to sender, requires credit delegation if different)"),
    },
    async ({ chain, sender, asset, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, asset as `0x${string}`);
        const symbol = await getTokenSymbol(chain, asset as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);
        const debtor = (onBehalfOf ?? sender) as `0x${string}`;

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "borrow",
          args: [asset as `0x${string}`, rawAmount, 2n, 0, debtor],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Borrow ${amount} ${symbol} from AAVE V3 (variable rate)`,
              to: config.aave.pool,
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

  // ── Repay ──────────────────────────────────────────────────────────
  server.tool(
    "aave_repay",
    'Build transaction(s) to repay borrowed assets on AAVE V3. Use amount "max" to repay entire debt.',
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      asset: addressParam.describe("Token address to repay"),
      amount: amountParam,
      onBehalfOf: addressParam
        .optional()
        .describe("Address whose debt to repay (defaults to sender)"),
    },
    async ({ chain, sender, asset, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, asset as `0x${string}`);
        const symbol = await getTokenSymbol(chain, asset as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);
        const debtor = (onBehalfOf ?? sender) as `0x${string}`;

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        const approval = await buildApprovalIfNeeded(
          chain,
          asset as `0x${string}`,
          sender as `0x${string}`,
          config.aave.pool,
          rawAmount,
          symbol
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "repay",
          args: [asset as `0x${string}`, rawAmount, 2n, debtor],
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Repay ${amount} ${symbol} on AAVE V3`,
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
        return errorResult(`Failed to build repay transaction: ${e}`);
      }
    }
  );

  // ── Repay With aTokens ─────────────────────────────────────────────
  server.tool(
    "aave_repay_with_atokens",
    "Build transaction to repay debt by burning aTokens directly (no need for underlying tokens).",
    {
      chain: chainParam,
      asset: addressParam.describe("Underlying token address of the debt to repay"),
      amount: amountParam,
    },
    async ({ chain, asset, amount }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, asset as `0x${string}`);
        const symbol = await getTokenSymbol(chain, asset as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);

        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "repayWithATokens",
          args: [asset as `0x${string}`, rawAmount, 2n],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Repay ${amount} ${symbol} debt using aTokens`,
              to: config.aave.pool,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build repay-with-aTokens transaction: ${e}`);
      }
    }
  );
}
