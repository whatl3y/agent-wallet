const marketPropsComponents = [
  { name: "marketToken", type: "address" },
  { name: "indexToken", type: "address" },
  { name: "longToken", type: "address" },
  { name: "shortToken", type: "address" },
] as const;

const pricePropsComponents = [
  { name: "min", type: "uint256" },
  { name: "max", type: "uint256" },
] as const;

const marketPricesComponents = [
  {
    name: "indexTokenPrice",
    type: "tuple",
    components: pricePropsComponents,
  },
  {
    name: "longTokenPrice",
    type: "tuple",
    components: pricePropsComponents,
  },
  {
    name: "shortTokenPrice",
    type: "tuple",
    components: pricePropsComponents,
  },
] as const;

const positionAddressesComponents = [
  { name: "account", type: "address" },
  { name: "market", type: "address" },
  { name: "collateralToken", type: "address" },
] as const;

const positionNumbersComponents = [
  { name: "sizeInUsd", type: "uint256" },
  { name: "sizeInTokens", type: "uint256" },
  { name: "collateralAmount", type: "uint256" },
  { name: "pendingImpactAmount", type: "int256" },
  { name: "borrowingFactor", type: "uint256" },
  { name: "fundingFeeAmountPerSize", type: "uint256" },
  { name: "longTokenClaimableFundingAmountPerSize", type: "uint256" },
  { name: "shortTokenClaimableFundingAmountPerSize", type: "uint256" },
  { name: "increasedAtTime", type: "uint256" },
  { name: "decreasedAtTime", type: "uint256" },
] as const;

const positionFlagsComponents = [
  { name: "isLong", type: "bool" },
] as const;

const positionPropsComponents = [
  {
    name: "addresses",
    type: "tuple",
    components: positionAddressesComponents,
  },
  {
    name: "numbers",
    type: "tuple",
    components: positionNumbersComponents,
  },
  {
    name: "flags",
    type: "tuple",
    components: positionFlagsComponents,
  },
] as const;

const borrowingFeesComponents = [
  { name: "borrowingFeeUsd", type: "uint256" },
  { name: "borrowingFeeAmount", type: "uint256" },
  { name: "borrowingFeeReceiverFactor", type: "uint256" },
  { name: "borrowingFeeAmountForFeeReceiver", type: "uint256" },
] as const;

const fundingFeesComponents = [
  { name: "fundingFeeAmount", type: "uint256" },
  { name: "claimableLongTokenAmount", type: "uint256" },
  { name: "claimableShortTokenAmount", type: "uint256" },
  { name: "latestFundingFeeAmountPerSize", type: "uint256" },
  { name: "latestLongTokenClaimableFundingAmountPerSize", type: "uint256" },
  { name: "latestShortTokenClaimableFundingAmountPerSize", type: "uint256" },
] as const;

const uiFeesComponents = [
  { name: "uiFeeReceiver", type: "address" },
  { name: "uiFeeReceiverFactor", type: "uint256" },
  { name: "uiFeeAmount", type: "uint256" },
] as const;

const referralFeesComponents = [
  { name: "referralCode", type: "bytes32" },
  { name: "affiliate", type: "address" },
  { name: "trader", type: "address" },
  { name: "totalRebateFactor", type: "uint256" },
  { name: "affiliateRewardFactor", type: "uint256" },
  { name: "adjustedAffiliateRewardFactor", type: "uint256" },
  { name: "traderDiscountFactor", type: "uint256" },
  { name: "totalRebateAmount", type: "uint256" },
  { name: "traderDiscountAmount", type: "uint256" },
  { name: "affiliateRewardAmount", type: "uint256" },
] as const;

const proFeesComponents = [
  { name: "traderTier", type: "uint256" },
  { name: "traderDiscountFactor", type: "uint256" },
  { name: "traderDiscountAmount", type: "uint256" },
] as const;

const liquidationFeesComponents = [
  { name: "liquidationFeeUsd", type: "uint256" },
  { name: "liquidationFeeAmount", type: "uint256" },
  { name: "liquidationFeeReceiverFactor", type: "uint256" },
  { name: "liquidationFeeAmountForFeeReceiver", type: "uint256" },
] as const;

const positionFeesComponents = [
  {
    name: "referral",
    type: "tuple",
    components: referralFeesComponents,
  },
  {
    name: "pro",
    type: "tuple",
    components: proFeesComponents,
  },
  {
    name: "funding",
    type: "tuple",
    components: fundingFeesComponents,
  },
  {
    name: "borrowing",
    type: "tuple",
    components: borrowingFeesComponents,
  },
  {
    name: "ui",
    type: "tuple",
    components: uiFeesComponents,
  },
  {
    name: "liquidation",
    type: "tuple",
    components: liquidationFeesComponents,
  },
  { name: "collateralTokenPrice", type: "tuple", components: pricePropsComponents },
  { name: "positionFeeFactor", type: "uint256" },
  { name: "protocolFeeAmount", type: "uint256" },
  { name: "positionFeeReceiverFactor", type: "uint256" },
  { name: "feeReceiverAmount", type: "uint256" },
  { name: "feeAmountForPool", type: "uint256" },
  { name: "positionFeeAmountForPool", type: "uint256" },
  { name: "positionFeeAmount", type: "uint256" },
  { name: "totalCostAmountExcludingFunding", type: "uint256" },
  { name: "totalCostAmount", type: "uint256" },
  { name: "totalDiscountAmount", type: "uint256" },
] as const;

