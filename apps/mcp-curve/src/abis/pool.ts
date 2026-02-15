// ── Shared view functions (same for all pool sizes) ──────────────────
export const poolViewAbi = [
  {
    type: "function",
    name: "coins",
    inputs: [{ name: "i", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balances",
    inputs: [{ name: "i", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "get_virtual_price",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "A",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "fee",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "get_dy",
    inputs: [
      { name: "i", type: "int128" },
      { name: "j", type: "int128" },
      { name: "dx", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "exchange",
    inputs: [
      { name: "i", type: "int128" },
      { name: "j", type: "int128" },
      { name: "dx", type: "uint256" },
      { name: "min_dy", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

// ── 2-coin pool ABI ─────────────────────────────────────────────────
export const pool2Abi = [
  {
    type: "function",
    name: "add_liquidity",
    inputs: [
      { name: "_amounts", type: "uint256[2]" },
      { name: "_min_mint_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remove_liquidity",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_min_amounts", type: "uint256[2]" },
    ],
    outputs: [{ name: "", type: "uint256[2]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remove_liquidity_one_coin",
    inputs: [
      { name: "_token_amount", type: "uint256" },
      { name: "i", type: "int128" },
      { name: "_min_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remove_liquidity_imbalance",
    inputs: [
      { name: "_amounts", type: "uint256[2]" },
      { name: "_max_burn_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "calc_token_amount",
    inputs: [
      { name: "_amounts", type: "uint256[2]" },
      { name: "_is_deposit", type: "bool" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ── 3-coin pool ABI ─────────────────────────────────────────────────
export const pool3Abi = [
  {
    type: "function",
    name: "add_liquidity",
    inputs: [
      { name: "_amounts", type: "uint256[3]" },
      { name: "_min_mint_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remove_liquidity",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_min_amounts", type: "uint256[3]" },
    ],
    outputs: [{ name: "", type: "uint256[3]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remove_liquidity_one_coin",
    inputs: [
      { name: "_token_amount", type: "uint256" },
      { name: "i", type: "int128" },
      { name: "_min_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remove_liquidity_imbalance",
    inputs: [
      { name: "_amounts", type: "uint256[3]" },
      { name: "_max_burn_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "calc_token_amount",
    inputs: [
      { name: "_amounts", type: "uint256[3]" },
      { name: "_is_deposit", type: "bool" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ── 4-coin pool ABI ─────────────────────────────────────────────────
export const pool4Abi = [
  {
    type: "function",
    name: "add_liquidity",
    inputs: [
      { name: "_amounts", type: "uint256[4]" },
      { name: "_min_mint_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remove_liquidity",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_min_amounts", type: "uint256[4]" },
    ],
    outputs: [{ name: "", type: "uint256[4]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remove_liquidity_one_coin",
    inputs: [
      { name: "_token_amount", type: "uint256" },
      { name: "i", type: "int128" },
      { name: "_min_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "remove_liquidity_imbalance",
    inputs: [
      { name: "_amounts", type: "uint256[4]" },
      { name: "_max_burn_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "calc_token_amount",
    inputs: [
      { name: "_amounts", type: "uint256[4]" },
      { name: "_is_deposit", type: "bool" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * Select the appropriate pool ABI for add/remove liquidity based on coin count.
 */
export function getPoolAbiForCoinCount(coinCount: number) {
  switch (coinCount) {
    case 2:
      return pool2Abi;
    case 3:
      return pool3Abi;
    case 4:
      return pool4Abi;
    default:
      throw new Error(
        `Unsupported pool coin count: ${coinCount}. Only 2, 3, and 4-coin pools are supported.`
      );
  }
}
