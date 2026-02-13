import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData, parseEther } from "viem";
import { getChainConfig } from "../config/chains.js";
import {
  buildApprovalIfNeeded,
  jsonResult,
  errorResult,
  type TransactionStep,
  type TransactionPayload,
} from "../utils.js";
import { stakedAaveAbi } from "../abis/staked-aave.js";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerStakingTools(server: McpServer) {
  // ── Stake AAVE ─────────────────────────────────────────────────────
  server.tool(
    "aave_stake",
    "Build transaction(s) to stake AAVE tokens in the Safety Module (stkAAVE). Includes approval if needed. Ethereum only.",
    {
      sender: addressParam.describe("Address that will send the transaction"),
      amount: z.string().describe("Amount of AAVE to stake in human-readable units"),
      onBehalfOf: addressParam
        .optional()
        .describe("Address to receive stkAAVE (defaults to sender)"),
    },
    async ({ sender, amount, onBehalfOf }) => {
      try {
        const config = getChainConfig("ethereum");
        if (!config.aave.stakedAave || !config.aave.aaveToken) {
          return errorResult("Staking not available: missing contract addresses");
        }

        const rawAmount = parseEther(amount);
        const recipient = (onBehalfOf ?? sender) as `0x${string}`;

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        const approval = await buildApprovalIfNeeded(
          "ethereum",
          config.aave.aaveToken,
          sender as `0x${string}`,
          config.aave.stakedAave,
          rawAmount,
          "AAVE"
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        const data = encodeFunctionData({
          abi: stakedAaveAbi,
          functionName: "stake",
          args: [recipient, rawAmount],
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Stake ${amount} AAVE in Safety Module`,
          to: config.aave.stakedAave,
          data,
          value: "0",
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions,
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build stake transaction: ${e}`);
      }
    }
  );

  // ── Cooldown ───────────────────────────────────────────────────────
  server.tool(
    "aave_cooldown",
    "Build transaction to activate the cooldown period for unstaking stkAAVE. Must wait for cooldown to complete before redeeming. Ethereum only.",
    {},
    async () => {
      try {
        const config = getChainConfig("ethereum");
        if (!config.aave.stakedAave) {
          return errorResult("Staking not available: missing contract address");
        }

        const data = encodeFunctionData({
          abi: stakedAaveAbi,
          functionName: "cooldown",
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: "Activate stkAAVE cooldown period",
              to: config.aave.stakedAave,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build cooldown transaction: ${e}`);
      }
    }
  );

  // ── Unstake (Redeem) ───────────────────────────────────────────────
  server.tool(
    "aave_unstake",
    'Build transaction to redeem (unstake) stkAAVE after cooldown period. Use "max" for full balance. Ethereum only.',
    {
      to: addressParam.describe("Recipient of the unstaked AAVE tokens"),
      amount: z
        .string()
        .describe('Amount of stkAAVE to redeem in human-readable units, or "max"'),
    },
    async ({ to, amount }) => {
      try {
        const config = getChainConfig("ethereum");
        if (!config.aave.stakedAave) {
          return errorResult("Staking not available: missing contract address");
        }

        const rawAmount =
          amount.toLowerCase() === "max"
            ? 2n ** 256n - 1n
            : parseEther(amount);

        const data = encodeFunctionData({
          abi: stakedAaveAbi,
          functionName: "redeem",
          args: [to as `0x${string}`, rawAmount],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Unstake ${amount} stkAAVE`,
              to: config.aave.stakedAave,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build unstake transaction: ${e}`);
      }
    }
  );

  // ── Claim Staking Rewards ──────────────────────────────────────────
  server.tool(
    "aave_claim_staking_rewards",
    'Build transaction to claim accrued AAVE rewards from stkAAVE. Use "max" to claim all. Ethereum only.',
    {
      to: addressParam.describe("Recipient of the claimed rewards"),
      amount: z
        .string()
        .describe('Amount of rewards to claim in human-readable units, or "max"'),
    },
    async ({ to, amount }) => {
      try {
        const config = getChainConfig("ethereum");
        if (!config.aave.stakedAave) {
          return errorResult("Staking not available: missing contract address");
        }

        const rawAmount =
          amount.toLowerCase() === "max"
            ? 2n ** 256n - 1n
            : parseEther(amount);

        const data = encodeFunctionData({
          abi: stakedAaveAbi,
          functionName: "claimRewards",
          args: [to as `0x${string}`, rawAmount],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Claim ${amount} AAVE staking rewards`,
              to: config.aave.stakedAave,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build claim rewards transaction: ${e}`);
      }
    }
  );
}