const executionPriceResultComponents = [
  { name: "priceImpactUsd", type: "int256" },
  { name: "executionPrice", type: "uint256" },
  { name: "balanceWasImproved", type: "bool" },
  { name: "proportionalPendingImpactUsd", type: "int256" },
  { name: "totalImpactUsd", type: "int256" },
  { name: "priceImpactDiffUsd", type: "uint256" },
] as const;

const positionInfoComponents = [
  { name: "positionKey", type: "bytes32" },
  {
    name: "position",
    type: "tuple",
    components: positionPropsComponents,
  },
  {
    name: "fees",
    type: "tuple",
    components: positionFeesComponents,
  },
  {
    name: "executionPriceResult",
    type: "tuple",
    components: executionPriceResultComponents,
  },
  { name: "basePnlUsd", type: "int256" },
  { name: "uncappedBasePnlUsd", type: "int256" },
  { name: "pnlAfterPriceImpactUsd", type: "int256" },
] as const;

const orderAddressesComponents = [
  { name: "account", type: "address" },
  { name: "receiver", type: "address" },
  { name: "cancellationReceiver", type: "address" },
  { name: "callbackContract", type: "address" },
  { name: "uiFeeReceiver", type: "address" },
  { name: "market", type: "address" },
  { name: "initialCollateralToken", type: "address" },
  { name: "swapPath", type: "address[]" },
] as const;

const orderNumbersComponents = [
  { name: "orderType", type: "uint8" },
  { name: "decreasePositionSwapType", type: "uint8" },
  { name: "sizeDeltaUsd", type: "uint256" },
  { name: "initialCollateralDeltaAmount", type: "uint256" },
  { name: "triggerPrice", type: "uint256" },
  { name: "acceptablePrice", type: "uint256" },
  { name: "executionFee", type: "uint256" },
  { name: "callbackGasLimit", type: "uint256" },
  { name: "minOutputAmount", type: "uint256" },
  { name: "updatedAtTime", type: "uint256" },
  { name: "validFromTime", type: "uint256" },
  { name: "srcChainId", type: "uint256" },
] as const;

const orderFlagsComponents = [
  { name: "isLong", type: "bool" },
  { name: "shouldUnwrapNativeToken", type: "bool" },
  { name: "isFrozen", type: "bool" },
  { name: "autoCancel", type: "bool" },
] as const;

const orderPropsComponents = [
  {
    name: "addresses",
    type: "tuple",
    components: orderAddressesComponents,
  },
  {
    name: "numbers",
    type: "tuple",
    components: orderNumbersComponents,
  },
  {
    name: "flags",
    type: "tuple",
    components: orderFlagsComponents,
  },
  { name: "dataList", type: "bytes32[]" },
] as const;

export const syntheticsReaderAbi = [
  {
    type: "function",
    name: "getMarkets",
    inputs: [
      { name: "dataStore", type: "address" },
      { name: "start", type: "uint256" },
      { name: "end", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: marketPropsComponents,
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMarket",
    inputs: [
      { name: "dataStore", type: "address" },
      { name: "marketKey", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: marketPropsComponents,
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAccountPositions",
    inputs: [
      { name: "dataStore", type: "address" },
      { name: "account", type: "address" },
      { name: "start", type: "uint256" },
      { name: "end", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: positionPropsComponents,
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPositionInfo",
    inputs: [
      { name: "dataStore", type: "address" },
      { name: "referralStorage", type: "address" },
      { name: "positionKey", type: "bytes32" },
      {
        name: "prices",
        type: "tuple",
        components: marketPricesComponents,
      },
      { name: "sizeDeltaUsd", type: "uint256" },
      { name: "uiFeeReceiver", type: "address" },
      { name: "usePositionSizeAsSizeDeltaUsd", type: "bool" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: positionInfoComponents,
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOrder",
    inputs: [
      { name: "dataStore", type: "address" },
      { name: "key", type: "bytes32" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: orderPropsComponents,
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAccountOrders",
    inputs: [
      { name: "dataStore", type: "address" },
      { name: "account", type: "address" },
      { name: "start", type: "uint256" },
      { name: "end", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: orderPropsComponents,
      },
    ],
    stateMutability: "view",
  },
] as const;
