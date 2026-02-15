export const minterAbi = [
  {
    type: "function",
    name: "mint",
    inputs: [{ name: "gauge_addr", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "minted",
    inputs: [
      { name: "user", type: "address" },
      { name: "gauge", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
