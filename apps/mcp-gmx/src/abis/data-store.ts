export const dataStoreAbi = [
  {
    type: "function",
    name: "getUint",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAddress",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBytes32ValuesAt",
    inputs: [
      { name: "setKey", type: "bytes32" },
      { name: "start", type: "uint256" },
      { name: "end", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32[]" }],
    stateMutability: "view",
  },
] as const;
