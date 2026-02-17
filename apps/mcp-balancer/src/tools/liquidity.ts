import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  AddLiquidity,
  AddLiquidityKind,
  RemoveLiquidity,
  RemoveLiquidityKind,
  BalancerApi,
  Slippage,
  type AddLiquidityInput,
  type AddLiquidityQueryOutput,
  type RemoveLiquidityInput,
  type RemoveLiquidityQueryOutput,
  InputAmount,
} from "@balancer/sdk";
import { parseUnits } from "viem";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import {
  getTokenDecimals,
  getTokenSymbol,
  buildApprovalIfNeeded,
  formatAmount,
  parseAmount,
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

export function registerLiquidityTools(server: McpServer) {
  // ── Add Liquidity Quote ────────────────────────────────────────────
  server.tool(
    "balancer_add_liquidity_quote",
    "Get a quote for adding liquidity to a Balancer V3 pool. Supports unbalanced deposits (specify amounts per token) and single-token deposits. Returns expected BPT (Balancer Pool Token) output and price impact.",
    {
      chain: chainParam,
      pool: addressParam.describe(
        "Pool contract address (get from balancer_get_pools)"
      ),
      amountsIn: z
        .array(
          z.object({
            token: addressParam.describe("Token address"),
            amount: z.string().describe("Amount in human-readable units"),
          })
        )
        .describe(
          "Token amounts to deposit. For single-token deposit, provide one entry. For unbalanced, provide amounts for each token you want to deposit."
        ),
    },
    async ({ chain, pool, amountsIn }) => {
      try {
        const config = getChainConfig(chain);
        const rpcUrl = process.env[config.rpcEnvVar];
        if (!rpcUrl) {
          return errorResult(`Missing RPC URL: set ${config.rpcEnvVar}`);
        }

        // Fetch pool state from Balancer API
        const balancerApi = new BalancerApi(
          "https://api-v3.balancer.fi",
          config.balancer.sdkChainId
        );
        const poolState = await balancerApi.pools.fetchPoolState(pool);

        // Resolve token decimals and symbols
        const tokenInfos = await Promise.all(
          amountsIn.map(async (a) => {
            const [decimals, symbol] = await Promise.all([
              getTokenDecimals(chain, a.token as `0x${string}`),
              getTokenSymbol(chain, a.token as `0x${string}`),
            ]);
            return { ...a, decimals, symbol };
          })
        );

        // Build input amounts
        const inputAmounts: InputAmount[] = tokenInfos.map((t) => ({
          address: t.token as `0x${string}`,
          rawAmount: parseUnits(t.amount, t.decimals),
          decimals: t.decimals,
        }));

        // Always use Unbalanced kind — works with any number of tokens
        const addLiquidityInput: AddLiquidityInput = {
          chainId: config.balancer.sdkChainId,
          rpcUrl,
          kind: AddLiquidityKind.Unbalanced,
          amountsIn: inputAmounts,
        };

        // Query on-chain
        const addLiquidity = new AddLiquidity();
        const queryResult: AddLiquidityQueryOutput =
          await addLiquidity.query(addLiquidityInput, poolState);

        return jsonResult({
          chain,
          pool,
          kind: "unbalanced",
          tokensIn: tokenInfos.map((t) => ({
            symbol: t.symbol,
            address: t.token,
            amount: t.amount,
          })),
          expectedBptOut: formatAmount(queryResult.bptOut.amount, 18),
        });
      } catch (e) {
        return errorResult(`Failed to get add liquidity quote: ${e}`);
      }
    }
  );

  // ── Add Liquidity Build ────────────────────────────────────────────
  server.tool(
    "balancer_add_liquidity_build",
    "Build a transaction to add liquidity to a Balancer V3 pool. Supports unbalanced and single-token deposits. Returns transaction calldata with token approvals.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      pool: addressParam.describe(
        "Pool contract address (get from balancer_get_pools)"
      ),
      amountsIn: z
        .array(
          z.object({
            token: addressParam.describe("Token address"),
            amount: z.string().describe("Amount in human-readable units"),
          })
        )
        .describe("Token amounts to deposit"),
      slippageBps: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .optional()
        .default(50)
        .describe("Slippage tolerance in basis points (default: 50 = 0.5%)"),
    },
    async ({ chain, sender, pool, amountsIn, slippageBps }) => {
      try {
        const config = getChainConfig(chain);
        const rpcUrl = process.env[config.rpcEnvVar];
        if (!rpcUrl) {
          return errorResult(`Missing RPC URL: set ${config.rpcEnvVar}`);
        }

        // Fetch pool state
        const balancerApi = new BalancerApi(
          "https://api-v3.balancer.fi",
          config.balancer.sdkChainId
        );
        const poolState = await balancerApi.pools.fetchPoolState(pool);

        // Resolve token info
        const tokenInfos = await Promise.all(
          amountsIn.map(async (a) => {
            const [decimals, symbol] = await Promise.all([
              getTokenDecimals(chain, a.token as `0x${string}`),
              getTokenSymbol(chain, a.token as `0x${string}`),
            ]);
            return { ...a, decimals, symbol };
          })
        );

        // Build input amounts
        const inputAmounts: InputAmount[] = tokenInfos.map((t) => ({
          address: t.token as `0x${string}`,
          rawAmount: parseUnits(t.amount, t.decimals),
          decimals: t.decimals,
        }));

        // Always use Unbalanced kind — works with any number of tokens
        const addLiquidityInput: AddLiquidityInput = {
          chainId: config.balancer.sdkChainId,
          rpcUrl,
          kind: AddLiquidityKind.Unbalanced,
          amountsIn: inputAmounts,
        };

        // Query and build
        const addLiquidity = new AddLiquidity();
        const queryResult = await addLiquidity.query(
          addLiquidityInput,
          poolState
        );

        const slippagePercent = slippageBps / 100;
        const slippage = Slippage.fromPercentage(
          `${slippagePercent}` as `${number}`
        );

        const callData = addLiquidity.buildCall({
          ...queryResult,
          slippage,
          sender: sender as `0x${string}`,
          recipient: sender as `0x${string}`,
          wethIsEth: false,
        });

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Build approvals for each token to the Vault
        for (const t of tokenInfos) {
          const rawAmount = parseUnits(t.amount, t.decimals);
          const approval = await buildApprovalIfNeeded(
            chain,
            t.token as `0x${string}`,
            sender as `0x${string}`,
            config.balancer.vault,
            rawAmount,
            t.symbol
          );
          if (approval) {
            approval.step = stepNum++;
            transactions.push(approval);
          }
        }

        // Build the add liquidity transaction
        const tokenDescriptions = tokenInfos
          .map((t) => `${t.amount} ${t.symbol}`)
          .join(" + ");

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Add ${tokenDescriptions} liquidity to Balancer V3 pool for ~${formatAmount(queryResult.bptOut.amount, 18)} BPT`,
          to: callData.to,
          data: callData.callData,
          value: callData.value.toString(),
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions,
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build add liquidity transaction: ${e}`);
      }
    }
  );

  // ── Remove Liquidity Quote ─────────────────────────────────────────
  server.tool(
    "balancer_remove_liquidity_quote",
    "Get a quote for removing liquidity from a Balancer V3 pool. Supports proportional removal (get all tokens back) or single-token removal. Returns expected token amounts.",
    {
      chain: chainParam,
      pool: addressParam.describe(
        "Pool contract address (get from balancer_get_pools)"
      ),
      bptAmount: z
        .string()
        .describe(
          "Amount of BPT (Balancer Pool Token) to burn, in human-readable units"
        ),
      kind: z
        .enum(["proportional", "single_token"])
        .optional()
        .default("proportional")
        .describe("Removal type: proportional (default) or single_token"),
      tokenOut: addressParam
        .optional()
        .describe(
          "Token address to receive (required for single_token removal)"
        ),
    },
    async ({ chain, pool, bptAmount, kind, tokenOut }) => {
      try {
        const config = getChainConfig(chain);
        const rpcUrl = process.env[config.rpcEnvVar];
        if (!rpcUrl) {
          return errorResult(`Missing RPC URL: set ${config.rpcEnvVar}`);
        }

        if (kind === "single_token" && !tokenOut) {
          return errorResult(
            "tokenOut is required for single_token removal"
          );
        }

        // Fetch pool state
        const balancerApi = new BalancerApi(
          "https://api-v3.balancer.fi",
          config.balancer.sdkChainId
        );
        const poolState = await balancerApi.pools.fetchPoolState(pool);

        const bptRawAmount = parseUnits(bptAmount, 18);

        const removeLiquidityInput: RemoveLiquidityInput =
          kind === "single_token"
            ? {
                chainId: config.balancer.sdkChainId,
                rpcUrl,
                kind: RemoveLiquidityKind.SingleTokenExactIn,
                bptIn: {
                  address: pool as `0x${string}`,
                  rawAmount: bptRawAmount,
                  decimals: 18,
                },
                tokenOut: tokenOut as `0x${string}`,
              }
            : {
                chainId: config.balancer.sdkChainId,
                rpcUrl,
                kind: RemoveLiquidityKind.Proportional,
                bptIn: {
                  address: pool as `0x${string}`,
                  rawAmount: bptRawAmount,
                  decimals: 18,
                },
              };

        const removeLiquidity = new RemoveLiquidity();
        const queryResult: RemoveLiquidityQueryOutput =
          await removeLiquidity.query(removeLiquidityInput, poolState);

        // Resolve token symbols for output
        const tokenOutputs = await Promise.all(
          queryResult.amountsOut.map(async (a) => {
            const symbol = await getTokenSymbol(
              chain,
              a.token.address as `0x${string}`
            );
            return {
              symbol,
              address: a.token.address,
              amount: formatAmount(a.amount, a.token.decimals),
            };
          })
        );

        return jsonResult({
          chain,
          pool,
          kind,
          bptIn: bptAmount,
          tokensOut: tokenOutputs,
        });
      } catch (e) {
        return errorResult(`Failed to get remove liquidity quote: ${e}`);
      }
    }
  );

  // ── Remove Liquidity Build ─────────────────────────────────────────
  server.tool(
    "balancer_remove_liquidity_build",
    "Build a transaction to remove liquidity from a Balancer V3 pool. Supports proportional and single-token removal. Returns transaction calldata.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      pool: addressParam.describe(
        "Pool contract address (get from balancer_get_pools)"
      ),
      bptAmount: z
        .string()
        .describe(
          'Amount of BPT to burn, in human-readable units. Use "max" for full withdrawal.'
        ),
      kind: z
        .enum(["proportional", "single_token"])
        .optional()
        .default("proportional")
        .describe("Removal type: proportional (default) or single_token"),
      tokenOut: addressParam
        .optional()
        .describe(
          "Token address to receive (required for single_token removal)"
        ),
      slippageBps: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .optional()
        .default(50)
        .describe("Slippage tolerance in basis points (default: 50 = 0.5%)"),
    },
    async ({ chain, sender, pool, bptAmount, kind, tokenOut, slippageBps }) => {
      try {
        const config = getChainConfig(chain);
        const rpcUrl = process.env[config.rpcEnvVar];
        if (!rpcUrl) {
          return errorResult(`Missing RPC URL: set ${config.rpcEnvVar}`);
        }

        if (kind === "single_token" && !tokenOut) {
          return errorResult(
            "tokenOut is required for single_token removal"
          );
        }

        // Fetch pool state
        const balancerApi = new BalancerApi(
          "https://api-v3.balancer.fi",
          config.balancer.sdkChainId
        );
        const poolState = await balancerApi.pools.fetchPoolState(pool);

        const bptRawAmount = parseAmount(bptAmount, 18);

        const removeLiquidityInput: RemoveLiquidityInput =
          kind === "single_token"
            ? {
                chainId: config.balancer.sdkChainId,
                rpcUrl,
                kind: RemoveLiquidityKind.SingleTokenExactIn,
                bptIn: {
                  address: pool as `0x${string}`,
                  rawAmount: bptRawAmount,
                  decimals: 18,
                },
                tokenOut: tokenOut as `0x${string}`,
              }
            : {
                chainId: config.balancer.sdkChainId,
                rpcUrl,
                kind: RemoveLiquidityKind.Proportional,
                bptIn: {
                  address: pool as `0x${string}`,
                  rawAmount: bptRawAmount,
                  decimals: 18,
                },
              };

        const removeLiquidity = new RemoveLiquidity();
        const queryResult = await removeLiquidity.query(
          removeLiquidityInput,
          poolState
        );

        const slippagePercent = slippageBps / 100;
        const slippage = Slippage.fromPercentage(
          `${slippagePercent}` as `${number}`
        );

        const callData = removeLiquidity.buildCall({
          ...queryResult,
          slippage,
          sender: sender as `0x${string}`,
          recipient: sender as `0x${string}`,
          wethIsEth: false,
        });

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // BPT approval to the Router for removal
        const approval = await buildApprovalIfNeeded(
          chain,
          pool as `0x${string}`,
          sender as `0x${string}`,
          config.balancer.router,
          bptRawAmount,
          "BPT"
        );
        if (approval) {
          approval.step = stepNum++;
          transactions.push(approval);
        }

        // Resolve output token symbols
        const tokenOutputs = await Promise.all(
          queryResult.amountsOut.map(async (a) => {
            const symbol = await getTokenSymbol(
              chain,
              a.token.address as `0x${string}`
            );
            return `~${formatAmount(a.amount, a.token.decimals)} ${symbol}`;
          })
        );

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Remove ${bptAmount} BPT from Balancer V3 pool for ${tokenOutputs.join(" + ")}`,
          to: callData.to,
          data: callData.callData,
          value: callData.value.toString(),
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions,
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(
          `Failed to build remove liquidity transaction: ${e}`
        );
      }
    }
  );
}
