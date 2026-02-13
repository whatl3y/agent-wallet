import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import {
  getPublicClient,
  getWalletClient,
  getEVMAccount,
  SUPPORTED_EVM_CHAINS,
} from "@agent-wallet/core";

export const walletTransferToken = tool(
  "wallet_transfer_token",
  `Transfer ERC20 tokens on an EVM chain. Supported chains: ${SUPPORTED_EVM_CHAINS.join(", ")}`,
  {
    chain: z.string().describe("EVM chain name"),
    tokenAddress: z
      .string()
      .describe("ERC20 token contract address"),
    to: z.string().describe("Recipient address"),
    amount: z
      .string()
      .describe("Amount in human-readable units (e.g., '100' for 100 USDC)"),
    decimals: z
      .number()
      .default(18)
      .describe("Token decimals (default 18, use 6 for USDC/USDT)"),
  },
  async ({ chain, tokenAddress, to, amount, decimals }) => {
    const walletClient = getWalletClient(chain);
    const publicClient = getPublicClient(chain);
    const account = getEVMAccount();

    const parsedAmount = parseUnits(amount, decimals);

    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [to as `0x${string}`, parsedAmount],
    });

    const hash = await walletClient.sendTransaction({
      account: walletClient.account!,
      chain: walletClient.chain,
      to: tokenAddress as `0x${string}`,
      data,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              chain,
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
);
