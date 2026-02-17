import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { sendEVMTransactions } from "@web3-agent/core";

export const walletExecuteCalldata = tool(
  "wallet_execute_calldata",
  "Execute a transaction payload from an MCP server on an EVM chain. The payload contains a chainId and an array of transaction steps (to, data, value). Each step is executed sequentially. The user will be prompted to approve before execution.",
  {
    chainId: z.number().describe("EVM chain ID to execute on"),
    transactions: z
      .array(
        z.object({
          to: z.string().describe("Target contract address"),
          data: z.string().describe("Encoded calldata"),
          value: z
            .string()
            .default("0")
            .describe("Native token value in wei"),
          description: z
            .string()
            .optional()
            .describe("Human-readable description of this step"),
        })
      )
      .describe("Transaction steps to execute in order"),
  },
  async ({ chainId, transactions }) => {
    const results = await sendEVMTransactions(chainId, transactions);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              chainId,
              results: results.map((r) => ({
                hash: r.hash,
                status: r.status,
                blockNumber: r.blockNumber?.toString(),
                gasUsed: r.gasUsed?.toString(),
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);
