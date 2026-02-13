export const governanceAbi = [
  {
    type: "function",
    name: "getProposal",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "state", type: "uint8" },
          { name: "accessLevel", type: "uint8" },
          { name: "creationTime", type: "uint40" },
          { name: "votingDuration", type: "uint24" },
          { name: "votingActivationTime", type: "uint40" },
          { name: "queuingTime", type: "uint40" },
          { name: "cancelTimestamp", type: "uint40" },
          { name: "creator", type: "address" },
          { name: "votingPortal", type: "address" },
          { name: "snapshotBlockHash", type: "bytes32" },
          { name: "ipfsHash", type: "bytes32" },
          { name: "forVotes", type: "uint128" },
          { name: "againstVotes", type: "uint128" },
          { name: "cancellationFee", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProposalState",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProposalsCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
