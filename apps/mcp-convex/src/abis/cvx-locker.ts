/**
 * CvxLocker ABI — vote-locked CVX (vlCVX) for governance and rewards.
 * Address: 0x72a19342e8F1838460eBFCCEf09F6585e32db86E
 */
export const cvxLockerAbi = [
  {
    type: "function",
    name: "lock",
    inputs: [
      { name: "_account", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_spendRatio", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "processExpiredLocks",
    inputs: [{ name: "_relock", type: "bool" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "kickExpiredLocks",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getReward(address,bool)",
    inputs: [
      { name: "_account", type: "address" },
      { name: "_stake", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getReward(address)",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "checkpointEpoch",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "_user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lockedBalanceOf",
    inputs: [{ name: "_user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lockedBalances",
    inputs: [{ name: "_user", type: "address" }],
    outputs: [
      { name: "total", type: "uint256" },
      { name: "unlockable", type: "uint256" },
      { name: "locked", type: "uint256" },
      {
        name: "lockData",
        type: "tuple[]",
        components: [
          { name: "amount", type: "uint112" },
          { name: "unlockTime", type: "uint32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimableRewards",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "epochCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lockDuration",
    inputs: [],
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
] as const;
