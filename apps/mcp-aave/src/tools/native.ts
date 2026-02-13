import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData, parseEther } from "viem";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { wrappedTokenGatewayAbi } from "../abis/wrapped-token-gateway.js";
import { jsonResult, errorResult, type TransactionPayload } from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

const nativeAmountParam = z
  .string()
  .describe('Amount in native token units (e.g. "1.5" for 1.5 ETH)');

export function registerNativeTools(server: McpServer) {
  // ── Supply Native Token ────────────────────────────────────────────
  server.tool(
    "aave_supply_native",
    "Build transaction to supply native token (ETH/MATIC/AVAX) to AAVE V3 via the WrappedTokenGateway. The native token is automatically wrapped.",
    {
      chain: chainParam,
      amount: nativeAmountParam,
      onBehalfOf: addressParam.describe("Address to receive aTokens"),
    },
    async ({ chain, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig(chain);
        const rawAmount = parseEther(amount);

        const data = encodeFunctionData({
          abi: wrappedTokenGatewayAbi,
          functionName: "depositETH",
          args: [config.aave.pool, onBehalfOf as `0x${string}`, 0],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Supply ${amount} native token to AAVE V3 via gateway`,
              to: config.aave.wrappedTokenGateway,
              data,
              value: rawAmount.toString(),
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build native supply transaction: ${e}`);
      }
    }
  );

  // ── Withdraw Native Token ──────────────────────────────────────────
  server.tool(
    "aave_withdraw_native",
    'Build transaction to withdraw and unwrap native token from AAVE V3. Note: sender must first approve the gateway to spend their aWETH/aWMATIC/aWAVAX. Use "max" for full balance.',
    {
      chain: chainParam,
      amount: nativeAmountParam,
      to: addressParam.describe("Recipient of the native token"),
    },
    async ({ chain, amount, to }) => {
      try {
        const config = getChainConfig(chain);
        const rawAmount =
          amount.toLowerCase() === "max"
            ? 2n ** 256n - 1n
            : parseEther(amount);

        const data = encodeFunctionData({
          abi: wrappedTokenGatewayAbi,
          functionName: "withdrawETH",
          args: [config.aave.pool, rawAmount, to as `0x${string}`],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Withdraw ${amount} native token from AAVE V3 via gateway`,
              to: config.aave.wrappedTokenGateway,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build native withdraw transaction: ${e}`);
      }
    }
  );

  // ── Borrow Native Token ────────────────────────────────────────────
  server.tool(
    "aave_borrow_native",
    "Build transaction to borrow native token from AAVE V3. The WETH is borrowed and auto-unwrapped. Note: sender must first delegate credit to the gateway on the WETH variable debt token.",
    {
      chain: chainParam,
      amount: nativeAmountParam,
    },
    async ({ chain, amount }) => {
      try {
        const config = getChainConfig(chain);
        const rawAmount = parseEther(amount);

        const data = encodeFunctionData({
          abi: wrappedTokenGatewayAbi,
          functionName: "borrowETH",
          args: [config.aave.pool, rawAmount, 2n, 0],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Borrow ${amount} native token from AAVE V3 via gateway (variable rate)`,
              to: config.aave.wrappedTokenGateway,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build native borrow transaction: ${e}`);
      }
    }
  );

  // ── Repay Native Token ─────────────────────────────────────────────
  server.tool(
    "aave_repay_native",
    "Build transaction to repay debt with native token via the WrappedTokenGateway. The native token value is sent with the transaction.",
    {
      chain: chainParam,
      amount: nativeAmountParam,
      onBehalfOf: addressParam.describe("Address whose debt to repay"),
    },
    async ({ chain, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig(chain);
        const rawAmount = parseEther(amount);

        const data = encodeFunctionData({
          abi: wrappedTokenGatewayAbi,
          functionName: "repayETH",
          args: [config.aave.pool, rawAmount, 2n, onBehalfOf as `0x${string}`],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Repay ${amount} native token debt on AAVE V3 via gateway`,
              to: config.aave.wrappedTokenGateway,
              data,
              value: rawAmount.toString(),
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build native repay transaction: ${e}`);
      }
    }
  );
}
