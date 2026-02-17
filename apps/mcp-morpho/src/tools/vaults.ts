import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { SUPPORTED_CHAINS, getChainConfig } from "../config.js";
import { erc4626Abi } from "../abis/erc4626.js";
import { getPublicClient } from "../clients.js";
import { erc20Abi } from "../abis/erc20.js";
import {
  parseAmount,
  getTokenDecimals,
  getTokenSymbol,
  buildApprovalIfNeeded,
  jsonResult,
  errorResult,
  type TransactionStep,
  type TransactionPayload,
} from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Target chain (ethereum, base, arbitrum)");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

const amountParam = z
  .string()
  .describe('Amount in human-readable units (e.g. "1000.5")');

export function registerVaultTools(server: McpServer) {
  // ── Deposit into vault ──────────────────────────────────────────────
  server.tool(
    "morpho_vault_deposit",
    "Build transaction(s) to deposit the underlying asset into a Morpho vault (ERC4626). Returns approval + deposit calldata. You earn yield through the vault's curated strategy.",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction"),
      vaultAddress: addressParam.describe("Vault contract address"),
      amount: amountParam.describe("Amount of underlying asset to deposit"),
    },
    async ({ chain, sender, vaultAddress, amount }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        // Get the vault's underlying asset
        const underlyingAsset = await client.readContract({
          address: vaultAddress as `0x${string}`,
          abi: erc4626Abi,
          functionName: "asset",
        });

        const decimals = await getTokenDecimals(chain, underlyingAsset as `0x${string}`);
        const symbol = await getTokenSymbol(chain, underlyingAsset as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);

        const transactions: TransactionStep[] = [];
        let stepNum = 1;

        // Approve the vault to spend underlying tokens
        const approval = await buildApprovalIfNeeded(
          chain,
          underlyingAsset as `0x${string}`,
          sender as `0x${string}`,
          vaultAddress as `0x${string}`,
          rawAmount,
          symbol
        );
        if (approval) {
          approval.step = stepNum++;
          approval.description = `Approve ${symbol} spending by Morpho vault`;
          transactions.push(approval);
        }

        const data = encodeFunctionData({
          abi: erc4626Abi,
          functionName: "deposit",
          args: [rawAmount, sender as `0x${string}`],
        });

        transactions.push({
          step: stepNum,
          type: "action",
          description: `Deposit ${amount} ${symbol} into Morpho vault`,
          to: vaultAddress,
          data,
          value: "0",
        });

        const payload: TransactionPayload = {
          chainId: config.chainId,
          transactions,
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build vault deposit transaction: ${e}`);
      }
    }
  );

  // ── Withdraw from vault ─────────────────────────────────────────────
  server.tool(
    "morpho_vault_withdraw",
    "Build transaction to withdraw underlying assets from a Morpho vault (ERC4626).",
    {
      chain: chainParam,
      sender: addressParam.describe("Address that will send the transaction (must own vault shares)"),
      vaultAddress: addressParam.describe("Vault contract address"),
      amount: amountParam.describe("Amount of underlying asset to withdraw"),
    },
    async ({ chain, sender, vaultAddress, amount }) => {
      try {
        const config = getChainConfig(chain);
        const client = getPublicClient(chain);

        // Get the vault's underlying asset
        const underlyingAsset = await client.readContract({
          address: vaultAddress as `0x${string}`,
          abi: erc4626Abi,
          functionName: "asset",
        });

        const decimals = await getTokenDecimals(chain, underlyingAsset as `0x${string}`);
        const symbol = await getTokenSymbol(chain, underlyingAsset as `0x${string}`);
        const rawAmount = parseAmount(amount, decimals);

        const data = encodeFunctionData({
          abi: erc4626Abi,
          functionName: "withdraw",
          args: [rawAmount, sender as `0x${string}`, sender as `0x${string}`],
        });

        const payload: TransactionPayload = {
          chainId: config.chainId,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Withdraw ${amount} ${symbol} from Morpho vault`,
              to: vaultAddress,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build vault withdraw transaction: ${e}`);
      }
    }
  );
}
