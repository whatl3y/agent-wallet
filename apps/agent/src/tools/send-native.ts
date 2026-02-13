import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  getWalletClient,
  getPublicClient,
  sendSOL,
  EVM_CHAINS,
  SOLANA_CLUSTERS,
  SUPPORTED_EVM_CHAINS,
  SUPPORTED_SOLANA_CLUSTERS,
} from "@agent-wallet/core";
import { parseEther } from "viem";

export const walletSendNative = tool(
  "wallet_send_native",
  `Send native tokens (ETH, SOL, POL, AVAX, etc.) to an address. Supported chains: ${[...SUPPORTED_EVM_CHAINS, ...SUPPORTED_SOLANA_CLUSTERS].join(", ")}`,
  {
    chain: z.string().describe("Chain name to send on"),
    to: z.string().describe("Recipient address"),
    amount: z
      .string()
      .describe("Amount in human-readable units (e.g., '0.1')"),
  },
  async ({ chain, to, amount }) => {
    const chainLower = chain.toLowerCase();

    if (chainLower in SOLANA_CLUSTERS) {
      const result = await sendSOL(chainLower, to, parseFloat(amount));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                chain: chainLower,
                signature: result.signature,
                status: result.status,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (chainLower in EVM_CHAINS) {
      const walletClient = getWalletClient(chainLower);
      const publicClient = getPublicClient(chainLower);

      const hash = await walletClient.sendTransaction({
        account: walletClient.account!,
        chain: walletClient.chain,
        to: to as `0x${string}`,
        value: parseEther(amount),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                chain: chainLower,
                hash,
                status: receipt.status,
                blockNumber: receipt.blockNumber.toString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    throw new Error(
      `Unsupported chain: ${chain}. Supported: ${[...SUPPORTED_EVM_CHAINS, ...SUPPORTED_SOLANA_CLUSTERS].join(", ")}`
    );
  }
);
