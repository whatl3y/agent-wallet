import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { signAndSendSerializedTransaction } from "@web3-agent/core";

export const walletExecuteSolanaTransaction = tool(
  "wallet_execute_solana_transaction",
  "Execute a serialized Solana transaction (base64-encoded VersionedTransaction) returned by an MCP server. The transaction will be signed with the wallet's Solana keypair and sent to the network. The user will be prompted to approve before execution.",
  {
    cluster: z
      .string()
      .default("solana-mainnet")
      .describe("Solana cluster name (e.g., solana-mainnet, solana-devnet)"),
    serializedTransaction: z
      .string()
      .describe("Base64-encoded unsigned VersionedTransaction"),
    description: z
      .string()
      .optional()
      .describe("Human-readable description of this transaction"),
  },
  async ({ cluster, serializedTransaction, description }) => {
    const result = await signAndSendSerializedTransaction(
      cluster,
      serializedTransaction
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              cluster,
              signature: result.signature,
              status: result.status,
              description,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);
