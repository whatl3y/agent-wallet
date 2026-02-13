import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { getEVMAccount, getSolanaKeypair } from "@agent-wallet/core";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { loadMcpServers } from "./mcp-config.js";
import { canUseTool } from "./approval.js";
import { walletToolsServer } from "./tools/index.js";

function buildSystemPrompt(): string {
  let evmAddress = "not configured";
  let solanaAddress = "not configured";

  try {
    evmAddress = getEVMAccount().address;
  } catch {}
  try {
    solanaAddress = getSolanaKeypair().publicKey.toBase58();
  } catch {}

  return `You are a crypto wallet AI agent. You manage a multi-chain wallet with the following addresses:

EVM (Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche): ${evmAddress}
Solana: ${solanaAddress}

You can:
1. Check native balances on any supported chain using wallet_get_balance
2. Check native balances across ALL chains at once using wallet_get_all_balances
3. Check ERC20 token balances using wallet_get_token_balance (requires chain and token contract address)
4. Check ERC721 NFT balances using wallet_get_nft_balance (requires chain and NFT contract address)
5. Send native tokens (ETH, SOL, POL, AVAX, etc.) using wallet_send_native
6. Transfer ERC20 tokens using wallet_transfer_token
7. Use connected MCP servers for DeFi protocol interactions (lending, borrowing, swaps, etc.)
8. Execute EVM transaction calldata returned by MCP servers using wallet_execute_calldata
9. Execute serialized Solana transactions from MCP servers using wallet_execute_solana_transaction

IMPORTANT RULES:
- NEVER execute a transaction without first explaining to the user exactly what will happen.
- When an MCP server returns transaction calldata, explain each step clearly before calling wallet_execute_calldata or wallet_execute_solana_transaction.
- Always show: chain name, target contract, action description, and value being sent.
- The user will be prompted to approve every transaction through the approval system.
- For read-only queries (balances, positions, rates), proceed without asking.
- If you are unsure about something, ask the user for clarification.

When interacting with MCP servers:
- Use them to build transaction calldata for DeFi protocols and swaps.
- For EVM chains: MCP servers return { chainId, transactions: [{ to, data, value, description }] }. Pass this to wallet_execute_calldata.
- For Solana: MCP servers return { cluster, serializedTransaction, description }. Pass this to wallet_execute_solana_transaction.
- The user will be prompted to approve before any transaction is sent.`;
}

export async function runAgent(
  userInput: AsyncIterable<{ type: "user"; message: { role: "user"; content: string } }>
) {
  const externalServers = loadMcpServers();

  const mcpServers: Record<string, any> = {
    ...externalServers,
    wallet: walletToolsServer,
  };

  logger.info(
    { servers: Object.keys(mcpServers) },
    "Starting agent with MCP servers"
  );

  const conversation = query({
    prompt: userInput as any,
    options: {
      model: config.model,
      systemPrompt: buildSystemPrompt(),
      mcpServers,
      canUseTool,
      maxTurns: config.maxTurns,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  });

  return conversation;
}

export function processMessage(message: SDKMessage): void {
  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        logger.info(
          {
            model: message.model,
            mcpServers: message.mcp_servers,
          },
          "Agent initialized"
        );

        for (const server of message.mcp_servers) {
          const status =
            server.status === "connected" ? "connected" : server.status;
          process.stderr.write(`  MCP: ${server.name} [${status}]\n`);
        }
      }
      break;

    case "assistant": {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            process.stdout.write(block.text);
          }
        }
      } else if (typeof content === "string") {
        process.stdout.write(content);
      }
      break;
    }

    case "result":
      if (message.subtype === "success") {
        logger.debug(
          {
            turns: message.num_turns,
            cost: message.total_cost_usd,
          },
          "Turn completed"
        );
      } else {
        logger.error(
          {
            subtype: message.subtype,
            errors: "errors" in message ? message.errors : undefined,
          },
          "Turn ended with error"
        );
      }
      break;
  }
}
