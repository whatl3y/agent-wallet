import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  parseEther,
  parseUnits,
  encodeFunctionData,
  erc20Abi,
} from "viem";
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import {
  createEVMAccount,
  createSolanaKeypairFromKey,
  createWalletClientForAccount,
  getPublicClient,
  getEVMChainConfigByChainId,
  sendEVMTransactionsWith,
  sendSOLWith,
  signAndSendSerializedTransactionWith,
  getBalanceFor,
  getERC20BalanceFor,
  getERC721BalanceFor,
  EVM_CHAINS,
  SOLANA_CLUSTERS,
  SUPPORTED_EVM_CHAINS,
  SUPPORTED_SOLANA_CLUSTERS,
} from "@web3-agent/core";
import { logger } from "../logger.js";

// ── Hyperliquid deposit constants (Arbitrum) ──────────────────────────
const HL_BRIDGE2_ADDRESS =
  "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7" as const;
const HL_USDC_ADDRESS =
  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
const HL_ARBITRUM_CHAIN_ID = 42161;

const hlBridge2Abi = [
  {
    type: "function",
    name: "batchedDepositWithPermit",
    inputs: [
      {
        name: "deposits",
        type: "tuple[]",
        components: [
          { name: "user", type: "address" },
          { name: "usd", type: "uint64" },
          { name: "deadline", type: "uint64" },
          {
            name: "signature",
            type: "tuple",
            components: [
              { name: "r", type: "uint256" },
              { name: "s", type: "uint256" },
              { name: "v", type: "uint8" },
            ],
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const hlErc20PermitAbi = [
  {
    type: "function",
    name: "nonces",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

const APPROVE_SELECTOR = "0x095ea7b3";

function isApproveCall(data: string): boolean {
  return data.toLowerCase().startsWith(APPROVE_SELECTOR);
}

function decodeApproveCalldata(data: string): {
  spender: `0x${string}`;
  amount: bigint;
} {
  // approve(address spender, uint256 amount)
  // selector(4) + address(32 padded) + uint256(32)
  const spender = `0x${data.slice(34, 74)}` as `0x${string}`;
  const amount = BigInt(`0x${data.slice(74, 138)}`);
  return { spender, amount };
}

export function createUserToolServer(
  evmAccount: ReturnType<typeof createEVMAccount>,
  solanaKeypair: ReturnType<typeof createSolanaKeypairFromKey>
) {
  const evmAddress = evmAccount.address;
  const solanaAddress = solanaKeypair.publicKey.toBase58();

  const userWalletGetAddresses = tool(
    "wallet_get_addresses",
    "Get the wallet addresses for all supported chains (EVM and Solana)",
    {},
    async () => ({
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
    })
  );

  const allChains = [
    ...SUPPORTED_EVM_CHAINS,
    ...SUPPORTED_SOLANA_CLUSTERS,
  ].join(", ");

  const userWalletGetBalance = tool(
    "wallet_get_balance",
    `Get the native token balance on a specific chain. Supported chains: ${allChains}`,
    {
      chain: z.string().describe(`Chain name (${allChains})`),
    },
    async ({ chain }) => {
      const lower = chain.toLowerCase();
      const address =
        lower in SOLANA_CLUSTERS ? solanaAddress : evmAddress;
      const balance = await getBalanceFor(chain, address);

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

  const userWalletGetTokenBalance = tool(
    "wallet_get_token_balance",
    `Get an ERC20 token balance on an EVM chain. Returns the token symbol, name, decimals, and formatted balance. Supported chains: ${SUPPORTED_EVM_CHAINS.join(", ")}`,
    {
      chain: z.string().describe("EVM chain name"),
      tokenAddress: z.string().describe("ERC20 token contract address"),
      owner: z
        .string()
        .optional()
        .describe(
          "Address to check balance for (defaults to the wallet's own address)"
        ),
    },
    async ({ chain, tokenAddress, owner }) => {
      const result = await getERC20BalanceFor(
        chain,
        tokenAddress,
        owner || evmAddress
      );

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

  const userWalletGetNftBalance = tool(
    "wallet_get_nft_balance",
    `Get an ERC721 NFT balance on an EVM chain. Returns the collection name, symbol, balance count, and token IDs (if the contract supports ERC721Enumerable). Supported chains: ${SUPPORTED_EVM_CHAINS.join(", ")}`,
    {
      chain: z.string().describe("EVM chain name"),
      tokenAddress: z.string().describe("ERC721 NFT contract address"),
      owner: z
        .string()
        .optional()
        .describe(
          "Address to check balance for (defaults to the wallet's own address)"
        ),
    },
    async ({ chain, tokenAddress, owner }) => {
      const result = await getERC721BalanceFor(
        chain,
        tokenAddress,
        owner || evmAddress
      );

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

  const userWalletGetAllBalances = tool(
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
        chains.map((chain) => {
          const address =
            chain in SOLANA_CLUSTERS ? solanaAddress : evmAddress;
          return getBalanceFor(chain, address);
        })
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

  const userWalletSendNative = tool(
    "wallet_send_native",
    `Send native tokens (ETH, SOL, POL, AVAX, etc.) to an address. Supported chains: ${allChains}`,
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
        const result = await sendSOLWith(
          solanaKeypair,
          chainLower,
          to,
          parseFloat(amount)
        );
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
        const walletClient = createWalletClientForAccount(
          evmAccount,
          chainLower
        );
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
        `Unsupported chain: ${chain}. Supported: ${allChains}`
      );
    }
  );

  const userWalletExecuteCalldata = tool(
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
      const chainConfig = getEVMChainConfigByChainId(chainId);
      const publicClient = getPublicClient(chainConfig.key);

      // Filter out ERC20 approvals where sufficient allowance already exists
      const filteredTransactions = [];
      for (const tx of transactions) {
        if (isApproveCall(tx.data)) {
          const { spender, amount } = decodeApproveCalldata(tx.data);
          const tokenAddress = tx.to as `0x${string}`;
          try {
            const currentAllowance = await publicClient.readContract({
              address: tokenAddress,
              abi: erc20Abi,
              functionName: "allowance",
              args: [evmAddress, spender],
            });
            if (currentAllowance >= amount) {
              logger.info(
                {
                  chainId,
                  token: tokenAddress,
                  spender,
                  currentAllowance: currentAllowance.toString(),
                  requiredAmount: amount.toString(),
                },
                "Skipping ERC20 approval — sufficient allowance already exists"
              );
              continue;
            }
          } catch (err) {
            logger.warn(
              { err, token: tokenAddress },
              "Failed to check allowance, proceeding with approval"
            );
          }
        }
        filteredTransactions.push(tx);
      }

      const walletClient = createWalletClientForAccount(
        evmAccount,
        chainConfig.key
      );

      // Log transaction details before execution
      logger.info(
        {
          chainId,
          chainName: chainConfig.name,
          wallet: evmAddress,
          totalSteps: filteredTransactions.length,
          skippedApprovals: transactions.length - filteredTransactions.length,
          steps: filteredTransactions.map((tx, i) => ({
            step: i + 1,
            to: tx.to,
            value: tx.value,
            data: tx.data,
            description: tx.description,
          })),
        },
        "Executing calldata transactions"
      );

      try {
        const results = await sendEVMTransactionsWith(
          walletClient,
          publicClient,
          filteredTransactions
        );

        logger.info(
          {
            chainId,
            results: results.map((r) => ({
              hash: r.hash,
              status: r.status,
              gasUsed: r.gasUsed?.toString(),
            })),
          },
          "Calldata transactions completed successfully"
        );

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
      } catch (err: any) {
        logger.error(
          {
            chainId,
            chainName: chainConfig.name,
            wallet: evmAddress,
            error: err.message,
            shortMessage: err.shortMessage,
            details: err.details,
            steps: filteredTransactions.map((tx, i) => ({
              step: i + 1,
              to: tx.to,
              value: tx.value,
              data: tx.data,
              description: tx.description,
            })),
          },
          "Calldata transaction FAILED"
        );
        throw err;
      }
    }
  );

  const userWalletTransferToken = tool(
    "wallet_transfer_token",
    `Transfer ERC20 tokens on an EVM chain. Supported chains: ${SUPPORTED_EVM_CHAINS.join(", ")}`,
    {
      chain: z.string().describe("EVM chain name"),
      tokenAddress: z.string().describe("ERC20 token contract address"),
      to: z.string().describe("Recipient address"),
      amount: z
        .string()
        .describe(
          "Amount in human-readable units (e.g., '100' for 100 USDC)"
        ),
      decimals: z
        .number()
        .default(18)
        .describe("Token decimals (default 18, use 6 for USDC/USDT)"),
    },
    async ({ chain, tokenAddress, to, amount, decimals }) => {
      const walletClient = createWalletClientForAccount(evmAccount, chain);
      const publicClient = getPublicClient(chain);

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

  const userWalletExecuteSolanaTransaction = tool(
    "wallet_execute_solana_transaction",
    "Execute a serialized Solana transaction (base64-encoded VersionedTransaction) returned by an MCP server. The transaction will be signed with the wallet's Solana keypair and sent to the network. The user will be prompted to approve before execution.",
    {
      cluster: z
        .string()
        .default("solana-mainnet")
        .describe(
          "Solana cluster name (e.g., solana-mainnet, solana-devnet)"
        ),
      serializedTransaction: z
        .string()
        .describe("Base64-encoded unsigned VersionedTransaction"),
      description: z
        .string()
        .optional()
        .describe("Human-readable description of this transaction"),
    },
    async ({ cluster, serializedTransaction, description }) => {
      const result = await signAndSendSerializedTransactionWith(
        solanaKeypair,
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

  const userWalletExecuteHyperliquidAction = tool(
    "wallet_execute_hyperliquid_action",
    "Execute a Hyperliquid action descriptor returned by the Hyperliquid MCP server. Handles signing and submission for orders, cancellations, leverage changes, withdrawals, transfers, and deposits.",
    {
      action: z
        .enum([
          "hl_order",
          "hl_cancel",
          "hl_update_leverage",
          "hl_update_isolated_margin",
          "hl_withdraw",
          "hl_usd_class_transfer",
          "hl_deposit",
        ])
        .describe("The action type from the Hyperliquid MCP tool response"),
      isTestnet: z
        .boolean()
        .describe("Whether this is for Hyperliquid testnet"),
      params: z
        .record(z.string(), z.any())
        .describe("Action-specific parameters from the MCP tool response"),
      summary: z
        .record(z.string(), z.any())
        .optional()
        .describe("Human-readable summary of the action"),
    },
    async ({ action, isTestnet, params, summary }) => {
      logger.info(
        { action, isTestnet, params, summary },
        "Executing Hyperliquid action"
      );

      try {
        // ── Deposit: Arbitrum L1 transaction (permit + bridge) ──────
        if (action === "hl_deposit") {
          const walletClient = createWalletClientForAccount(
            evmAccount,
            "arbitrum"
          );
          const publicClient = getPublicClient("arbitrum");
          const amountRaw = BigInt(params.amountRaw as string);

          // Get permit nonce
          const nonce = await publicClient.readContract({
            address: HL_USDC_ADDRESS,
            abi: hlErc20PermitAbi,
            functionName: "nonces",
            args: [evmAddress as `0x${string}`],
          });

          // Deadline: 10 minutes from now
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

          // Sign EIP-2612 permit
          const permitSignature = await walletClient.signTypedData({
            account: evmAccount,
            domain: {
              name: "USD Coin",
              version: "2",
              chainId: HL_ARBITRUM_CHAIN_ID,
              verifyingContract: HL_USDC_ADDRESS,
            },
            types: {
              Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
              ],
            },
            primaryType: "Permit",
            message: {
              owner: evmAddress as `0x${string}`,
              spender: HL_BRIDGE2_ADDRESS,
              value: amountRaw,
              nonce: nonce as bigint,
              deadline,
            },
          });

          // Parse signature into r, s, v
          const r = `0x${permitSignature.slice(2, 66)}` as `0x${string}`;
          const s = `0x${permitSignature.slice(66, 130)}` as `0x${string}`;
          const v = parseInt(permitSignature.slice(130, 132), 16);

          // Call batchedDepositWithPermit on Bridge2
          const txHash = await walletClient.writeContract({
            account: evmAccount,
            chain: walletClient.chain,
            address: HL_BRIDGE2_ADDRESS,
            abi: hlBridge2Abi,
            functionName: "batchedDepositWithPermit",
            args: [
              [
                {
                  user: evmAddress as `0x${string}`,
                  usd: amountRaw,
                  deadline,
                  signature: {
                    r: BigInt(r),
                    s: BigInt(s),
                    v,
                  },
                },
              ],
            ],
          });

          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: receipt.status === "success",
                    action: "deposit",
                    amount: params.amount,
                    token: "USDC",
                    from: "Arbitrum",
                    to: "Hyperliquid",
                    txHash,
                    status: receipt.status,
                    blockNumber: Number(receipt.blockNumber),
                    note: "Deposit may take a few minutes to appear on Hyperliquid",
                  },
                  bigIntReplacer,
                  2
                ),
              },
            ],
          };
        }

        // ── All other actions: use Hyperliquid ExchangeClient ──────
        const transport = new HttpTransport({ isTestnet });
        // evmAccount is a PrivateKeyAccount with signTypedData — safe cast
        const exchange = new ExchangeClient({
          wallet: evmAccount as any,
          transport,
        });

        let result: unknown;

        switch (action) {
          case "hl_order":
            result = await exchange.order(params as any);
            break;
          case "hl_cancel":
            result = await exchange.cancel(params as any);
            break;
          case "hl_update_leverage":
            result = await exchange.updateLeverage(params as any);
            break;
          case "hl_update_isolated_margin":
            result = await exchange.updateIsolatedMargin(params as any);
            break;
          case "hl_withdraw":
            result = await exchange.withdraw3(params as any);
            break;
          case "hl_usd_class_transfer":
            result = await exchange.usdClassTransfer(params as any);
            break;
          default:
            throw new Error(`Unknown Hyperliquid action: ${action}`);
        }

        logger.info(
          { action, result },
          "Hyperliquid action completed successfully"
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  action,
                  response: result,
                  ...(summary || {}),
                },
                bigIntReplacer,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        logger.error(
          {
            action,
            error: err.message,
            details: err.details,
          },
          "Hyperliquid action FAILED"
        );
        // Return error as result instead of throwing to prevent the agent
        // from retrying the same action in a loop
        const detail = (err.message || String(err)).replace(
          /https?:\/\/\S+/gi,
          "<url>"
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  action,
                  error: detail,
                  ...(summary || {}),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  return createSdkMcpServer({
    name: "wallet",
    version: "0.1.0",
    tools: [
      userWalletGetAddresses,
      userWalletGetBalance,
      userWalletGetTokenBalance,
      userWalletGetNftBalance,
      userWalletGetAllBalances,
      userWalletSendNative,
      userWalletExecuteCalldata,
      userWalletTransferToken,
      userWalletExecuteSolanaTransaction,
      userWalletExecuteHyperliquidAction,
    ],
  });
}
