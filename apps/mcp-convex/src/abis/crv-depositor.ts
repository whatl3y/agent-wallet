/**
 * CrvDepositor ABI — converts CRV to cvxCRV (irreversible).
 * Address: 0x8014595F2AB54cD7c604B00E9fb932176fDc86Ae
 */
export const crvDepositorAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_lock", type: "bool" },
      { name: "_stakeAddress", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "depositAll",
    inputs: [
      { name: "_lock", type: "bool" },
      { name: "_stakeAddress", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "lockCurve",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
