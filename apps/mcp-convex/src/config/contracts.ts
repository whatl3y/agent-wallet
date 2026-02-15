/**
 * Convex Finance contract addresses on Ethereum mainnet.
 * Source: https://docs.convexfinance.com/convexfinance/faq/contract-addresses
 */

export const CONVEX_CONTRACTS = {
  // ── Core ───────────────────────────────────────────────────────────
  /** Main deposit/withdraw contract for Curve LP tokens */
  booster: "0xF403C135812408BFbE8713b5A23a04b3D48AAE31" as `0x${string}`,
  /** Proxy that holds veCRV and interacts with Curve gauges */
  voterProxy: "0x989AEb4d175e16225E39E87d0D97A3360524AD80" as `0x${string}`,

  // ── Tokens ────────────────────────────────────────────────────────
  /** CVX governance token */
  cvx: "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B" as `0x${string}`,
  /** cvxCRV — wrapped veCRV (irreversible from CRV) */
  cvxCrv: "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7" as `0x${string}`,
  /** CRV token on Ethereum */
  crv: "0xD533a949740bb3306d119CC777fa900bA034cd52" as `0x${string}`,

  // ── CRV → cvxCRV conversion ───────────────────────────────────────
  /** CRV Depositor — converts CRV to cvxCRV (one-way) */
  crvDepositor: "0x8014595F2AB54cD7c604B00E9fb932176fDc86Ae" as `0x${string}`,

  // ── Staking ───────────────────────────────────────────────────────
  /** CVX staking pool (rewards in cvxCRV) */
  cvxRewardPool: "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332" as `0x${string}`,
  /** Legacy cvxCRV staking (BaseRewardPool) */
  cvxCrvRewards: "0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e" as `0x${string}`,
  /** New cvxCRV staking wrapper with reward weight selection */
  cvxCrvStaking: "0xaa0C3f5F7DFD688C6E646F66CD2a6B66ACdbE434" as `0x${string}`,

  // ── Locking ───────────────────────────────────────────────────────
  /** vlCVX — vote-locked CVX for governance (16-week lock) */
  cvxLocker: "0x72a19342e8F1838460eBFCCEf09F6585e32db86E" as `0x${string}`,

  // ── Utilities ─────────────────────────────────────────────────────
  /** Batch claim from multiple pools + auto-convert/lock */
  claimZap: "0x3f29cB4111CbdA8081642DA1f75B3c12DECf2516" as `0x${string}`,
} as const;

/** Ethereum mainnet chain ID */
export const CHAIN_ID = 1;

/** RPC environment variable name */
export const RPC_ENV_VAR = "ETHEREUM_RPC_URL";
