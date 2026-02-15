import type { WalletClient, PublicClient } from "viem";
import { getAddress } from "viem";
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
      to: getAddress(step.to) as `0x${string}`,
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

export async function sendEVMTransactionWith(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tx: EVMTransactionRequest
): Promise<EVMTransactionResult> {
  const txParams = {
    account: walletClient.account!,
    chain: walletClient.chain,
    to: tx.to,
    data: tx.data,
    value: tx.value,
  };

  // Try gas estimation first; if it fails, validate via eth_call and use a
  // generous manual gas limit. Some RPC providers fail eth_estimateGas on
  // complex multicall transactions even when the execution would succeed.
  let gas: bigint | undefined;
  try {
    gas = await publicClient.estimateGas(txParams);
  } catch {
    // Gas estimation failed — verify the call would succeed via eth_call
    await publicClient.call(txParams);
    // eth_call succeeded, so estimation was a false negative. Use a safe
    // fallback gas limit (5M covers most DeFi multicalls on Arbitrum).
    gas = 5_000_000n;
  }

  const hash = await walletClient.sendTransaction({ ...txParams, gas });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    hash,
    chainId: await publicClient.getChainId(),
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    status: receipt.status === "success" ? "success" : "reverted",
  };
}

export async function sendEVMTransactionsWith(
  walletClient: WalletClient,
  publicClient: PublicClient,
  steps: MCPTransactionStep[]
): Promise<EVMTransactionResult[]> {
  const results: EVMTransactionResult[] = [];

  for (const step of steps) {
    const result = await sendEVMTransactionWith(walletClient, publicClient, {
      to: getAddress(step.to) as `0x${string}`,
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
