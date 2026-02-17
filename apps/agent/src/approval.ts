import * as readline from "node:readline";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import {
  getEVMChainConfigByChainId,
  EVM_CHAINS,
  SOLANA_CLUSTERS,
} from "@web3-agent/core";
import { formatEther } from "viem";

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
]);

function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function formatTransactionDetails(toolName: string, input: any): string {
  const lines: string[] = [
    "",
    "═══════════════════════════════════════════",
    "  TRANSACTION APPROVAL REQUIRED",
    "═══════════════════════════════════════════",
  ];

  if (toolName === "mcp__wallet__wallet_send_native") {
    const chainKey = input.chain?.toLowerCase() || "unknown";
    const chainConfig =
      EVM_CHAINS[chainKey] || SOLANA_CLUSTERS[chainKey] || null;
    lines.push(
      `  Chain:     ${chainConfig?.name || input.chain}`,
      `  To:        ${input.to}`,
      `  Amount:    ${input.amount} ${chainConfig?.nativeSymbol || ""}`,
      ""
    );
  } else if (toolName === "mcp__wallet__wallet_execute_calldata") {
    let chainName = `chainId ${input.chainId}`;
    try {
      const config = getEVMChainConfigByChainId(input.chainId);
      chainName = config.name;
    } catch {}

    lines.push(`  Chain: ${chainName} (chainId: ${input.chainId})`, "");

    if (Array.isArray(input.transactions)) {
      for (let i = 0; i < input.transactions.length; i++) {
        const tx = input.transactions[i];
        lines.push(
          `  Step ${i + 1}${tx.description ? `: ${tx.description}` : ""}`,
          `    To:    ${tx.to}`,
          `    Value: ${tx.value && tx.value !== "0" ? formatEther(BigInt(tx.value)) + " ETH" : "0"}`,
          ""
        );
      }
    }
  } else if (toolName === "mcp__wallet__wallet_transfer_token") {
    lines.push(
      `  Chain:    ${input.chain}`,
      `  Token:   ${input.tokenAddress}`,
      `  To:      ${input.to}`,
      `  Amount:  ${input.amount}`,
      ""
    );
  } else if (toolName === "mcp__wallet__wallet_execute_solana_transaction") {
    lines.push(
      `  Cluster: ${input.cluster || "solana-mainnet"}`,
      `  Action:  ${input.description || "Execute Solana transaction"}`,
      ""
    );
  }

  lines.push("═══════════════════════════════════════════");
  return lines.join("\n");
}

export const canUseTool: CanUseTool = async (toolName, input) => {
  // Auto-approve read-only wallet tools
  if (READ_ONLY_TOOLS.has(toolName)) {
    return { behavior: "allow", updatedInput: input };
  }

  // Auto-approve external MCP server tools (they only build calldata)
  if (
    toolName.startsWith("mcp__") &&
    !toolName.startsWith("mcp__wallet__")
  ) {
    return { behavior: "allow", updatedInput: input };
  }

  // Prompt for transaction tools
  if (TRANSACTION_TOOLS.has(toolName)) {
    const details = formatTransactionDetails(toolName, input);
    process.stderr.write(details + "\n");

    const answer = await promptUser("\n  Approve this transaction? (y/n): ");

    if (answer === "y" || answer === "yes") {
      return { behavior: "allow", updatedInput: input };
    }

    return {
      behavior: "deny",
      message: "Transaction rejected by user",
    };
  }

  // Allow everything else (built-in Claude Code tools if any)
  return { behavior: "allow", updatedInput: input };
};
