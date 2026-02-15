/**
 * cvxCRV Staking Wrapper ABI — newer staking with reward weight selection.
 * Address: 0xaa0C3f5F7DFD688C6E646F66CD2a6B66ACdbE434
 */
export const cvxCrvStakingAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_to", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "stake",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_to", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [{ name: "_amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getReward",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setRewardWeight",
    inputs: [{ name: "_weight", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "userRewardWeight",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rewardLength",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rewards",
    inputs: [{ name: "_index", type: "uint256" }],
    outputs: [
      { name: "reward_token", type: "address" },
      { name: "reward_integral", type: "uint256" },
      { name: "reward_remaining", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;
