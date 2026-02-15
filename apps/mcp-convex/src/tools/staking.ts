import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getPublicClient } from "../clients.js";
import { CONVEX_CONTRACTS, CHAIN_ID } from "../config/contracts.js";
import { baseRewardPoolAbi } from "../abis/base-reward-pool.js";
import { crvDepositorAbi } from "../abis/crv-depositor.js";
import { cvxCrvStakingAbi } from "../abis/cvxcrv-staking.js";
import { erc20Abi } from "../abis/erc20.js";
import {
  parseAmount,
  formatAmount,
  getTokenBalance,
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

export function registerStakingTools(server: McpServer) {
  // ── Stake CVX ─────────────────────────────────────────────────────
  server.tool(
    "convex_stake_cvx",
    'Build transaction(s) to stake CVX tokens in the CVX reward pool. Staking CVX earns cvxCRV rewards (a share of Convex platform fees). Requires approval of CVX to the reward pool.',
    {
      sender: addressParam.describe("Address that will send the transaction"),
      amount: z
        .string()
        .describe(
          'Amount of CVX to stake (human-readable, 18 decimals) or "max"'
        ),
    },
    async ({ sender, amount }) => {
      try {
        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await getTokenBalance(
            CONVEX_CONTRACTS.cvx,
            sender as `0x${string}`
          );
          if (rawAmount === 0n) {
            return errorResult("No CVX tokens found in wallet.");
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        // Approval
        const approval = await buildApprovalIfNeeded(
          CONVEX_CONTRACTS.cvx,
          sender as `0x${string}`,
          CONVEX_CONTRACTS.cvxRewardPool,
          rawAmount,
          "CVX"
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        const data = encodeFunctionData({
          abi: baseRewardPoolAbi,
          functionName: "stake",
          args: [rawAmount],
        });

        const displayAmount =
          amount.toLowerCase() === "max"
            ? formatAmount(rawAmount, 18)
            : amount;

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Stake ${displayAmount} CVX in the reward pool`,
          to: CONVEX_CONTRACTS.cvxRewardPool,
          data,
          value: "0",
        });

        return jsonResult({
          chainId: CHAIN_ID,
          transactions,
        } as TransactionPayload);
      } catch (e) {
        return errorResult(`Failed to build CVX stake transaction: ${e}`);
      }
    }
  );

  // ── Unstake CVX ───────────────────────────────────────────────────
  server.tool(
    "convex_unstake_cvx",
    'Build transaction to unstake CVX from the reward pool. Optionally claims pending rewards at the same time.',
    {
      sender: addressParam.describe("Address that will send the transaction"),
      amount: z
        .string()
        .describe('Amount of CVX to unstake (human-readable, 18 decimals) or "max"'),
      claimRewards: z
        .boolean()
        .optional()
        .default(true)
        .describe("Also claim pending rewards (default: true)"),
    },
    async ({ sender, amount, claimRewards }) => {
      try {
        const client = getPublicClient();

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await client.readContract({
            address: CONVEX_CONTRACTS.cvxRewardPool,
            abi: baseRewardPoolAbi,
            functionName: "balanceOf",
            args: [sender as `0x${string}`],
          }) as bigint;
          if (rawAmount === 0n) {
            return errorResult("No CVX staked in the reward pool.");
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        const data = encodeFunctionData({
          abi: baseRewardPoolAbi,
          functionName: "withdraw",
          args: [rawAmount, claimRewards],
        });

        const displayAmount =
          amount.toLowerCase() === "max"
            ? formatAmount(rawAmount, 18)
            : amount;

        return jsonResult({
          chainId: CHAIN_ID,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Unstake ${displayAmount} CVX from reward pool${claimRewards ? " (claiming rewards)" : ""}`,
              to: CONVEX_CONTRACTS.cvxRewardPool,
              data,
              value: "0",
            },
          ],
        } as TransactionPayload);
      } catch (e) {
        return errorResult(`Failed to build CVX unstake transaction: ${e}`);
      }
    }
  );

  // ── Get CVX Staking Info ──────────────────────────────────────────
  server.tool(
    "convex_get_cvx_staking_info",
    "Get a user's CVX staking position: staked balance and pending cvxCRV rewards from the CVX reward pool.",
    {
      user: addressParam.describe("User wallet address"),
    },
    async ({ user }) => {
      try {
        const client = getPublicClient();

        const [staked, earned, walletBalance] = await Promise.all([
          client.readContract({
            address: CONVEX_CONTRACTS.cvxRewardPool,
            abi: baseRewardPoolAbi,
            functionName: "balanceOf",
            args: [user as `0x${string}`],
          }),
          client.readContract({
            address: CONVEX_CONTRACTS.cvxRewardPool,
            abi: baseRewardPoolAbi,
            functionName: "earned",
            args: [user as `0x${string}`],
          }),
          client.readContract({
            address: CONVEX_CONTRACTS.cvx,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [user as `0x${string}`],
          }),
        ]);

        return jsonResult({
          user,
          cvxWalletBalance: formatAmount(walletBalance, 18),
          cvxStaked: formatAmount(staked as bigint, 18),
          earnedCvxCrv: formatAmount(earned as bigint, 18),
          rewardPool: CONVEX_CONTRACTS.cvxRewardPool,
        });
      } catch (e) {
        return errorResult(`Failed to get CVX staking info: ${e}`);
      }
    }
  );

  // ── Convert CRV to cvxCRV ────────────────────────────────────────
  server.tool(
    "convex_convert_crv_to_cvxcrv",
    'Build transaction(s) to convert CRV tokens to cvxCRV (IRREVERSIBLE — one-way conversion). CRV is permanently locked as veCRV through Convex. Optionally auto-stake the resulting cvxCRV in the staking wrapper. WARNING: This cannot be undone — cvxCRV can only be traded on secondary markets.',
    {
      sender: addressParam.describe("Address that will send the transaction"),
      amount: z
        .string()
        .describe(
          'Amount of CRV to convert (human-readable, 18 decimals) or "max"'
        ),
      stakeResult: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Auto-stake resulting cvxCRV in the staking wrapper for rewards (default: true)"
        ),
    },
    async ({ sender, amount, stakeResult }) => {
      try {
        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await getTokenBalance(
            CONVEX_CONTRACTS.crv,
            sender as `0x${string}`
          );
          if (rawAmount === 0n) {
            return errorResult("No CRV tokens found in wallet.");
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        // Approval for CRV to CrvDepositor
        const approval = await buildApprovalIfNeeded(
          CONVEX_CONTRACTS.crv,
          sender as `0x${string}`,
          CONVEX_CONTRACTS.crvDepositor,
          rawAmount,
          "CRV"
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        // CrvDepositor.deposit(amount, lock=true, stakeAddress)
        // If staking, pass the cvxCRV staking wrapper address; otherwise address(0)
        const stakeAddress = stakeResult
          ? CONVEX_CONTRACTS.cvxCrvStaking
          : ("0x0000000000000000000000000000000000000000" as `0x${string}`);

        const data = encodeFunctionData({
          abi: crvDepositorAbi,
          functionName: "deposit",
          args: [rawAmount, true, stakeAddress],
        });

        const displayAmount =
          amount.toLowerCase() === "max"
            ? formatAmount(rawAmount, 18)
            : amount;

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Convert ${displayAmount} CRV → cvxCRV (IRREVERSIBLE)${stakeResult ? " and auto-stake for rewards" : ""}`,
          to: CONVEX_CONTRACTS.crvDepositor,
          data,
          value: "0",
        });

        return jsonResult({
          chainId: CHAIN_ID,
          transactions,
          warning:
            "This conversion is IRREVERSIBLE. CRV is permanently locked as veCRV through Convex. cvxCRV can only be traded on secondary markets (e.g. Curve cvxCRV/CRV pool).",
        } as TransactionPayload & { warning: string });
      } catch (e) {
        return errorResult(
          `Failed to build CRV→cvxCRV conversion transaction: ${e}`
        );
      }
    }
  );

  // ── Stake cvxCRV ──────────────────────────────────────────────────
  server.tool(
    "convex_stake_cvxcrv",
    'Build transaction(s) to stake cvxCRV tokens in the staking wrapper to earn CRV, CVX, and crvUSD rewards. The reward weight determines the split between CRV/CVX rewards and crvUSD fee revenue.',
    {
      sender: addressParam.describe("Address that will send the transaction"),
      amount: z
        .string()
        .describe(
          'Amount of cvxCRV to stake (human-readable, 18 decimals) or "max"'
        ),
    },
    async ({ sender, amount }) => {
      try {
        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await getTokenBalance(
            CONVEX_CONTRACTS.cvxCrv,
            sender as `0x${string}`
          );
          if (rawAmount === 0n) {
            return errorResult("No cvxCRV tokens found in wallet.");
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        // Approval
        const approval = await buildApprovalIfNeeded(
          CONVEX_CONTRACTS.cvxCrv,
          sender as `0x${string}`,
          CONVEX_CONTRACTS.cvxCrvStaking,
          rawAmount,
          "cvxCRV"
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        const data = encodeFunctionData({
          abi: cvxCrvStakingAbi,
          functionName: "stake",
          args: [rawAmount, sender as `0x${string}`],
        });

        const displayAmount =
          amount.toLowerCase() === "max"
            ? formatAmount(rawAmount, 18)
            : amount;

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Stake ${displayAmount} cvxCRV in the staking wrapper`,
          to: CONVEX_CONTRACTS.cvxCrvStaking,
          data,
          value: "0",
        });

        return jsonResult({
          chainId: CHAIN_ID,
          transactions,
        } as TransactionPayload);
      } catch (e) {
        return errorResult(`Failed to build cvxCRV stake transaction: ${e}`);
      }
    }
  );

  // ── Unstake cvxCRV ────────────────────────────────────────────────
  server.tool(
    "convex_unstake_cvxcrv",
    'Build transaction to unstake cvxCRV from the staking wrapper.',
    {
      sender: addressParam.describe("Address that will send the transaction"),
      amount: z
        .string()
        .describe(
          'Amount of cvxCRV to unstake (human-readable, 18 decimals) or "max"'
        ),
    },
    async ({ sender, amount }) => {
      try {
        const client = getPublicClient();

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await client.readContract({
            address: CONVEX_CONTRACTS.cvxCrvStaking,
            abi: cvxCrvStakingAbi,
            functionName: "balanceOf",
            args: [sender as `0x${string}`],
          }) as bigint;
          if (rawAmount === 0n) {
            return errorResult("No cvxCRV staked in the staking wrapper.");
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        const data = encodeFunctionData({
          abi: cvxCrvStakingAbi,
          functionName: "withdraw",
          args: [rawAmount],
        });

        const displayAmount =
          amount.toLowerCase() === "max"
            ? formatAmount(rawAmount, 18)
            : amount;

        return jsonResult({
          chainId: CHAIN_ID,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Unstake ${displayAmount} cvxCRV from staking wrapper`,
              to: CONVEX_CONTRACTS.cvxCrvStaking,
              data,
              value: "0",
            },
          ],
        } as TransactionPayload);
      } catch (e) {
        return errorResult(`Failed to build cvxCRV unstake transaction: ${e}`);
      }
    }
  );

  // ── Claim cvxCRV Staking Rewards ──────────────────────────────────
  server.tool(
    "convex_claim_cvxcrv_rewards",
    "Build transaction to claim pending rewards from the cvxCRV staking wrapper. Rewards include CRV, CVX, and crvUSD depending on reward weight setting.",
    {
      sender: addressParam.describe("Address that will send the transaction"),
    },
    async ({ sender }) => {
      try {
        const data = encodeFunctionData({
          abi: cvxCrvStakingAbi,
          functionName: "getReward",
          args: [sender as `0x${string}`],
        });

        return jsonResult({
          chainId: CHAIN_ID,
          transactions: [
            {
              step: 1,
              type: "action",
              description: "Claim rewards from cvxCRV staking wrapper",
              to: CONVEX_CONTRACTS.cvxCrvStaking,
              data,
              value: "0",
            },
          ],
        } as TransactionPayload);
      } catch (e) {
        return errorResult(
          `Failed to build cvxCRV claim rewards transaction: ${e}`
        );
      }
    }
  );

  // ── Get cvxCRV Staking Info ───────────────────────────────────────
  server.tool(
    "convex_get_cvxcrv_staking_info",
    "Get a user's cvxCRV staking position in the staking wrapper: staked balance, reward weight, and wallet balances for CRV and cvxCRV.",
    {
      user: addressParam.describe("User wallet address"),
    },
    async ({ user }) => {
      try {
        const client = getPublicClient();

        const [stakedBalance, rewardWeight, crvBalance, cvxCrvBalance] =
          await Promise.all([
            client.readContract({
              address: CONVEX_CONTRACTS.cvxCrvStaking,
              abi: cvxCrvStakingAbi,
              functionName: "balanceOf",
              args: [user as `0x${string}`],
            }),
            client.readContract({
              address: CONVEX_CONTRACTS.cvxCrvStaking,
              abi: cvxCrvStakingAbi,
              functionName: "userRewardWeight",
              args: [user as `0x${string}`],
            }),
            client.readContract({
              address: CONVEX_CONTRACTS.crv,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [user as `0x${string}`],
            }),
            client.readContract({
              address: CONVEX_CONTRACTS.cvxCrv,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [user as `0x${string}`],
            }),
          ]);

        return jsonResult({
          user,
          cvxCrvStaked: formatAmount(stakedBalance as bigint, 18),
          rewardWeight: Number(rewardWeight).toString(),
          rewardWeightDescription:
            "Weight 0 = 100% CRV/CVX rewards, Weight 10000 = 100% crvUSD fee revenue. Values between for a mix.",
          crvWalletBalance: formatAmount(crvBalance, 18),
          cvxCrvWalletBalance: formatAmount(cvxCrvBalance, 18),
          stakingWrapper: CONVEX_CONTRACTS.cvxCrvStaking,
        });
      } catch (e) {
        return errorResult(`Failed to get cvxCRV staking info: ${e}`);
      }
    }
  );
}
