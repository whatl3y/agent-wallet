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

export function registerLiquidationTools(server: McpServer) {
  server.tool(
    "aave_liquidation_call",
    "Build transaction to liquidate an undercollateralized position (health factor < 1). Caller repays debt and receives collateral + bonus. Requires debt asset approval.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will execute the liquidation"),
      collateralAsset: addressParam.describe(
        "Token address the liquidator will receive as collateral"
      ),
      debtAsset: addressParam.describe("Token address of the debt being repaid"),
      user: addressParam.describe("Address of the borrower being liquidated"),
      debtToCover: z
        .string()
        .describe(
          'Amount of debt to repay in human-readable units. Up to 50% of debt (100% if health factor < 0.95). Use "max" for maximum allowed.'
        ),
      receiveAToken: z
        .boolean()
        .default(false)
        .describe("true = receive aTokens, false = receive underlying collateral"),
    },
    async ({ chain, sender, collateralAsset, debtAsset, user, debtToCover, receiveAToken }) => {
      try {
        const config = getChainConfig(chain);
        const decimals = await getTokenDecimals(chain, debtAsset as `0x${string}`);
        const symbol = await getTokenSymbol(chain, debtAsset as `0x${string}`);
        const rawAmount = parseAmount(debtToCover, decimals);

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        const approval = await buildApprovalIfNeeded(
          chain,
          debtAsset as `0x${string}`,
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
          functionName: "liquidationCall",
          args: [
            collateralAsset as `0x${string}`,
            debtAsset as `0x${string}`,
            user as `0x${string}`,
            rawAmount,
            receiveAToken,
          ],
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Liquidate position: repay ${debtToCover} ${symbol} debt, receive collateral`,
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
        return errorResult(`Failed to build liquidation transaction: ${e}`);
      }
    }
  );
}
