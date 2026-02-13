import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CHAIN_CONFIGS, SUPPORTED_CHAINS } from "./config/chains.js";

export function registerResources(server: McpServer) {
  // ── Supported Chains Reference ─────────────────────────────────────
  server.resource(
    "supported-chains",
    "aave://reference/supported-chains",
    {
      description:
        "List of all supported chains with AAVE V3 contract addresses",
      mimeType: "application/json",
    },
    async (uri) => {
      const data = Object.entries(CHAIN_CONFIGS).map(([name, config]) => ({
        chain: name,
        chainId: config.chain.id,
        contracts: {
          pool: config.aave.pool,
          poolDataProvider: config.aave.poolDataProvider,
          oracle: config.aave.oracle,
          poolAddressesProvider: config.aave.poolAddressesProvider,
          wrappedTokenGateway: config.aave.wrappedTokenGateway,
          wrappedNativeToken: config.aave.wrappedNativeToken,
          ...(config.aave.stakedAave && { stakedAave: config.aave.stakedAave }),
          ...(config.aave.aaveToken && { aaveToken: config.aave.aaveToken }),
        },
      }));

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  // ── Protocol Overview ──────────────────────────────────────────────
  server.resource(
    "protocol-overview",
    "aave://reference/protocol-overview",
    {
      description:
        "Overview of AAVE V3 protocol concepts: lending, borrowing, eMode, flash loans, health factor, etc.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: `# AAVE V3 Protocol Overview

## Core Concepts

### Supply & Borrow
- **Supply**: Deposit tokens to earn interest. You receive aTokens that accrue yield.
- **Borrow**: Take loans against your collateral. Only variable rate is active in V3.
- **Health Factor**: Ratio of collateral value to debt. Liquidation occurs below 1.0.

### Interest Rates
- Rates are expressed in RAY (27 decimals). Divide by 1e25 to get percentage.
- Variable rate changes with utilization. Higher utilization = higher rates.

### Collateral & LTV
- Each asset has a Loan-to-Value (LTV) ratio determining max borrowing power.
- Liquidation threshold is slightly above LTV — the point where liquidation is possible.
- You can enable/disable individual assets as collateral.

### Efficiency Mode (eMode)
- Groups correlated assets (e.g., stablecoins, ETH variants) for higher LTV.
- Category 0 = disabled. Each category has its own LTV/threshold parameters.

### Flash Loans
- Borrow any amount with no collateral — must repay within the same transaction.
- Premium: ~0.05% (configurable per pool).
- Multi-asset flash loans supported.

### Liquidation
- When health factor < 1.0, anyone can repay up to 50% of debt (100% if HF < 0.95).
- Liquidator receives collateral + liquidation bonus (typically 5-10%).

### Credit Delegation
- Approve another address to borrow using your collateral via \`approveDelegation\` on the debt token.

### GHO Stablecoin (Ethereum only)
- AAVE's native stablecoin. Minted when borrowed, burned when repaid.
- No pool liquidity needed — the Pool contract is a GHO facilitator.

### Governance
- AAVE, stkAAVE, and aAAVE tokens carry voting + proposition power.
- Governance V3 supports cross-chain voting.

### Safety Module (Staking)
- Stake AAVE → receive stkAAVE. Earn rewards, but staked funds can be slashed.
- Unstaking requires a cooldown period followed by an unstake window.

## Supported Chains
${SUPPORTED_CHAINS.map((c) => `- ${c} (chainId: ${CHAIN_CONFIGS[c].chain.id})`).join("\n")}

## Key Addresses (Ethereum)
- Pool: \`${CHAIN_CONFIGS.ethereum.aave.pool}\`
- Oracle: \`${CHAIN_CONFIGS.ethereum.aave.oracle}\`
- stkAAVE: \`${CHAIN_CONFIGS.ethereum.aave.stakedAave}\`
- AAVE Token: \`${CHAIN_CONFIGS.ethereum.aave.aaveToken}\`
`,
        },
      ],
    })
  );
}
