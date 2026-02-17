import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  getEVMAccount,
  getSolanaKeypair,
  getBalance,
  getERC20Balance,
  getERC721Balance,
  SUPPORTED_EVM_CHAINS,
  SUPPORTED_SOLANA_CLUSTERS,
  EVM_CHAINS,
  SOLANA_CLUSTERS,
} from "@web3-agent/core";

export const walletGetAddresses = tool(
  "wallet_get_addresses",
  "Get the wallet addresses for all supported chains (EVM and Solana)",
  {},
  async () => {
    const evmAddress = getEVMAccount().address;
    const solanaAddress = getSolanaKeypair().publicKey.toBase58();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              evm: evmAddress,
              solana: solanaAddress,
              supportedEVMChains: SUPPORTED_EVM_CHAINS,
              supportedSolanaClusters: SUPPORTED_SOLANA_CLUSTERS,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

export const walletGetBalance = tool(
  "wallet_get_balance",
  `Get the native token balance on a specific chain. Supported chains: ${[...SUPPORTED_EVM_CHAINS, ...SUPPORTED_SOLANA_CLUSTERS].join(", ")}`,
  {
    chain: z
      .string()
      .describe(
        `Chain name (${[...SUPPORTED_EVM_CHAINS, ...SUPPORTED_SOLANA_CLUSTERS].join(", ")})`
      ),
  },
  async ({ chain }) => {
    const balance = await getBalance(chain);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(balance, null, 2),
        },
      ],
    };
  }
);

export const walletGetTokenBalance = tool(
  "wallet_get_token_balance",
  `Get an ERC20 token balance on an EVM chain. Returns the token symbol, name, decimals, and formatted balance. Supported chains: ${SUPPORTED_EVM_CHAINS.join(", ")}`,
  {
    chain: z.string().describe("EVM chain name"),
    tokenAddress: z
      .string()
      .describe("ERC20 token contract address"),
    owner: z
      .string()
      .optional()
      .describe(
        "Address to check balance for (defaults to the wallet's own address)"
      ),
  },
  async ({ chain, tokenAddress, owner }) => {
    const result = await getERC20Balance(chain, tokenAddress, owner);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

export const walletGetNftBalance = tool(
  "wallet_get_nft_balance",
  `Get an ERC721 NFT balance on an EVM chain. Returns the collection name, symbol, balance count, and token IDs (if the contract supports ERC721Enumerable). Supported chains: ${SUPPORTED_EVM_CHAINS.join(", ")}`,
  {
    chain: z.string().describe("EVM chain name"),
    tokenAddress: z
      .string()
      .describe("ERC721 NFT contract address"),
    owner: z
      .string()
      .optional()
      .describe(
        "Address to check balance for (defaults to the wallet's own address)"
      ),
  },
  async ({ chain, tokenAddress, owner }) => {
    const result = await getERC721Balance(chain, tokenAddress, owner);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

export const walletGetAllBalances = tool(
  "wallet_get_all_balances",
  "Get native token balances across all configured EVM chains and Solana clusters at once. Useful for a quick overview of the wallet's holdings.",
  {},
  async () => {
    const results: Array<
      | { chain: string; nativeBalance: string; nativeSymbol: string }
      | { chain: string; error: string }
    > = [];

    const chains = [
      ...Object.keys(EVM_CHAINS),
      ...Object.keys(SOLANA_CLUSTERS),
    ];

    const settled = await Promise.allSettled(
      chains.map((chain) => getBalance(chain))
    );

    for (let i = 0; i < chains.length; i++) {
      const result = settled[i];
      if (result.status === "fulfilled") {
        results.push({
          chain: result.value.chain,
          nativeBalance: result.value.nativeBalance,
          nativeSymbol: result.value.nativeSymbol,
        });
      } else {
        results.push({
          chain: chains[i],
          error: result.reason?.message || "Failed to fetch balance",
        });
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }
);
