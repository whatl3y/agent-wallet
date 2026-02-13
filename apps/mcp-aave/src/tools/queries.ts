import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPublicClient } from "../clients.js";
import { getChainConfig, SUPPORTED_CHAINS } from "../config/chains.js";
import { poolAbi } from "../abis/pool.js";
import { dataProviderAbi } from "../abis/data-provider.js";
import { oracleAbi } from "../abis/oracle.js";
import { variableDebtTokenAbi } from "../abis/variable-debt-token.js";
import { stakedAaveAbi } from "../abis/staked-aave.js";
import { aaveTokenAbi } from "../abis/aave-token.js";
import {
  formatBaseCurrency,
  formatWad,
  rayToPercent,
  formatAmount,
  jsonResult,
  errorResult,
} from "../utils.js";

const chainParam = z
  .enum(SUPPORTED_CHAINS as [string, ...string[]])
  .describe("Chain to query (ethereum, polygon, arbitrum, optimism, base, avalanche)");

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

export function registerQueryTools(server: McpServer) {
  // ── User Account Data ──────────────────────────────────────────────
  server.tool(
    "aave_get_user_account_data",
    "Get a user's aggregated AAVE position: total collateral, total debt, available borrows, LTV, liquidation threshold, and health factor",
    {
      chain: chainParam,
      user: addressParam.describe("User wallet address"),
    },
    async ({ chain, user }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const result = await client.readContract({
          address: config.aave.pool,
          abi: poolAbi,
          functionName: "getUserAccountData",
          args: [user as `0x${string}`],
        });

        const [
          totalCollateralBase,
          totalDebtBase,
          availableBorrowsBase,
          currentLiquidationThreshold,
          ltv,
          healthFactor,
        ] = result;

        return jsonResult({
          chain,
          user,
          totalCollateralUSD: formatBaseCurrency(totalCollateralBase),
          totalDebtUSD: formatBaseCurrency(totalDebtBase),
          availableBorrowsUSD: formatBaseCurrency(availableBorrowsBase),
          currentLiquidationThreshold: `${Number(currentLiquidationThreshold) / 100}%`,
          ltv: `${Number(ltv) / 100}%`,
          healthFactor: formatWad(healthFactor),
          isAtRisk: healthFactor < 1_100_000_000_000_000_000n, // < 1.1
        });
      } catch (e) {
        return errorResult(`Failed to get user account data: ${e}`);
      }
    }
  );

  // ── User Reserve Data (per asset) ──────────────────────────────────
  server.tool(
    "aave_get_user_reserve_data",
    "Get a user's position details for a specific asset: aToken balance, variable debt, stable debt, collateral enabled, and rates",
    {
      chain: chainParam,
      asset: addressParam.describe("Reserve token address"),
      user: addressParam.describe("User wallet address"),
    },
    async ({ chain, asset, user }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const result = await client.readContract({
          address: config.aave.poolDataProvider,
          abi: dataProviderAbi,
          functionName: "getUserReserveData",
          args: [asset as `0x${string}`, user as `0x${string}`],
        });

        const [
          currentATokenBalance,
          currentStableDebt,
          currentVariableDebt,
          principalStableDebt,
          scaledVariableDebt,
          stableBorrowRate,
          liquidityRate,
          stableRateLastUpdated,
          usageAsCollateralEnabled,
        ] = result;

        return jsonResult({
          chain,
          asset,
          user,
          currentATokenBalance: currentATokenBalance.toString(),
          currentStableDebt: currentStableDebt.toString(),
          currentVariableDebt: currentVariableDebt.toString(),
          principalStableDebt: principalStableDebt.toString(),
          scaledVariableDebt: scaledVariableDebt.toString(),
          stableBorrowRate: rayToPercent(stableBorrowRate),
          liquidityRate: rayToPercent(liquidityRate),
          stableRateLastUpdated: stableRateLastUpdated.toString(),
          usageAsCollateralEnabled,
        });
      } catch (e) {
        return errorResult(`Failed to get user reserve data: ${e}`);
      }
    }
  );

  // ── Reserve Data ───────────────────────────────────────────────────
  server.tool(
    "aave_get_reserve_data",
    "Get reserve-level data for an asset: total supply, total debt, liquidity rate, variable borrow rate, and utilization metrics",
    {
      chain: chainParam,
      asset: addressParam.describe("Reserve token address"),
    },
    async ({ chain, asset }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const result = await client.readContract({
          address: config.aave.poolDataProvider,
          abi: dataProviderAbi,
          functionName: "getReserveData",
          args: [asset as `0x${string}`],
        });

        const [
          unbacked,
          accruedToTreasuryScaled,
          totalAToken,
          totalStableDebt,
          totalVariableDebt,
          liquidityRate,
          variableBorrowRate,
          stableBorrowRate,
          averageStableBorrowRate,
          liquidityIndex,
          variableBorrowIndex,
          lastUpdateTimestamp,
        ] = result;

        return jsonResult({
          chain,
          asset,
          unbacked: unbacked.toString(),
          accruedToTreasuryScaled: accruedToTreasuryScaled.toString(),
          totalAToken: totalAToken.toString(),
          totalStableDebt: totalStableDebt.toString(),
          totalVariableDebt: totalVariableDebt.toString(),
          liquidityRate: rayToPercent(liquidityRate),
          variableBorrowRate: rayToPercent(variableBorrowRate),
          stableBorrowRate: rayToPercent(stableBorrowRate),
          averageStableBorrowRate: rayToPercent(averageStableBorrowRate),
          liquidityIndex: liquidityIndex.toString(),
          variableBorrowIndex: variableBorrowIndex.toString(),
          lastUpdateTimestamp: lastUpdateTimestamp.toString(),
        });
      } catch (e) {
        return errorResult(`Failed to get reserve data: ${e}`);
      }
    }
  );

  // ── Reserve Configuration ──────────────────────────────────────────
  server.tool(
    "aave_get_reserve_config",
    "Get risk parameters for a reserve: LTV, liquidation threshold/bonus, reserve factor, caps, and status flags",
    {
      chain: chainParam,
      asset: addressParam.describe("Reserve token address"),
    },
    async ({ chain, asset }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);

        const [configData, caps] = await Promise.all([
          client.readContract({
            address: config.aave.poolDataProvider,
            abi: dataProviderAbi,
            functionName: "getReserveConfigurationData",
            args: [asset as `0x${string}`],
          }),
          client.readContract({
            address: config.aave.poolDataProvider,
            abi: dataProviderAbi,
            functionName: "getReserveCaps",
            args: [asset as `0x${string}`],
          }),
        ]);

        const [
          decimals, ltv, liquidationThreshold, liquidationBonus,
          reserveFactor, usageAsCollateralEnabled, borrowingEnabled,
          stableBorrowRateEnabled, isActive, isFrozen,
        ] = configData;

        const [borrowCap, supplyCap] = caps;

        return jsonResult({
          chain,
          asset,
          decimals: Number(decimals),
          ltv: `${Number(ltv) / 100}%`,
          liquidationThreshold: `${Number(liquidationThreshold) / 100}%`,
          liquidationBonus: `${Number(liquidationBonus) / 100}%`,
          reserveFactor: `${Number(reserveFactor) / 100}%`,
          usageAsCollateralEnabled,
          borrowingEnabled,
          stableBorrowRateEnabled,
          isActive,
          isFrozen,
          borrowCap: borrowCap.toString(),
          supplyCap: supplyCap.toString(),
        });
      } catch (e) {
        return errorResult(`Failed to get reserve config: ${e}`);
      }
    }
  );

  // ── All Reserves List ──────────────────────────────────────────────
  server.tool(
    "aave_get_all_reserves",
    "List all supported reserve tokens on AAVE for a given chain, with symbols and addresses",
    {
      chain: chainParam,
    },
    async ({ chain }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const reserves = await client.readContract({
          address: config.aave.poolDataProvider,
          abi: dataProviderAbi,
          functionName: "getAllReservesTokens",
        });

        return jsonResult({
          chain,
          count: reserves.length,
          reserves: reserves.map((r) => ({
            symbol: r.symbol,
            address: r.tokenAddress,
          })),
        });
      } catch (e) {
        return errorResult(`Failed to get reserves list: ${e}`);
      }
    }
  );

  // ── Asset Price ────────────────────────────────────────────────────
  server.tool(
    "aave_get_asset_price",
    "Get the current oracle price of an asset in USD (8 decimal precision)",
    {
      chain: chainParam,
      asset: addressParam.describe("Token address to price"),
    },
    async ({ chain, asset }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const price = await client.readContract({
          address: config.aave.oracle,
          abi: oracleAbi,
          functionName: "getAssetPrice",
          args: [asset as `0x${string}`],
        });

        return jsonResult({
          chain,
          asset,
          priceUSD: formatBaseCurrency(price),
          priceRaw: price.toString(),
        });
      } catch (e) {
        return errorResult(`Failed to get asset price: ${e}`);
      }
    }
  );

  // ── Batch Asset Prices ─────────────────────────────────────────────
  server.tool(
    "aave_get_asset_prices",
    "Get oracle prices for multiple assets in a single call",
    {
      chain: chainParam,
      assets: z
        .array(addressParam)
        .min(1)
        .describe("Array of token addresses to price"),
    },
    async ({ chain, assets }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const prices = await client.readContract({
          address: config.aave.oracle,
          abi: oracleAbi,
          functionName: "getAssetsPrices",
          args: [assets as `0x${string}`[]],
        });

        return jsonResult({
          chain,
          prices: assets.map((addr, i) => ({
            asset: addr,
            priceUSD: formatBaseCurrency(prices[i]),
            priceRaw: prices[i].toString(),
          })),
        });
      } catch (e) {
        return errorResult(`Failed to get asset prices: ${e}`);
      }
    }
  );

  // ── User eMode ─────────────────────────────────────────────────────
  server.tool(
    "aave_get_user_emode",
    "Get the user's current efficiency mode category ID (0 = disabled)",
    {
      chain: chainParam,
      user: addressParam.describe("User wallet address"),
    },
    async ({ chain, user }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const eModeId = await client.readContract({
          address: config.aave.pool,
          abi: poolAbi,
          functionName: "getUserEMode",
          args: [user as `0x${string}`],
        });

        return jsonResult({
          chain,
          user,
          eModeCategory: Number(eModeId),
          enabled: Number(eModeId) !== 0,
        });
      } catch (e) {
        return errorResult(`Failed to get user eMode: ${e}`);
      }
    }
  );

  // ── eMode Category Data ────────────────────────────────────────────
  server.tool(
    "aave_get_emode_category",
    "Get configuration details for an efficiency mode category: LTV, liquidation threshold/bonus, label",
    {
      chain: chainParam,
      categoryId: z.number().int().min(0).max(255).describe("eMode category ID"),
    },
    async ({ chain, categoryId }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const data = await client.readContract({
          address: config.aave.pool,
          abi: poolAbi,
          functionName: "getEModeCategoryData",
          args: [categoryId],
        });

        return jsonResult({
          chain,
          categoryId,
          ltv: `${Number(data.ltv) / 100}%`,
          liquidationThreshold: `${Number(data.liquidationThreshold) / 100}%`,
          liquidationBonus: `${Number(data.liquidationBonus) / 100}%`,
          priceSource: data.priceSource,
          label: data.label,
        });
      } catch (e) {
        return errorResult(`Failed to get eMode category: ${e}`);
      }
    }
  );

  // ── Flash Loan Premium ─────────────────────────────────────────────
  server.tool(
    "aave_get_flash_loan_premium",
    "Get the current flash loan premium (fee percentage) for a chain",
    {
      chain: chainParam,
    },
    async ({ chain }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const premium = await client.readContract({
          address: config.aave.pool,
          abi: poolAbi,
          functionName: "FLASHLOAN_PREMIUM_TOTAL",
        });

        return jsonResult({
          chain,
          premiumBps: Number(premium),
          premiumPercent: `${Number(premium) / 100}%`,
        });
      } catch (e) {
        return errorResult(`Failed to get flash loan premium: ${e}`);
      }
    }
  );

  // ── Reserve Token Addresses ────────────────────────────────────────
  server.tool(
    "aave_get_reserve_token_addresses",
    "Get the aToken, stable debt token, and variable debt token addresses for a reserve",
    {
      chain: chainParam,
      asset: addressParam.describe("Reserve token address"),
    },
    async ({ chain, asset }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const result = await client.readContract({
          address: config.aave.poolDataProvider,
          abi: dataProviderAbi,
          functionName: "getReserveTokensAddresses",
          args: [asset as `0x${string}`],
        });

        const [aTokenAddress, stableDebtTokenAddress, variableDebtTokenAddress] = result;

        return jsonResult({
          chain,
          asset,
          aTokenAddress,
          stableDebtTokenAddress,
          variableDebtTokenAddress,
        });
      } catch (e) {
        return errorResult(`Failed to get reserve token addresses: ${e}`);
      }
    }
  );

  // ── Credit Delegation Allowance ────────────────────────────────────
  server.tool(
    "aave_get_borrow_allowance",
    "Check the credit delegation allowance: how much a delegatee is allowed to borrow on behalf of a delegator",
    {
      chain: chainParam,
      variableDebtToken: addressParam.describe("Variable debt token address (get via aave_get_reserve_token_addresses)"),
      delegator: addressParam.describe("Address that granted the delegation"),
      delegatee: addressParam.describe("Address that received the delegation"),
    },
    async ({ chain, variableDebtToken, delegator, delegatee }) => {
      try {
        const client = getPublicClient(chain);
        const allowance = await client.readContract({
          address: variableDebtToken as `0x${string}`,
          abi: variableDebtTokenAbi,
          functionName: "borrowAllowance",
          args: [delegator as `0x${string}`, delegatee as `0x${string}`],
        });

        return jsonResult({
          chain,
          variableDebtToken,
          delegator,
          delegatee,
          borrowAllowance: allowance.toString(),
        });
      } catch (e) {
        return errorResult(`Failed to get borrow allowance: ${e}`);
      }
    }
  );

  // ── Staking Rewards (Ethereum only) ────────────────────────────────
  server.tool(
    "aave_get_staking_info",
    "Get staking info for stkAAVE: staked balance, pending rewards, cooldown status. Ethereum only.",
    {
      user: addressParam.describe("User wallet address"),
    },
    async ({ user }) => {
      try {
        const config = getChainConfig("ethereum");
        if (!config.aave.stakedAave) {
          return errorResult("StakedAave not available on this chain");
        }

        const client = getPublicClient("ethereum");
        const [balance, rewards, cooldownTimestamp, cooldownSeconds, unstakeWindow] =
          await Promise.all([
            client.readContract({
              address: config.aave.stakedAave,
              abi: stakedAaveAbi,
              functionName: "balanceOf",
              args: [user as `0x${string}`],
            }),
            client.readContract({
              address: config.aave.stakedAave,
              abi: stakedAaveAbi,
              functionName: "getTotalRewardsBalance",
              args: [user as `0x${string}`],
            }),
            client.readContract({
              address: config.aave.stakedAave,
              abi: stakedAaveAbi,
              functionName: "stakersCooldowns",
              args: [user as `0x${string}`],
            }),
            client.readContract({
              address: config.aave.stakedAave,
              abi: stakedAaveAbi,
              functionName: "COOLDOWN_SECONDS",
            }),
            client.readContract({
              address: config.aave.stakedAave,
              abi: stakedAaveAbi,
              functionName: "UNSTAKE_WINDOW",
            }),
          ]);

        return jsonResult({
          chain: "ethereum",
          user,
          stakedBalance: formatAmount(balance, 18),
          pendingRewards: formatAmount(rewards, 18),
          cooldownTimestamp: cooldownTimestamp.toString(),
          cooldownSeconds: cooldownSeconds.toString(),
          unstakeWindowSeconds: unstakeWindow.toString(),
          cooldownActive: cooldownTimestamp > 0n,
        });
      } catch (e) {
        return errorResult(`Failed to get staking info: ${e}`);
      }
    }
  );

  // ── Governance Voting Power (Ethereum only) ────────────────────────
  server.tool(
    "aave_get_voting_power",
    "Get a user's governance voting and proposition power from AAVE token. Ethereum only.",
    {
      user: addressParam.describe("User wallet address"),
    },
    async ({ user }) => {
      try {
        const config = getChainConfig("ethereum");
        if (!config.aave.aaveToken) {
          return errorResult("AAVE token not available on this chain");
        }

        const client = getPublicClient("ethereum");
        const [votingPower, propositionPower, balance] = await Promise.all([
          client.readContract({
            address: config.aave.aaveToken,
            abi: aaveTokenAbi,
            functionName: "getPowerCurrent",
            args: [user as `0x${string}`, 0],
          }),
          client.readContract({
            address: config.aave.aaveToken,
            abi: aaveTokenAbi,
            functionName: "getPowerCurrent",
            args: [user as `0x${string}`, 1],
          }),
          client.readContract({
            address: config.aave.aaveToken,
            abi: aaveTokenAbi,
            functionName: "balanceOf",
            args: [user as `0x${string}`],
          }),
        ]);

        return jsonResult({
          chain: "ethereum",
          user,
          aaveBalance: formatAmount(balance, 18),
          votingPower: formatAmount(votingPower, 18),
          propositionPower: formatAmount(propositionPower, 18),
        });
      } catch (e) {
        return errorResult(`Failed to get voting power: ${e}`);
      }
    }
  );

  // ── Flash Loan Eligibility Check ───────────────────────────────────
  server.tool(
    "aave_get_flash_loan_enabled",
    "Check if flash loans are enabled for a specific asset on a chain",
    {
      chain: chainParam,
      asset: addressParam.describe("Reserve token address"),
    },
    async ({ chain, asset }) => {
      try {
        const client = getPublicClient(chain);
        const config = getChainConfig(chain);
        const enabled = await client.readContract({
          address: config.aave.poolDataProvider,
          abi: dataProviderAbi,
          functionName: "getFlashLoanEnabled",
          args: [asset as `0x${string}`],
        });

        return jsonResult({ chain, asset, flashLoanEnabled: enabled });
      } catch (e) {
        return errorResult(`Failed to check flash loan eligibility: ${e}`);
      }
    }
  );
}
