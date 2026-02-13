import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { poolAbi } from "../abis/pool.js";
import { jsonResult, errorResult, type TransactionPayload } from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerCollateralTools(server: McpServer) {
  // ── Set Asset as Collateral ────────────────────────────────────────
  server.tool(
    "aave_set_collateral",
    "Build transaction to enable or disable a supplied asset as collateral. Disabling may fail if it would make the position undercollateralized.",
    {
      chain: chainParam,
      asset: addressParam.describe("Reserve token address"),
      useAsCollateral: z.boolean().describe("true to enable, false to disable"),
    },
    async ({ chain, asset, useAsCollateral }) => {
      try {
        const config = getChainConfig(chain);
        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "setUserUseReserveAsCollateral",
          args: [asset as `0x${string}`, useAsCollateral],
        });

        const action = useAsCollateral ? "Enable" : "Disable";
        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `${action} asset as collateral on AAVE V3`,
              to: config.aave.pool,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build set-collateral transaction: ${e}`);
      }
    }
  );

  // ── Set eMode ──────────────────────────────────────────────────────
  server.tool(
    "aave_set_emode",
    "Build transaction to set the user's efficiency mode category. Use 0 to disable eMode. Higher LTV for correlated assets.",
    {
      chain: chainParam,
      categoryId: z
        .number()
        .int()
        .min(0)
        .max(255)
        .describe("eMode category ID (0 = disabled)"),
    },
    async ({ chain, categoryId }) => {
      try {
        const config = getChainConfig(chain);
        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "setUserEMode",
          args: [categoryId],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description:
                categoryId === 0
                  ? "Disable efficiency mode on AAVE V3"
                  : `Set efficiency mode to category ${categoryId} on AAVE V3`,
              to: config.aave.pool,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build set-eMode transaction: ${e}`);
      }
    }
  );
}
