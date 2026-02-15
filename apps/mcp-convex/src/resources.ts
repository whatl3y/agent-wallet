import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONVEX_CONTRACTS } from "./config/contracts.js";

export function registerResources(server: McpServer) {
  // ── Contract Addresses ─────────────────────────────────────────────
  server.resource(
    "contract-addresses",
    "convex://reference/contract-addresses",
    {
      description:
        "All Convex Finance contract addresses on Ethereum mainnet",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "convex://reference/contract-addresses",
          mimeType: "application/json",
          text: JSON.stringify(CONVEX_CONTRACTS, null, 2),
        },
      ],
    })
  );

  // ── Protocol Overview ──────────────────────────────────────────────
  server.resource(
    "protocol-overview",
    "convex://reference/protocol-overview",
    {
      description:
        "Convex Finance protocol overview — boosted CRV yield, CVX staking, vlCVX governance",
      mimeType: "text/markdown",
    },
    async () => {
      const overview = `# Convex Finance Protocol Overview

## What is Convex?
Convex Finance is a yield optimization protocol built on top of Curve Finance. It allows Curve LP token holders to earn boosted CRV rewards without needing to lock their own CRV as veCRV. Convex aggregates veCRV from all depositors to maximize boost for everyone.

## Core Concepts

### Boosted Yield via Booster
- Deposit Curve LP tokens into Convex through the **Booster** contract.
- Convex stakes them in Curve gauges using its massive veCRV position for maximum boost (up to 2.5x).
- Depositors earn boosted CRV + additional CVX token rewards.

### CVX Token
- **CVX** is Convex's governance token (address: ${CONVEX_CONTRACTS.cvx}).
- CVX was minted proportionally to CRV earned (now fully minted at ~100M supply).
- CVX can be staked in the reward pool to earn cvxCRV (platform fee share).
- CVX can be locked as **vlCVX** for governance power over Curve gauge weights.

### cvxCRV
- **cvxCRV** is a tokenized representation of CRV locked as veCRV (address: ${CONVEX_CONTRACTS.cvxCrv}).
- Converting CRV → cvxCRV is **irreversible** (one-way).
- cvxCRV can be staked to earn CRV, CVX, and crvUSD rewards.
- cvxCRV trades on secondary markets (e.g. Curve cvxCRV/CRV pool).

### vlCVX (Vote-Locked CVX)
- Lock CVX for a minimum of 16 weeks to receive **vlCVX** (address: ${CONVEX_CONTRACTS.cvxLocker}).
- vlCVX holders vote on Curve gauge weight allocations (the "Curve Wars").
- vlCVX earns platform fee revenue from Convex.
- After lock expiry, choose to relock or withdraw.

## Yield Sources
1. **Boosted CRV**: Earned from Curve gauge via Convex's veCRV boost.
2. **CVX rewards**: Previously minted proportionally to CRV earned (now fully minted).
3. **Extra rewards**: Some pools distribute additional partner incentive tokens.
4. **CVX staking**: Staking CVX earns cvxCRV from platform fees.
5. **cvxCRV staking**: Earns CRV, CVX, and crvUSD.
6. **vlCVX rewards**: Platform fee revenue for governance participants.

## Typical Workflows

### Earn Boosted Curve Yield
1. \`convex_get_pools\` — Find pools and their reward contracts
2. \`convex_deposit\` — Deposit Curve LP tokens (auto-stakes for rewards)
3. \`convex_get_claimable_rewards\` — Check pending rewards
4. \`convex_claim_rewards\` — Claim CRV + extra rewards
5. \`convex_unstake_and_withdraw\` — Exit position back to Curve LP tokens

### Stake CVX
1. \`convex_stake_cvx\` — Stake CVX to earn cvxCRV rewards
2. \`convex_get_cvx_staking_info\` — Check staked balance and pending rewards
3. \`convex_unstake_cvx\` — Unstake with optional reward claim

### Lock CVX for Governance
1. \`convex_lock_cvx\` — Lock CVX as vlCVX (16-week minimum)
2. \`convex_get_vlcvx_info\` — View lock schedule and claimable rewards
3. \`convex_claim_vlcvx_rewards\` — Claim locker rewards
4. \`convex_process_expired_locks\` — Relock or withdraw after expiry

### Convert & Stake cvxCRV
1. \`convex_convert_crv_to_cvxcrv\` — Convert CRV → cvxCRV (IRREVERSIBLE)
2. \`convex_stake_cvxcrv\` — Stake cvxCRV for rewards
3. \`convex_get_cvxcrv_staking_info\` — Check position
4. \`convex_claim_cvxcrv_rewards\` — Claim staking rewards

## Important Notes
- Convex is deployed **only on Ethereum mainnet**.
- All pool operations use **pool IDs** (pid) — get these from \`convex_get_pools\`.
- CRV → cvxCRV conversion is **one-way and irreversible**.
- CVX minting has ended (100M max supply reached).
- vlCVX locks are for a minimum of 16 full epochs (~16 weeks).
`;

      return {
        contents: [
          {
            uri: "convex://reference/protocol-overview",
            mimeType: "text/markdown",
            text: overview,
          },
        ],
      };
    }
  );
}
