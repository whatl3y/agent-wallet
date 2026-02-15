import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getArbitrumPublicClient,
  isHyperliquidTestnet,
} from "../clients.js";
import { jsonResult, errorResult } from "../utils.js";
import { erc20Abi } from "../abis/erc20.js";
import {
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "../constants.js";
import { parseUnits, formatUnits } from "viem";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerBridgeTools(server: McpServer) {
  // ── Deposit USDC from Arbitrum into Hyperliquid ─────────────────
  server.tool(
    "hl_deposit",
    "Prepare a USDC deposit from Arbitrum One into Hyperliquid. Returns an action descriptor that must be signed and submitted separately. Minimum deposit is 5 USDC.",
    {
      sender: addressParam.describe("The wallet address depositing USDC (must hold USDC on Arbitrum)"),
      amount: z
        .string()
        .describe("Amount of USDC to deposit (e.g. '100' for 100 USDC)"),
    },
    async ({ sender, amount }) => {
      try {
        const amountRaw = parseUnits(amount, USDC_DECIMALS);

        if (amountRaw < parseUnits("5", USDC_DECIMALS)) {
          return errorResult("Minimum deposit is 5 USDC");
        }

        // Check USDC balance on Arbitrum
        const publicClient = getArbitrumPublicClient();
        const balance = await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [sender as `0x${string}`],
        });

        if ((balance as bigint) < amountRaw) {
          return errorResult(
            `Insufficient USDC on Arbitrum. Have ${formatUnits(balance as bigint, USDC_DECIMALS)}, need ${amount}`
          );
        }

        return jsonResult({
          action: "hl_deposit",
          isTestnet: isHyperliquidTestnet(),
          params: {
            sender,
            amount,
            amountRaw: amountRaw.toString(),
          },
          summary: {
            action: "deposit",
            amount,
            token: "USDC",
            from: "Arbitrum",
            to: "Hyperliquid",
          },
        });
      } catch (e) {
        return errorResult(
          `Failed to prepare deposit: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  );

  // ── Withdraw USDC from Hyperliquid to Arbitrum ──────────────────
  server.tool(
    "hl_withdraw",
    "Prepare a USDC withdrawal from Hyperliquid to an Arbitrum address. Returns an action descriptor that must be signed and submitted separately.",
    {
      destination: addressParam.describe("Arbitrum destination address for the withdrawal"),
      amount: z
        .string()
        .describe("Amount of USDC to withdraw (e.g. '100' for 100 USDC)"),
    },
    async ({ destination, amount }) => {
      try {
        return jsonResult({
          action: "hl_withdraw",
          isTestnet: isHyperliquidTestnet(),
          params: {
            destination,
            amount,
          },
          summary: {
            action: "withdraw",
            amount,
            token: "USDC",
            from: "Hyperliquid",
            to: "Arbitrum",
            destination,
          },
        });
      } catch (e) {
        return errorResult(
          `Failed to prepare withdrawal: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  );

  // ── Transfer USDC between Spot and Perp accounts ────────────────
  server.tool(
    "hl_transfer",
    "Prepare a USDC transfer between Hyperliquid Spot and Perp accounts. Returns an action descriptor that must be signed and submitted separately.",
    {
      amount: z
        .string()
        .describe("Amount of USDC to transfer (e.g. '100' for 100 USDC)"),
      toPerp: z
        .boolean()
        .describe(
          "true = transfer from Spot to Perp, false = transfer from Perp to Spot"
        ),
    },
    async ({ amount, toPerp }) => {
      try {
        const direction = toPerp ? "Spot -> Perp" : "Perp -> Spot";

        return jsonResult({
          action: "hl_usd_class_transfer",
          isTestnet: isHyperliquidTestnet(),
          params: {
            amount,
            toPerp,
          },
          summary: {
            action: "transfer",
            amount,
            token: "USDC",
            direction,
          },
        });
      } catch (e) {
        return errorResult(
          `Failed to prepare transfer: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  );
}
