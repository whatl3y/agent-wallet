import {
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
  parseUnits,
  formatUnits,
} from "viem";
import { erc20Abi } from "./abis/erc20.js";
import { exchangeRouterAbi } from "./abis/exchange-router.js";
import { getPublicClient } from "./clients.js";
import type { ChainConfig } from "./config/chains.js";

const dataStoreAbi = [
  {
    type: "function",
    name: "getUint",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

function dataStoreKey(name: string): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: "string" }], [name]));
}

// ── Types ───────────────────────────────────────────────────────────

export interface TransactionStep {
  step: number;
  type: "approval" | "action";
  description: string;
  to: string;
  data: string;
  value: string;
}

export interface TransactionPayload {
  chainId: number;
  transactions: TransactionStep[];
}

// ── GMX Constants ───────────────────────────────────────────────────

export const GMX_PRICE_DECIMALS = 30;
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;
export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export enum OrderType {
  MarketSwap = 0,
  LimitSwap = 1,
  MarketIncrease = 2,
  LimitIncrease = 3,
  MarketDecrease = 4,
  LimitDecrease = 5,
  StopLossDecrease = 6,
  Liquidation = 7,
}

export enum DecreasePositionSwapType {
  NoSwap = 0,
  SwapPnlTokenToCollateralToken = 1,
  SwapCollateralTokenToPnlToken = 2,
}

export const ORDER_TYPE_LABELS: Record<number, string> = {
  0: "Market Swap",
  1: "Limit Swap",
  2: "Market Increase",
  3: "Limit Increase",
  4: "Market Decrease",
  5: "Limit Decrease",
  6: "Stop Loss",
  7: "Liquidation",
};

// ── Price helpers ───────────────────────────────────────────────────

export function parseUsdPrice(price: string): bigint {
  return parseUnits(price, GMX_PRICE_DECIMALS);
}

export function formatUsdPrice(price: bigint): string {
  return formatUnits(price, GMX_PRICE_DECIMALS);
}

export function formatUsd(amount: bigint): string {
  return formatUnits(amount, GMX_PRICE_DECIMALS);
}

// ── Amount helpers ──────────────────────────────────────────────────

export function parseAmount(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

export function formatAmount(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals);
}

// ── Token helpers ───────────────────────────────────────────────────

export async function getTokenDecimals(
  chainName: string,
  tokenAddress: `0x${string}`
): Promise<number> {
  const client = getPublicClient(chainName);
  return client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "decimals",
  });
}

export async function getTokenSymbol(
  chainName: string,
  tokenAddress: `0x${string}`
): Promise<string> {
  const client = getPublicClient(chainName);
  return client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "symbol",
  });
}

// ── Approval builder ────────────────────────────────────────────────

export async function buildApprovalIfNeeded(
  chainName: string,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  requiredAmount: bigint,
  tokenSymbol?: string
): Promise<TransactionStep | null> {
  const client = getPublicClient(chainName);
  const currentAllowance = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [ownerAddress, spenderAddress],
  });

  if (currentAllowance >= requiredAmount) return null;

  const symbol =
    tokenSymbol ?? (await getTokenSymbol(chainName, tokenAddress));
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spenderAddress, requiredAmount],
  });

  return {
    step: 1,
    type: "approval",
    description: `Approve ${symbol} for GMX SyntheticsRouter`,
    to: tokenAddress,
    data,
    value: "0",
  };
}

// ── Slippage ────────────────────────────────────────────────────────

export function applySlippage(
  price: bigint,
  slippageBps: number,
  isLong: boolean
): bigint {
  const basisPoints = 10000n;
  if (isLong) {
    return (price * (basisPoints + BigInt(slippageBps))) / basisPoints;
  } else {
    return (price * (basisPoints - BigInt(slippageBps))) / basisPoints;
  }
}

// ── Leverage / Size ─────────────────────────────────────────────────

