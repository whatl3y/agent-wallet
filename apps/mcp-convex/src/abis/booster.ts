/**
 * Convex Booster ABI — main deposit/withdraw contract for Curve LP tokens.
 * Address: 0xF403C135812408BFbE8713b5A23a04b3D48AAE31
 */
export const boosterAbi = [
  {
    type: "function",
    name: "poolLength",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "poolInfo",
    inputs: [{ name: "_pid", type: "uint256" }],
    outputs: [
      { name: "lptoken", type: "address" },
      { name: "token", type: "address" },
      { name: "gauge", type: "address" },
      { name: "crvRewards", type: "address" },
      { name: "stash", type: "address" },
      { name: "shutdown", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "_pid", type: "uint256" },
      { name: "_amount", type: "uint256" },
      { name: "_stake", type: "bool" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "depositAll",
    inputs: [
      { name: "_pid", type: "uint256" },
      { name: "_stake", type: "bool" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "_pid", type: "uint256" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawAll",
    inputs: [{ name: "_pid", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawTo",
    inputs: [
      { name: "_pid", type: "uint256" },
      { name: "_amount", type: "uint256" },
      { name: "_to", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "earmarkRewards",
    inputs: [{ name: "_pid", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "earmarkFees",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "lockRewards",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "stakerRewards",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lockFees",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;
