import { InlineKeyboard } from "grammy";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import {
  getEVMChainConfigByChainId,
  EVM_CHAINS,
  SOLANA_CLUSTERS,
} from "@agent-wallet/core";
import { formatEther } from "viem";
import type { UserSessionManager } from "./session-manager.js";
import { logger } from "../logger.js";

const READ_ONLY_TOOLS = new Set([
  "mcp__wallet__wallet_get_addresses",
  "mcp__wallet__wallet_get_balance",
  "mcp__wallet__wallet_get_token_balance",
  "mcp__wallet__wallet_get_nft_balance",
  "mcp__wallet__wallet_get_all_balances",
]);

const TRANSACTION_TOOLS = new Set([
  "mcp__wallet__wallet_send_native",
  "mcp__wallet__wallet_execute_calldata",
  "mcp__wallet__wallet_transfer_token",
  "mcp__wallet__wallet_execute_solana_transaction",
  "mcp__wallet__wallet_execute_hyperliquid_action",
]);

function formatTransactionDetails(toolName: string, input: any): string {
  const lines: string[] = [
    "═══════════════════════════════",
    "  TRANSACTION APPROVAL REQUIRED",
    "═══════════════════════════════",
  ];

  if (toolName === "mcp__wallet__wallet_send_native") {
    const chainKey = input.chain?.toLowerCase() || "unknown";
    const chainConfig =
      EVM_CHAINS[chainKey] || SOLANA_CLUSTERS[chainKey] || null;
    lines.push(
      `Chain:  ${chainConfig?.name || input.chain}`,
      `To:     ${input.to}`,
      `Amount: ${input.amount} ${chainConfig?.nativeSymbol || ""}`,
      ""
    );
  } else if (toolName === "mcp__wallet__wallet_execute_calldata") {
    let chainName = `chainId ${input.chainId}`;
    try {
      const config = getEVMChainConfigByChainId(input.chainId);
      chainName = config.name;
    } catch {}

    lines.push(`Chain: ${chainName} (chainId: ${input.chainId})`, "");

    if (Array.isArray(input.transactions)) {
      for (let i = 0; i < input.transactions.length; i++) {
        const tx = input.transactions[i];
        lines.push(
          `Step ${i + 1}${tx.description ? `: ${tx.description}` : ""}`,
          `  To:    ${tx.to}`,
          `  Value: ${tx.value && tx.value !== "0" ? formatEther(BigInt(tx.value)) + " ETH" : "0"}`,
          ""
        );
      }
    }
  } else if (toolName === "mcp__wallet__wallet_transfer_token") {
    lines.push(
      `Chain: ${input.chain}`,
      `Token: ${input.tokenAddress}`,
      `To:    ${input.to}`,
      `Amount: ${input.amount}`,
      ""
    );
  } else if (toolName === "mcp__wallet__wallet_execute_solana_transaction") {
    lines.push(
      `Cluster: ${input.cluster || "solana-mainnet"}`,
      `Action:  ${input.description || "Execute Solana transaction"}`,
      ""
    );
  } else if (toolName === "mcp__wallet__wallet_execute_hyperliquid_action") {
    const network = input.isTestnet ? "Testnet" : "Mainnet";
    lines.push(
      `Platform: Hyperliquid (${network})`,
      `Action:   ${input.action}`,
    );
    if (input.summary) {
      for (const [key, val] of Object.entries(input.summary)) {
        if (val != null) {
          lines.push(`  ${key}: ${val}`);
        }
      }
    }
    lines.push("");
  }

  lines.push("═══════════════════════════════");
  return lines.join("\n");
}

export function createTelegramCanUseTool(
  telegramUserId: number,
  sendMessage: (
    text: string,
    keyboard?: InlineKeyboard
  ) => Promise<void>,
  sessionManager: UserSessionManager
): CanUseTool {
  return async (toolName, input) => {
    logger.info({ telegramUserId, toolName }, "canUseTool called");

    // Auto-approve read-only wallet tools
    if (READ_ONLY_TOOLS.has(toolName)) {
      logger.info({ telegramUserId, toolName }, "Auto-approved read-only tool");
      return { behavior: "allow", updatedInput: input };
    }

    // Auto-approve external MCP server tools (they only build calldata)
    if (
      toolName.startsWith("mcp__") &&
      !toolName.startsWith("mcp__wallet__")
    ) {
      logger.info({ telegramUserId, toolName }, "Auto-approved MCP tool");
      return { behavior: "allow", updatedInput: input };
    }

    // Prompt for transaction tools via Telegram inline keyboard
    if (TRANSACTION_TOOLS.has(toolName)) {
      const details = formatTransactionDetails(toolName, input);
      const toolUseId = `${telegramUserId}_${Date.now()}`;

      logger.info(
        { telegramUserId, toolName, toolUseId },
        "Requesting transaction approval via Telegram"
      );

      const keyboard = new InlineKeyboard()
        .text("Approve", `approve:${toolUseId}`)
        .text("Deny", `deny:${toolUseId}`);

      await sendMessage(details, keyboard);

      const approved = await sessionManager.requestApproval(
        telegramUserId,
        toolUseId
      );

      logger.info(
        { telegramUserId, toolUseId, approved },
        "Transaction approval resolved"
      );

      if (approved) {
        return { behavior: "allow", updatedInput: input };
      }

      return {
        behavior: "deny",
        message: "Transaction rejected by user",
      };
    }

    // Allow everything else
    logger.info({ telegramUserId, toolName }, "Auto-approved unknown tool");
    return { behavior: "allow", updatedInput: input };
  };
}