export function leverageToSizeDeltaUsd(
  collateralAmount: bigint,
  _collateralDecimals: number,
  collateralPrice: bigint,
  leverage: number
): bigint {
  // GMX API prices are in 10^(30 - tokenDecimals) format, so
  // tokenAmount (raw) * price already gives USD in 30-decimal precision.
  const collateralUsd = collateralAmount * collateralPrice;
  return (collateralUsd * BigInt(Math.round(leverage * 10))) / 10n;
}

// ── Position Key ────────────────────────────────────────────────────

export function computePositionKey(
  account: `0x${string}`,
  market: `0x${string}`,
  collateralToken: `0x${string}`,
  isLong: boolean
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "bool" },
      ],
      [account, market, collateralToken, isLong]
    )
  );
}

// ── Entry Price / Liquidation ───────────────────────────────────────

export function calcEntryPrice(
  sizeInUsd: bigint,
  sizeInTokens: bigint,
  indexTokenDecimals: number
): bigint {
  if (sizeInTokens === 0n) return 0n;
  return (sizeInUsd * 10n ** BigInt(indexTokenDecimals)) / sizeInTokens;
}

export function estimateLiquidationPrice(
  isLong: boolean,
  sizeInUsd: bigint,
  sizeInTokens: bigint,
  collateralUsd: bigint,
  totalPendingFees: bigint,
  indexTokenDecimals: number
): bigint {
  if (sizeInTokens === 0n) return 0n;
  const remainingCollateral =
    collateralUsd > totalPendingFees
      ? collateralUsd - totalPendingFees
      : 0n;
  const collateralPerToken =
    (remainingCollateral * 10n ** BigInt(indexTokenDecimals)) / sizeInTokens;
  const entryPrice = calcEntryPrice(
    sizeInUsd,
    sizeInTokens,
    indexTokenDecimals
  );

  if (isLong) {
    return entryPrice > collateralPerToken
      ? entryPrice - collateralPerToken
      : 0n;
  } else {
    return entryPrice + collateralPerToken;
  }
}

// ── Execution Fee ───────────────────────────────────────────────────

export async function estimateExecutionFee(
  chainName: string,
  orderType: "increase" | "decrease"
): Promise<bigint> {
  const { getChainConfig } = await import("./config/chains.js");
  const config = getChainConfig(chainName);
  const client = getPublicClient(chainName);

  const readStore = (key: string) =>
    client.readContract({
      address: config.gmx.dataStore,
      abi: dataStoreAbi,
      functionName: "getUint",
      args: [dataStoreKey(key)],
    });

  const gasLimitKey =
    orderType === "increase"
      ? "INCREASE_ORDER_GAS_LIMIT"
      : "DECREASE_ORDER_GAS_LIMIT";

  const [baseGasLimit, multiplier, baseAmount, gasPrice] = await Promise.all([
    readStore(gasLimitKey),
    readStore("ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR"),
    readStore("ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1"),
    client.getGasPrice(),
  ]);

  const PRECISION = 10n ** 30n;
  const adjustedGasLimit =
    (baseGasLimit * multiplier) / PRECISION + baseAmount;

  // 2x buffer for gas price fluctuations. GMX refunds the surplus, so
  // overestimating has no cost while underestimating causes a revert.
  return gasPrice * adjustedGasLimit * 2n;
}

// ── Market Prices Builder ───────────────────────────────────────────

export interface MarketPrices {
  indexTokenPrice: { min: bigint; max: bigint };
  longTokenPrice: { min: bigint; max: bigint };
  shortTokenPrice: { min: bigint; max: bigint };
}

export function buildMarketPrices(
  priceMap: Map<string, { min: bigint; max: bigint }>,
  indexToken: string,
  longToken: string,
  shortToken: string
): MarketPrices {
  const getPrice = (token: string) => {
    const price = priceMap.get(token.toLowerCase());
    if (!price) throw new Error(`No price data for token ${token}`);
    return price;
  };

  return {
    indexTokenPrice: getPrice(indexToken),
    longTokenPrice: getPrice(longToken),
    shortTokenPrice: getPrice(shortToken),
  };
}

