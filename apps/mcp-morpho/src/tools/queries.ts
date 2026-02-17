import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SUPPORTED_CHAINS, CHAIN_CONFIGS } from "../config.js";
import {
  queryMarkets,
  queryMarketByKey,
  queryVaults,
  queryVaultByAddress,
  queryUserMarketPosition,
  queryUserVaultPosition,
  queryUserPositions,
} from "../api/morpho.js";
import { jsonResult, errorResult } from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .optional()
  .describe("Chain to query (ethereum, base, arbitrum). Omit for all chains.");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

function chainNameToId(chain?: string): number | undefined {
  if (!chain) return undefined;
  return CHAIN_CONFIGS[chain.toLowerCase()]?.chainId;
}

export function registerQueryTools(server: McpServer) {
  // ── List Markets ────────────────────────────────────────────────────
  server.tool(
    "morpho_get_markets",
    "List Morpho lending markets with supply/borrow APYs, TVL, and utilization. Results ordered by supply TVL descending.",
    {
      chain: chainParam,
      limit: z.number().int().min(1).max(100).default(20).describe("Max results to return (default 20)"),
    },
    async ({ chain, limit }) => {
      try {
        const chainId = chainNameToId(chain);
        const markets = await queryMarkets(chainId, limit);

        const formatted = markets.map((m) => ({
          uniqueKey: m.uniqueKey,
          loanAsset: m.loanAsset.symbol,
          loanAssetAddress: m.loanAsset.address,
          collateralAsset: m.collateralAsset?.symbol ?? "none",
          collateralAssetAddress: m.collateralAsset?.address ?? null,
          lltv: m.lltv,
          supplyApy: m.state?.supplyApy != null ? `${(m.state.supplyApy * 100).toFixed(2)}%` : null,
          borrowApy: m.state?.borrowApy != null ? `${(m.state.borrowApy * 100).toFixed(2)}%` : null,
          supplyTvlUsd: m.state?.supplyAssetsUsd != null ? `$${m.state.supplyAssetsUsd.toFixed(2)}` : null,
          borrowTvlUsd: m.state?.borrowAssetsUsd != null ? `$${m.state.borrowAssetsUsd.toFixed(2)}` : null,
          utilization: m.state?.utilization != null ? `${(m.state.utilization * 100).toFixed(2)}%` : null,
          liquidityUsd: m.state?.liquidityAssetsUsd != null ? `$${m.state.liquidityAssetsUsd.toFixed(2)}` : null,
        }));

        return jsonResult({
          chain: chain ?? "all",
          count: formatted.length,
          markets: formatted,
        });
      } catch (e) {
        return errorResult(`Failed to get markets: ${e}`);
      }
    }
  );

  // ── Market Details ──────────────────────────────────────────────────
  server.tool(
    "morpho_get_market_details",
    "Get detailed information about a specific Morpho market by its unique key (market ID)",
    {
      uniqueKey: z.string().describe("The market's unique key / ID (hex string from morpho_get_markets)"),
    },
    async ({ uniqueKey }) => {
      try {
        const market = await queryMarketByKey(uniqueKey);
        if (!market) {
          return errorResult(`Market not found: ${uniqueKey}`);
        }

        return jsonResult({
          uniqueKey: market.uniqueKey,
          loanAsset: {
            symbol: market.loanAsset.symbol,
            address: market.loanAsset.address,
            decimals: market.loanAsset.decimals,
            priceUsd: market.loanAsset.priceUsd,
          },
          collateralAsset: market.collateralAsset
            ? {
                symbol: market.collateralAsset.symbol,
                address: market.collateralAsset.address,
                decimals: market.collateralAsset.decimals,
                priceUsd: market.collateralAsset.priceUsd,
              }
            : null,
          lltv: market.lltv,
          oracleAddress: market.oracleAddress,
          irmAddress: market.irmAddress,
          supplyApy: market.state?.supplyApy != null ? `${(market.state.supplyApy * 100).toFixed(2)}%` : null,
          borrowApy: market.state?.borrowApy != null ? `${(market.state.borrowApy * 100).toFixed(2)}%` : null,
          supplyAssetsUsd: market.state?.supplyAssetsUsd,
          borrowAssetsUsd: market.state?.borrowAssetsUsd,
          collateralAssetsUsd: market.state?.collateralAssetsUsd,
          liquidityAssetsUsd: market.state?.liquidityAssetsUsd,
          utilization: market.state?.utilization != null ? `${(market.state.utilization * 100).toFixed(2)}%` : null,
          fee: market.state?.fee,
        });
      } catch (e) {
        return errorResult(`Failed to get market details: ${e}`);
      }
    }
  );

  // ── List Vaults ─────────────────────────────────────────────────────
  server.tool(
    "morpho_get_vaults",
    "List Morpho vaults (curated lending strategies) with APYs, TVL, and underlying asset. Results ordered by TVL descending.",
    {
      chain: chainParam,
      limit: z.number().int().min(1).max(100).default(20).describe("Max results to return (default 20)"),
    },
    async ({ chain, limit }) => {
      try {
        const chainId = chainNameToId(chain);
        const vaults = await queryVaults(chainId, limit);

        const formatted = vaults.map((v) => ({
          address: v.address,
          name: v.name,
          symbol: v.symbol,
          underlyingAsset: v.asset.symbol,
          underlyingAssetAddress: v.asset.address,
          chainId: v.chain.id,
          apy: v.state?.apy != null ? `${(v.state.apy * 100).toFixed(2)}%` : null,
          netApy: v.state?.netApy != null ? `${(v.state.netApy * 100).toFixed(2)}%` : null,
          totalAssetsUsd: v.state?.totalAssetsUsd != null ? `$${v.state.totalAssetsUsd.toFixed(2)}` : null,
          fee: v.state?.fee != null ? `${(v.state.fee * 100).toFixed(2)}%` : null,
          description: v.metadata?.description ?? null,
        }));

        return jsonResult({
          chain: chain ?? "all",
          count: formatted.length,
          vaults: formatted,
        });
      } catch (e) {
        return errorResult(`Failed to get vaults: ${e}`);
      }
    }
  );

  // ── Vault Details ───────────────────────────────────────────────────
  server.tool(
    "morpho_get_vault_details",
    "Get detailed information about a specific Morpho vault by address",
    {
      chain: z
        .enum(SUPPORTED_CHAINS as [string, ...string[]])
        .describe("Chain the vault is on (ethereum, base, arbitrum)"),
      vaultAddress: addressParam.describe("Vault contract address"),
    },
    async ({ chain, vaultAddress }) => {
      try {
        const chainId = CHAIN_CONFIGS[chain.toLowerCase()].chainId;
        const vault = await queryVaultByAddress(vaultAddress, chainId);
        if (!vault) {
          return errorResult(`Vault not found: ${vaultAddress} on ${chain}`);
        }

        return jsonResult({
          address: vault.address,
          name: vault.name,
          symbol: vault.symbol,
          chainId: vault.chain.id,
          underlyingAsset: {
            symbol: vault.asset.symbol,
            address: vault.asset.address,
            decimals: vault.asset.decimals,
            priceUsd: vault.asset.priceUsd,
          },
          apy: vault.state?.apy != null ? `${(vault.state.apy * 100).toFixed(2)}%` : null,
          netApy: vault.state?.netApy != null ? `${(vault.state.netApy * 100).toFixed(2)}%` : null,
          totalAssetsUsd: vault.state?.totalAssetsUsd,
          totalAssets: vault.state?.totalAssets,
          totalSupply: vault.state?.totalSupply,
          fee: vault.state?.fee != null ? `${(vault.state.fee * 100).toFixed(2)}%` : null,
          description: vault.metadata?.description ?? null,
        });
      } catch (e) {
        return errorResult(`Failed to get vault details: ${e}`);
      }
    }
  );

  // ── User Market Position ────────────────────────────────────────────
  server.tool(
    "morpho_get_user_market_position",
    "Get a user's position in a specific Morpho market: supply, borrow, and collateral balances",
    {
      user: addressParam.describe("User wallet address"),
      uniqueKey: z.string().describe("Market unique key (from morpho_get_markets)"),
    },
    async ({ user, uniqueKey }) => {
      try {
        const position = await queryUserMarketPosition(user, uniqueKey);
        if (!position) {
          return jsonResult({ user, uniqueKey, message: "No position found" });
        }

        return jsonResult({
          user,
          uniqueKey,
          supplyAssets: position.supplyAssets,
          supplyAssetsUsd: position.supplyAssetsUsd,
          borrowAssets: position.borrowAssets,
          borrowAssetsUsd: position.borrowAssetsUsd,
          collateral: position.collateral,
          collateralUsd: position.collateralUsd,
        });
      } catch (e) {
        return errorResult(`Failed to get user market position: ${e}`);
      }
    }
  );

  // ── User Vault Position ─────────────────────────────────────────────
  server.tool(
    "morpho_get_user_vault_position",
    "Get a user's position in a specific Morpho vault: shares, assets, and USD value",
    {
      user: addressParam.describe("User wallet address"),
      chain: z
        .enum(SUPPORTED_CHAINS as [string, ...string[]])
        .describe("Chain the vault is on"),
      vaultAddress: addressParam.describe("Vault contract address"),
    },
    async ({ user, chain, vaultAddress }) => {
      try {
        const chainId = CHAIN_CONFIGS[chain.toLowerCase()].chainId;
        const position = await queryUserVaultPosition(user, vaultAddress, chainId);
        if (!position) {
          return jsonResult({ user, vaultAddress, chain, message: "No position found" });
        }

        return jsonResult({
          user,
          vaultAddress,
          chain,
          shares: position.shares,
          assets: position.assets,
          assetsUsd: position.assetsUsd,
        });
      } catch (e) {
        return errorResult(`Failed to get user vault position: ${e}`);
      }
    }
  );

  // ── User All Positions ──────────────────────────────────────────────
  server.tool(
    "morpho_get_user_positions",
    "Get all of a user's Morpho positions across all markets and vaults",
    {
      user: addressParam.describe("User wallet address"),
      chain: chainParam,
    },
    async ({ user, chain }) => {
      try {
        const chainId = chainNameToId(chain);
        const positions = await queryUserPositions(user, chainId);

        const marketPositions = positions.marketPositions
          .filter(
            (p) =>
              p.supplyAssets !== "0" ||
              p.borrowAssets !== "0" ||
              p.collateral !== "0"
          )
          .map((p) => ({
            marketKey: p.market.uniqueKey,
            loanAsset: p.market.loanAsset.symbol,
            collateralAsset: p.market.collateralAsset?.symbol ?? "none",
            supplyAssets: p.supplyAssets,
            supplyAssetsUsd: p.supplyAssetsUsd,
            borrowAssets: p.borrowAssets,
            borrowAssetsUsd: p.borrowAssetsUsd,
            collateral: p.collateral,
            collateralUsd: p.collateralUsd,
          }));

        const vaultPositions = positions.vaultPositions
          .filter((p) => p.assets !== "0")
          .map((p) => ({
            vaultAddress: p.vault.address,
            vaultName: p.vault.name,
            vaultSymbol: p.vault.symbol,
            underlyingAsset: p.vault.asset.symbol,
            chainId: p.vault.chain.id,
            shares: p.shares,
            assets: p.assets,
            assetsUsd: p.assetsUsd,
          }));

        return jsonResult({
          user,
          chain: chain ?? "all",
          marketPositions: {
            count: marketPositions.length,
            positions: marketPositions,
          },
          vaultPositions: {
            count: vaultPositions.length,
            positions: vaultPositions,
          },
        });
      } catch (e) {
        return errorResult(`Failed to get user positions: ${e}`);
      }
    }
  );
}
