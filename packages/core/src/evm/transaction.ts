import type {
  EVMTransactionRequest,
  EVMTransactionResult,
  MCPTransactionStep,
} from "../types.js";
import { getEVMChainConfigByChainId } from "./chains.js";
import { getPublicClient } from "./provider.js";
import { getWalletClient } from "./wallet.js";

export async function sendEVMTransaction(
  chainName: string,
  tx: EVMTransactionRequest
): Promise<EVMTransactionResult> {
  const walletClient = getWalletClient(chainName);
  const publicClient = getPublicClient(chainName);

  const hash = await walletClient.sendTransaction({
    account: walletClient.account!,
    chain: walletClient.chain,
    to: tx.to,
    data: tx.data,
    value: tx.value,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    hash,
    chainId: await publicClient.getChainId(),
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    status: receipt.status === "success" ? "success" : "reverted",
  };
}

export async function sendEVMTransactions(
  chainId: number,
  steps: MCPTransactionStep[]
): Promise<EVMTransactionResult[]> {
  const chainConfig = getEVMChainConfigByChainId(chainId);
  const results: EVMTransactionResult[] = [];

  for (const step of steps) {
    const result = await sendEVMTransaction(chainConfig.key, {
      to: step.to as `0x${string}`,
      data: step.data as `0x${string}`,
      value: BigInt(step.value || "0"),
    });

    if (result.status === "reverted") {
      throw new Error(
        `Transaction reverted at step "${step.description || "unknown"}": ${result.hash}`
      );
    }

    results.push(result);
  }

  return results;
}
