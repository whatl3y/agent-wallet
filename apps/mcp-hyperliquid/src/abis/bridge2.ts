export const bridge2Abi = [
  {
    type: "function",
    name: "batchedDepositWithPermit",
    inputs: [
      {
        name: "deposits",
        type: "tuple[]",
        components: [
          { name: "user", type: "address" },
          { name: "usd", type: "uint64" },
          { name: "deadline", type: "uint64" },
          {
            name: "signature",
            type: "tuple",
            components: [
              { name: "r", type: "uint256" },
              { name: "s", type: "uint256" },
              { name: "v", type: "uint8" },
            ],
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
