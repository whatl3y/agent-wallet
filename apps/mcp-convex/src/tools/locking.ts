import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getPublicClient } from "../clients.js";
import { CONVEX_CONTRACTS, CHAIN_ID } from "../config/contracts.js";
import { cvxLockerAbi } from "../abis/cvx-locker.js";
import { erc20Abi } from "../abis/erc20.js";
import {
  parseAmount,
  formatAmount,
  getTokenBalance,
  getTokenSymbol,
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

export function registerLockingTools(server: McpServer) {
  // ── Lock CVX (vlCVX) ──────────────────────────────────────────────
  server.tool(
    "convex_lock_cvx",
    'Build transaction(s) to lock CVX as vlCVX (vote-locked CVX) for 16+ weeks. Locking grants governance voting power over Curve gauge weights and earns platform fee rewards. CVX is locked for a minimum of 16 full epochs (~16 weeks). Requires CVX approval to the locker.',
    {
      sender: addressParam.describe("Address that will send the transaction"),
      amount: z
        .string()
        .describe(
          'Amount of CVX to lock (human-readable, 18 decimals) or "max"'
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
          CONVEX_CONTRACTS.cvxLocker,
          rawAmount,
          "CVX"
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        // lock(account, amount, spendRatio=0)
        const data = encodeFunctionData({
          abi: cvxLockerAbi,
          functionName: "lock",
          args: [sender as `0x${string}`, rawAmount, 0n],
        });

        const displayAmount =
          amount.toLowerCase() === "max"
            ? formatAmount(rawAmount, 18)
            : amount;

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Lock ${displayAmount} CVX as vlCVX (16-week minimum lock)`,
          to: CONVEX_CONTRACTS.cvxLocker,
          data,
          value: "0",
        });

        return jsonResult({
          chainId: CHAIN_ID,
          transactions,
          note: "CVX will be locked for 16 full epochs (~16 weeks). After expiry you can relock or withdraw via convex_process_expired_locks.",
        } as TransactionPayload & { note: string });
      } catch (e) {
        return errorResult(`Failed to build CVX lock transaction: ${e}`);
      }
    }
  );

  // ── Process Expired Locks ─────────────────────────────────────────
  server.tool(
    "convex_process_expired_locks",
    "Build transaction to process expired vlCVX locks. Choose to either relock (extend for another 16 weeks) or withdraw the expired CVX back to your wallet.",
    {
      sender: addressParam.describe("Address that will send the transaction"),
      relock: z
        .boolean()
        .describe(
          "true = relock expired CVX for another 16 weeks, false = withdraw to wallet"
        ),
    },
    async ({ sender, relock }) => {
      try {
        const data = encodeFunctionData({
          abi: cvxLockerAbi,
          functionName: "processExpiredLocks",
          args: [relock],
        });

        return jsonResult({
          chainId: CHAIN_ID,
          transactions: [
            {
              step: 1,
              type: "action",
              description: relock
                ? "Relock expired vlCVX for another 16 weeks"
                : "Withdraw expired vlCVX back to wallet as CVX",
              to: CONVEX_CONTRACTS.cvxLocker,
              data,
              value: "0",
            },
          ],
        } as TransactionPayload);
      } catch (e) {
        return errorResult(
          `Failed to build process expired locks transaction: ${e}`
        );
      }
    }
  );

  // ── Claim vlCVX Rewards ───────────────────────────────────────────
  server.tool(
    "convex_claim_vlcvx_rewards",
    "Build transaction to claim pending rewards from the vlCVX locker (platform fee revenue distributed to vote-locked CVX holders).",
    {
      sender: addressParam.describe("Address that will send the transaction"),
    },
    async ({ sender }) => {
      try {
        const data = encodeFunctionData({
          abi: cvxLockerAbi,
          functionName: "getReward(address)",
          args: [sender as `0x${string}`],
        });

        return jsonResult({
          chainId: CHAIN_ID,
          transactions: [
            {
              step: 1,
              type: "action",
              description: "Claim vlCVX locker rewards",
              to: CONVEX_CONTRACTS.cvxLocker,
              data,
              value: "0",
            },
          ],
        } as TransactionPayload);
      } catch (e) {
        return errorResult(
          `Failed to build vlCVX claim rewards transaction: ${e}`
        );
      }
    }
  );

  // ── Get vlCVX Info ────────────────────────────────────────────────
  server.tool(
    "convex_get_vlcvx_info",
    "Get a user's vlCVX (vote-locked CVX) position: locked balance, voting power, lock schedule with unlock times, and claimable rewards.",
    {
      user: addressParam.describe("User wallet address"),
    },
    async ({ user }) => {
      try {
        const client = getPublicClient();

        const [votingPower, lockedBalance, lockedBalances, claimableRewards, cvxWalletBalance] =
          await Promise.all([
            client.readContract({
              address: CONVEX_CONTRACTS.cvxLocker,
              abi: cvxLockerAbi,
              functionName: "balanceOf",
              args: [user as `0x${string}`],
            }),
            client.readContract({
              address: CONVEX_CONTRACTS.cvxLocker,
              abi: cvxLockerAbi,
              functionName: "lockedBalanceOf",
              args: [user as `0x${string}`],
            }),
            client.readContract({
              address: CONVEX_CONTRACTS.cvxLocker,
              abi: cvxLockerAbi,
              functionName: "lockedBalances",
              args: [user as `0x${string}`],
            }),
            client.readContract({
              address: CONVEX_CONTRACTS.cvxLocker,
              abi: cvxLockerAbi,
              functionName: "claimableRewards",
              args: [user as `0x${string}`],
            }),
            client.readContract({
              address: CONVEX_CONTRACTS.cvx,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [user as `0x${string}`],
            }),
          ]);

        // Parse lockedBalances result
        const [total, unlockable, locked, lockData] = lockedBalances as [
          bigint,
          bigint,
          bigint,
          Array<{ amount: bigint; unlockTime: number }>
        ];

        // Parse claimable rewards
        const rewards = (claimableRewards as Array<{ token: string; amount: bigint }>).map(
          (r) => ({
            token: r.token,
            amount: formatAmount(r.amount, 18),
          })
        );

        // Resolve reward token symbols
        const rewardsWithSymbols = await Promise.all(
          rewards.map(async (r) => {
            const symbol = await getTokenSymbol(
              r.token as `0x${string}`
            ).catch(() => "UNKNOWN");
            return { ...r, symbol };
          })
        );

        return jsonResult({
          user,
          cvxWalletBalance: formatAmount(cvxWalletBalance, 18),
          votingPower: formatAmount(votingPower as bigint, 18),
          totalLocked: formatAmount(total, 18),
          unlockable: formatAmount(unlockable, 18),
          currentlyLocked: formatAmount(locked, 18),
          locks: lockData.map((l) => ({
            amount: formatAmount(BigInt(l.amount), 18),
            unlockTime: new Date(Number(l.unlockTime) * 1000).toISOString(),
            isExpired: Number(l.unlockTime) < Math.floor(Date.now() / 1000),
          })),
          claimableRewards: rewardsWithSymbols,
          locker: CONVEX_CONTRACTS.cvxLocker,
        });
      } catch (e) {
        return errorResult(`Failed to get vlCVX info: ${e}`);
      }
    }
  );
}
