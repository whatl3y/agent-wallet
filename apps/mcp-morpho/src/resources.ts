import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CHAIN_CONFIGS, SUPPORTED_CHAINS } from "./config.js";

export function registerResources(server: McpServer) {
  // ── Supported Chains Reference ─────────────────────────────────────
  server.resource(
    "supported-chains",
    "morpho://reference/supported-chains",
    {
      description:
        "List of all supported chains with Morpho contract addresses",
      mimeType: "application/json",
    },
    async (uri) => {
      const data = Object.entries(CHAIN_CONFIGS).map(([name, config]) => ({
        chain: name,
        chainId: config.chainId,
        contracts: {
          morpho: config.morpho.morpho,
          bundler3: config.morpho.bundler3,
          adaptiveCurveIrm: config.morpho.adaptiveCurveIrm,
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
    "morpho://reference/protocol-overview",
    {
      description:
        "Overview of Morpho protocol concepts: markets, vaults, lending, borrowing, collateral, etc.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: `# Morpho Protocol Overview

## What is Morpho?

Morpho is the universal lending network — open infrastructure for onchain lending and borrowing. Unlike pool-based lending protocols, Morpho uses isolated markets with specific parameters, giving lenders and borrowers more control and efficiency.

## Core Concepts

### Markets
- **Isolated markets**: Each market is defined by a unique combination of 5 parameters:
  - **Loan Token**: The token being lent and borrowed (e.g., USDC)
  - **Collateral Token**: The token used as collateral (e.g., WETH)
  - **Oracle**: The price oracle used for liquidation calculations
  - **IRM (Interest Rate Model)**: The model that determines interest rates based on utilization
  - **LLTV (Liquidation LTV)**: The loan-to-value ratio at which positions become liquidatable
- Markets are permissionless — anyone can create a market with any parameters
- Each market has its own supply, borrow, and utilization metrics

### Supply (Lending)
- Supply loan tokens to a market to earn interest
- Interest accrues based on the market's utilization and IRM
- Suppliers receive "supply shares" representing their position
- No aTokens — positions are tracked natively in the Morpho contract

### Borrow
- Deposit collateral, then borrow loan tokens against it
- Must maintain a healthy LTV ratio (below LLTV) to avoid liquidation
- Interest accrues on borrowed amount

### Collateral
- Collateral must be supplied before borrowing
- Collateral does NOT earn interest (unlike some other protocols)
- Can be withdrawn as long as the position remains healthy

### Vaults (MetaMorpho / ERC4626)
- Curated lending strategies built on top of Morpho markets
- Vault curators allocate deposits across multiple markets
- Users deposit the underlying asset and receive vault shares
- Earn yield through the curator's market allocation strategy
- Follow the ERC4626 standard (deposit/withdraw/redeem)

### Liquidation
- When a position's LTV exceeds the market's LLTV, it becomes liquidatable
- Liquidators repay part of the debt and receive collateral at a discount

### Key Differences from Pool-Based Protocols
- **Isolated markets** vs shared pools — risk is compartmentalized
- **No governance-gated listings** — markets are permissionless
- **Collateral doesn't earn interest** — but this means simpler risk management
- **Vaults provide curation** — similar UX to pool-based lending but with isolated market benefits

## Supported Chains
${SUPPORTED_CHAINS.map((c) => `- ${c} (chainId: ${CHAIN_CONFIGS[c].chainId})`).join("\n")}

## Morpho Contract (same on all chains)
\`${CHAIN_CONFIGS.ethereum.morpho.morpho}\`

## Typical Workflow

### To Lend (earn interest):
1. Call \`morpho_get_markets\` to find markets with good supply APY
2. Call \`morpho_supply\` to lend tokens to a market

### To Borrow:
1. Call \`morpho_get_markets\` to find suitable markets
2. Call \`morpho_supply_collateral\` to deposit collateral
3. Call \`morpho_borrow\` to borrow against your collateral

### To Use Vaults (easiest):
1. Call \`morpho_get_vaults\` to find vaults with good APY
2. Call \`morpho_vault_deposit\` to deposit into a vault
`,
        },
      ],
    })
  );
}