// ── CreateOrderParams Builder ───────────────────────────────────────

export interface CreateOrderOptions {
  receiver: `0x${string}`;
  market: `0x${string}`;
  initialCollateralToken: `0x${string}`;
  sizeDeltaUsd: bigint;
  initialCollateralDeltaAmount: bigint;
  triggerPrice: bigint;
  acceptablePrice: bigint;
  executionFee: bigint;
  orderType: OrderType;
  isLong: boolean;
  shouldUnwrapNativeToken: boolean;
  autoCancel: boolean;
  swapPath?: `0x${string}`[];
}

export function buildCreateOrderParams(opts: CreateOrderOptions) {
  return {
    addresses: {
      receiver: opts.receiver,
      cancellationReceiver: opts.receiver,
      callbackContract: ZERO_ADDRESS,
      uiFeeReceiver: ZERO_ADDRESS,
      market: opts.market,
      initialCollateralToken: opts.initialCollateralToken,
      swapPath: opts.swapPath ?? [],
    },
    numbers: {
      sizeDeltaUsd: opts.sizeDeltaUsd,
      initialCollateralDeltaAmount: opts.initialCollateralDeltaAmount,
      triggerPrice: opts.triggerPrice,
      acceptablePrice: opts.acceptablePrice,
      executionFee: opts.executionFee,
      callbackGasLimit: 0n,
      minOutputAmount: 0n,
      validFromTime: 0n,
    },
    orderType: opts.orderType,
    decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
    isLong: opts.isLong,
    shouldUnwrapNativeToken: opts.shouldUnwrapNativeToken,
    autoCancel: opts.autoCancel,
    referralCode: ZERO_BYTES32,
    dataList: [],
  };
}

// ── Multicall Builder ───────────────────────────────────────────────

export function buildOrderMulticall(params: {
  config: ChainConfig;
  executionFee: bigint;
  collateralToken?: `0x${string}`;
  collateralAmount?: bigint;
  useNativeCollateral?: boolean;
  createOrderParams: ReturnType<typeof buildCreateOrderParams>;
}): { data: `0x${string}`; value: bigint } {
  const calls: `0x${string}`[] = [];
  let totalValue = params.executionFee;

  if (
    params.useNativeCollateral &&
    params.collateralAmount &&
    params.collateralAmount > 0n
  ) {
    // When collateral is the wrapped native token, use sendWnt for both
    // execution fee AND collateral. The user sends native ETH as msg.value,
    // which gets wrapped and deposited into the order vault.
    totalValue = params.executionFee + params.collateralAmount;
    calls.push(
      encodeFunctionData({
        abi: exchangeRouterAbi,
        functionName: "sendWnt",
        args: [params.config.gmx.orderVault, totalValue],
      })
    );
  } else {
    // Execution fee is always sent via sendWnt (native ETH -> WETH)
    calls.push(
      encodeFunctionData({
        abi: exchangeRouterAbi,
        functionName: "sendWnt",
        args: [params.config.gmx.orderVault, params.executionFee],
      })
    );

    // Non-native ERC20 collateral is transferred via sendTokens (transferFrom)
    if (
      params.collateralToken &&
      params.collateralAmount &&
      params.collateralAmount > 0n
    ) {
      calls.push(
        encodeFunctionData({
          abi: exchangeRouterAbi,
          functionName: "sendTokens",
          args: [
            params.collateralToken,
            params.config.gmx.orderVault,
            params.collateralAmount,
          ],
        })
      );
    }
  }

  calls.push(
    encodeFunctionData({
      abi: exchangeRouterAbi,
      functionName: "createOrder",
      args: [params.createOrderParams],
    })
  );

  const data = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "multicall",
    args: [calls],
  });

  return { data, value: totalValue };
}

// ── MCP Response Helpers ────────────────────────────────────────────

export function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, bigIntReplacer, 2),
      },
    ],
  };
}

export function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}
