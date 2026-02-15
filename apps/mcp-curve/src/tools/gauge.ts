import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getPublicClient } from "../clients.js";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { gaugeAbi } from "../abis/gauge.js";
import { minterAbi } from "../abis/minter.js";
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

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerGaugeTools(server: McpServer) {
  // ── Stake LP Tokens ────────────────────────────────────────────────
  server.tool(
    "curve_stake_lp",
    'Build transaction(s) to stake Curve LP tokens in a gauge contract to earn CRV rewards (and any additional reward tokens). Requires approval of LP tokens to the gauge. Staking is how you earn CRV emissions on top of trading fee yield. Use curve_get_pool_info to find gauge and LP token addresses.',
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      gauge: addressParam.describe(
        "Gauge contract address (get from curve_get_pool_info)"
      ),
      lpToken: addressParam.describe("LP token address to stake"),
      amount: z
        .string()
        .describe(
          'Amount of LP tokens to stake (human-readable, 18 decimals) or "max" for entire balance'
        ),
    },
    async ({ chain, sender, gauge, lpToken, amount }) => {
      try {
        const config = getChainConfig(chain);
        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await getTokenBalance(
            chain,
            lpToken as `0x${string}`,
            sender as `0x${string}`
          );
          if (rawAmount === 0n) {
            return errorResult(
              "No LP tokens found in wallet to stake."
            );
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        // Build approval for LP token to gauge
        const approval = await buildApprovalIfNeeded(
          chain,
          lpToken as `0x${string}`,
          sender as `0x${string}`,
          gauge as `0x${string}`,
          rawAmount,
          "LP Token"
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        // Build gauge deposit call
        const data = encodeFunctionData({
          abi: gaugeAbi,
          functionName: "deposit",
          args: [rawAmount],
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Stake ${amount === "max" ? formatAmount(rawAmount, 18) : amount} LP tokens in Curve gauge`,
          to: gauge,
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

  // ── Unstake LP Tokens ──────────────────────────────────────────────
  server.tool(
    "curve_unstake_lp",
    'Build transaction to unstake (withdraw) LP tokens from a Curve gauge contract. Use amount "max" to unstake all. After unstaking, LP tokens return to your wallet and can be used with curve_remove_liquidity.',
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      gauge: addressParam.describe("Gauge contract address"),
      amount: z
        .string()
        .describe(
          'Amount of LP tokens to unstake (human-readable, 18 decimals) or "max"'
        ),
    },
    async ({ chain, sender, gauge, amount }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        // Resolve "max"
        let rawAmount: bigint;
        if (amount.toLowerCase() === "max") {
          rawAmount = await client.readContract({
            address: gauge as `0x${string}`,
            abi: gaugeAbi,
            functionName: "balanceOf",
            args: [sender as `0x${string}`],
          });
          if (rawAmount === 0n) {
            return errorResult("No LP tokens staked in this gauge.");
          }
        } else {
          rawAmount = parseAmount(amount, 18);
        }

        const data = encodeFunctionData({
          abi: gaugeAbi,
          functionName: "withdraw",
          args: [rawAmount],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Unstake ${amount === "max" ? formatAmount(rawAmount, 18) : amount} LP tokens from Curve gauge`,
              to: gauge,
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

  // ── Claim Rewards ──────────────────────────────────────────────────
  server.tool(
    "curve_claim_rewards",
    "Build transaction(s) to claim all pending CRV and additional reward tokens from a Curve gauge. On Ethereum mainnet, also calls the CRV Minter to claim CRV emissions.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      gauge: addressParam.describe("Gauge contract address"),
    },
    async ({ chain, sender, gauge }) => {
      try {
        const config = getChainConfig(chain);
        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // On Ethereum mainnet, CRV emissions require calling the Minter
        if (config.curve.minter) {
          const mintData = encodeFunctionData({
            abi: minterAbi,
            functionName: "mint",
            args: [gauge as `0x${string}`],
          });

          transactions.push({
            step: stepNum++,
            type: "action",
            description: "Claim CRV emissions from Minter",
            to: config.curve.minter,
            data: mintData,
            value: "0",
          });
        }

        // Claim additional reward tokens from the gauge
        const claimData = encodeFunctionData({
          abi: gaugeAbi,
          functionName: "claim_rewards",
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: "Claim reward tokens from Curve gauge",
          to: gauge,
          data: claimData,
          value: "0",
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions,
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build claim rewards transaction: ${e}`);
      }
    }
  );

  // ── Get Claimable Rewards ──────────────────────────────────────────
  server.tool(
    "curve_get_claimable_rewards",
    "Check how much CRV and other reward tokens are pending/claimable from a Curve gauge for a user.",
    {
      chain: chainParam,
      user: addressParam.describe("User wallet address"),
      gauge: addressParam.describe("Gauge contract address"),
    },
    async ({ chain, user, gauge }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        // Get staked balance
        const stakedBalance = await client.readContract({
          address: gauge as `0x${string}`,
          abi: gaugeAbi,
          functionName: "balanceOf",
          args: [user as `0x${string}`],
        });

        // Get reward token count
        let rewardCount = 0;
        try {
          const count = await client.readContract({
            address: gauge as `0x${string}`,
            abi: gaugeAbi,
            functionName: "reward_count",
          });
          rewardCount = Number(count);
        } catch {
          // Older gauges may not have reward_count
        }

        // Fetch each reward token and claimable amount
        const rewards: Array<{
          token: string;
          symbol: string;
          claimableAmount: string;
        }> = [];

        for (let i = 0; i < rewardCount; i++) {
          try {
            const tokenAddress = await client.readContract({
              address: gauge as `0x${string}`,
              abi: gaugeAbi,
              functionName: "reward_tokens",
              args: [BigInt(i)],
            });

            if (
              tokenAddress ===
              "0x0000000000000000000000000000000000000000"
            )
              break;

            const [claimable, symbol] = await Promise.all([
              client.readContract({
                address: gauge as `0x${string}`,
                abi: gaugeAbi,
                functionName: "claimable_reward",
                args: [
                  user as `0x${string}`,
                  tokenAddress as `0x${string}`,
                ],
              }),
              getTokenSymbol(chain, tokenAddress as `0x${string}`).catch(
                () => "UNKNOWN"
              ),
            ]);

            rewards.push({
              token: tokenAddress,
              symbol,
              claimableAmount: formatAmount(claimable, 18),
            });
          } catch {
            // Skip reward tokens that fail
          }
        }

        return jsonResult({
          chain,
          user,
          gauge,
          stakedBalance: formatAmount(stakedBalance, 18),
          rewardCount,
          rewards,
          hint:
            config.curve.minter
              ? "On Ethereum, CRV emissions are claimed via the Minter contract (handled by curve_claim_rewards)."
              : "On L2s/sidechains, CRV is distributed as a gauge reward token.",
        });
      } catch (e) {
        return errorResult(`Failed to get claimable rewards: ${e}`);
      }
    }
  );
}
