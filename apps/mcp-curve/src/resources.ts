import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CHAIN_CONFIGS, SUPPORTED_CHAINS } from "./config/chains.js";

export function registerResources(server: McpServer) {
  // ── Supported Chains ──────────────────────────────────────────────
  server.resource(
    "supported-chains",
    "curve://reference/supported-chains",
    {
      description:
        "All chains supported by the Curve MCP server, with contract addresses",
      mimeType: "application/json",
    },
    async () => {
      const chains = SUPPORTED_CHAINS.map((name) => {
        const c = CHAIN_CONFIGS[name];
        return {
          name,
          chainId: c.chain.id,
          rpcEnvVar: c.rpcEnvVar,
          curve: c.curve,
        };
      });

      return {
        contents: [
          {
            uri: "curve://reference/supported-chains",
            mimeType: "application/json",
            text: JSON.stringify(chains, null, 2),
          },
        ],
      };
    }
  );

  // ── Protocol Overview ─────────────────────────────────────────────
  server.resource(
    "protocol-overview",
    "curve://reference/protocol-overview",
    {
      description:
        "Curve Finance protocol overview — pools, LP tokens, gauges, CRV rewards",
      mimeType: "text/markdown",
    },
    async () => {
      const overview = `# Curve Finance Protocol Overview

## What is Curve?
Curve Finance is a decentralized exchange optimized for low-slippage swaps between similarly-priced assets (stablecoins, wrapped tokens, LSTs). It uses specialized AMM algorithms (StableSwap, CryptoSwap) to achieve deep liquidity with minimal impermanent loss.

## Core Concepts

### Pools
Curve pools hold 2-4 tokens and enable swaps between them. Pool types:
- **StableSwap**: For correlated assets (e.g. USDC/USDT/DAI, stETH/ETH). Uses the StableSwap invariant for tight pricing.
- **CryptoSwap**: For uncorrelated assets (e.g. ETH/CRV). Uses a modified invariant that adapts to price changes.
- **MetaPools**: Pools that pair a token against an existing base pool's LP token (e.g. FRAX/3CRV).

### LP Tokens
When you deposit tokens into a pool, you receive LP tokens representing your share of the pool. LP tokens earn trading fees automatically (fee revenue increases the virtual price).

### Gauges & CRV Rewards
- LP tokens can be staked in a **Gauge** contract to earn CRV token rewards.
- CRV emission rates are set by the Gauge Controller (via governance weight votes).
- On Ethereum mainnet, CRV is claimed via the **Minter** contract. On L2s, CRV is distributed directly through the gauge.
- Gauges may also distribute additional reward tokens from partner protocols.

### veCRV Boosting
- Locking CRV for veCRV (vote-escrowed CRV) boosts your gauge rewards by up to 2.5x.
- CRV APY ranges shown in tools reflect min (no boost) to max (full 2.5x boost).

## Yield Sources
1. **Trading fees**: Earned passively by holding LP tokens. Reflected in increasing virtual price.
2. **CRV emissions**: Earned by staking LP tokens in gauges. Boosted by veCRV holdings.
3. **Extra rewards**: Partner incentives distributed through gauges.

## Typical Workflow
1. \`curve_get_pools\` — Discover pools and compare APYs
2. \`curve_add_liquidity\` — Deposit tokens to get LP tokens
3. \`curve_stake_lp\` — Stake LP tokens in gauge for CRV rewards
4. \`curve_get_claimable_rewards\` — Check pending rewards
5. \`curve_claim_rewards\` — Claim CRV + extra rewards
6. \`curve_unstake_lp\` — Unstake LP tokens from gauge
7. \`curve_remove_liquidity\` — Withdraw underlying tokens

## Swap Precedence
For general token swaps, use the **swap MCP server** (swap_evm_quote / swap_evm_build) which aggregates across all DEXes including Curve. The Curve-specific swap tools (curve_swap_quote / curve_swap_build) are best for direct pool interactions where you want precise control over which Curve pool to use.
`;

      return {
        contents: [
          {
            uri: "curve://reference/protocol-overview",
            mimeType: "text/markdown",
            text: overview,
          },
        ],
      };
    }
  );
}
