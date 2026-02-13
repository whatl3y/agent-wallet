import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import {
  walletGetAddresses,
  walletGetBalance,
  walletGetTokenBalance,
  walletGetNftBalance,
  walletGetAllBalances,
} from "./wallet-info.js";
import { walletSendNative } from "./send-native.js";
import { walletExecuteCalldata } from "./execute-calldata.js";
import { walletTransferToken } from "./token-transfer.js";
import { walletExecuteSolanaTransaction } from "./execute-solana-transaction.js";

export const walletToolsServer = createSdkMcpServer({
  name: "wallet",
  version: "0.1.0",
  tools: [
    walletGetAddresses,
    walletGetBalance,
    walletGetTokenBalance,
    walletGetNftBalance,
    walletGetAllBalances,
    walletSendNative,
    walletExecuteCalldata,
    walletTransferToken,
    walletExecuteSolanaTransaction,
  ],
});
