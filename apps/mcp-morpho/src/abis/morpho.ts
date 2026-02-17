/**
 * MarketParams tuple type used by Morpho functions.
 * struct MarketParams {
 *   address loanToken;
 *   address collateralToken;
 *   address oracle;
 *   address irm;
 *   uint256 lltv;
 * }
 */
const marketParamsTuple = {
  type: "tuple",
  name: "marketParams",
  components: [
    { name: "loanToken", type: "address" },
    { name: "collateralToken", type: "address" },
    { name: "oracle", type: "address" },
    { name: "irm", type: "address" },
    { name: "lltv", type: "uint256" },
  ],
} as const;

export const morphoAbi = [
  // ── Supply (lend) ─────────────────────────────────────────────────
  {
    type: "function",
    name: "supply",
    inputs: [
      marketParamsTuple,
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "assetsSupplied", type: "uint256" },
      { name: "sharesSupplied", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  // ── Withdraw (supplied assets) ────────────────────────────────────
  {
    type: "function",
    name: "withdraw",
    inputs: [
      marketParamsTuple,
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [
      { name: "assetsWithdrawn", type: "uint256" },
      { name: "sharesWithdrawn", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  // ── Borrow ────────────────────────────────────────────────────────
  {
    type: "function",
    name: "borrow",
    inputs: [
      marketParamsTuple,
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [
      { name: "assetsBorrowed", type: "uint256" },
      { name: "sharesBorrowed", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  // ── Repay ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "repay",
    inputs: [
      marketParamsTuple,
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "assetsRepaid", type: "uint256" },
      { name: "sharesRepaid", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  // ── Supply Collateral ─────────────────────────────────────────────
  {
    type: "function",
    name: "supplyCollateral",
    inputs: [
      marketParamsTuple,
      { name: "assets", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ── Withdraw Collateral ───────────────────────────────────────────
  {
    type: "function",
    name: "withdrawCollateral",
    inputs: [
      marketParamsTuple,
      { name: "assets", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ── Read: position ────────────────────────────────────────────────
  {
    type: "function",
    name: "position",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [
      { name: "supplyShares", type: "uint256" },
      { name: "borrowShares", type: "uint128" },
      { name: "collateral", type: "uint128" },
    ],
    stateMutability: "view",
  },
  // ── Read: market state ────────────────────────────────────────────
  {
    type: "function",
    name: "market",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "totalSupplyAssets", type: "uint128" },
      { name: "totalSupplyShares", type: "uint128" },
      { name: "totalBorrowAssets", type: "uint128" },
      { name: "totalBorrowShares", type: "uint128" },
      { name: "lastUpdate", type: "uint128" },
      { name: "fee", type: "uint128" },
    ],
    stateMutability: "view",
  },
  // ── Read: idToMarketParams ────────────────────────────────────────
  {
    type: "function",
    name: "idToMarketParams",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "loanToken", type: "address" },
      { name: "collateralToken", type: "address" },
      { name: "oracle", type: "address" },
      { name: "irm", type: "address" },
      { name: "lltv", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;
