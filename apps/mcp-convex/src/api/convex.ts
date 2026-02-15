/**
 * Convex Finance on-chain data reader.
 *
 * Reads pool info from the Booster contract and reward data from BaseRewardPool contracts.
 * Pool data is cached for 60 seconds to reduce RPC load.
 */

import { getPublicClient } from "../clients.js";
import { boosterAbi } from "../abis/booster.js";
import { baseRewardPoolAbi } from "../abis/base-reward-pool.js";
import { erc20Abi } from "../abis/erc20.js";
import { CONVEX_CONTRACTS } from "../config/contracts.js";

// ── Types ────────────────────────────────────────────────────────────

export interface ConvexPoolInfo {
  pid: number;
  lpToken: string;
  depositToken: string;
  gauge: string;
  crvRewards: string;
  stash: string;
  shutdown: boolean;
  lpTokenSymbol?: string;
}

// ── Cache ────────────────────────────────────────────────────────────

interface CachedData<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 60_000; // 1 minute
let poolCache: CachedData<ConvexPoolInfo[]> | null = null;

// ── Public API ───────────────────────────────────────────────────────

/**
 * Fetch all Convex pool info from the Booster contract. Cached for 60s.
 */
export async function getPools(): Promise<ConvexPoolInfo[]> {
  if (poolCache && Date.now() - poolCache.timestamp < CACHE_TTL_MS) {
    return poolCache.data;
  }

  const client = getPublicClient();

  const poolLength = await client.readContract({
    address: CONVEX_CONTRACTS.booster,
    abi: boosterAbi,
    functionName: "poolLength",
  });

  const count = Number(poolLength);
  const pools: ConvexPoolInfo[] = [];

  // Batch read pool info — fetch in chunks of 50 to avoid RPC limits
  const chunkSize = 50;
  for (let start = 0; start < count; start += chunkSize) {
    const end = Math.min(start + chunkSize, count);
    const calls = [];
    for (let i = start; i < end; i++) {
      calls.push(
        client.readContract({
          address: CONVEX_CONTRACTS.booster,
          abi: boosterAbi,
          functionName: "poolInfo",
          args: [BigInt(i)],
        })
      );
    }

    const results = await Promise.all(calls);
    for (let i = 0; i < results.length; i++) {
      const [lptoken, token, gauge, crvRewards, stash, shutdown] = results[i] as [string, string, string, string, string, boolean];
      pools.push({
        pid: start + i,
        lpToken: lptoken,
        depositToken: token,
        gauge,
        crvRewards,
        stash,
        shutdown,
      });
    }
  }

  poolCache = { data: pools, timestamp: Date.now() };

  return pools;
}

/**
 * Find a Convex pool by pool ID.
 */
export async function getPoolByPid(pid: number): Promise<ConvexPoolInfo | undefined> {
  const pools = await getPools();
  return pools.find((p) => p.pid === pid);
}

/**
 * Find a Convex pool by Curve LP token address.
 */
export async function getPoolByLpToken(lpToken: string): Promise<ConvexPoolInfo | undefined> {
  const pools = await getPools();
  return pools.find(
    (p) => p.lpToken.toLowerCase() === lpToken.toLowerCase()
  );
}

/**
 * Get reward data for a specific pool's BaseRewardPool.
 */
export async function getPoolRewardInfo(crvRewardsAddress: `0x${string}`) {
  const client = getPublicClient();

  const [totalSupply, rewardRate, periodFinish, rewardToken] = await Promise.all([
    client.readContract({
      address: crvRewardsAddress,
      abi: baseRewardPoolAbi,
      functionName: "totalSupply",
    }),
    client.readContract({
      address: crvRewardsAddress,
      abi: baseRewardPoolAbi,
      functionName: "rewardRate",
    }),
    client.readContract({
      address: crvRewardsAddress,
      abi: baseRewardPoolAbi,
      functionName: "periodFinish",
    }),
    client.readContract({
      address: crvRewardsAddress,
      abi: baseRewardPoolAbi,
      functionName: "rewardToken",
    }),
  ]);

  // Get extra rewards
  let extraRewardsCount = 0;
  try {
    const count = await client.readContract({
      address: crvRewardsAddress,
      abi: baseRewardPoolAbi,
      functionName: "extraRewardsLength",
    });
    extraRewardsCount = Number(count);
  } catch {
    // Some older pools may not have this
  }

  const extraRewards: Array<{ address: string; rewardToken: string }> = [];
  for (let i = 0; i < extraRewardsCount; i++) {
    try {
      const extraAddr = await client.readContract({
        address: crvRewardsAddress,
        abi: baseRewardPoolAbi,
        functionName: "extraRewards",
        args: [BigInt(i)],
      });
      const extraToken = await client.readContract({
        address: extraAddr as `0x${string}`,
        abi: baseRewardPoolAbi,
        functionName: "rewardToken",
      });
      extraRewards.push({ address: extraAddr as string, rewardToken: extraToken as string });
    } catch {
      // Skip on failure
    }
  }

  return {
    totalSupply,
    rewardRate,
    periodFinish,
    rewardToken,
    extraRewards,
  };
}

/**
 * Get the LP token symbol for a pool.
 */
export async function getLpTokenSymbol(lpTokenAddress: `0x${string}`): Promise<string> {
  const client = getPublicClient();
  try {
    return await client.readContract({
      address: lpTokenAddress,
      abi: erc20Abi,
      functionName: "symbol",
    });
  } catch {
    return "UNKNOWN";
  }
}

/**
 * Invalidate the pool cache.
 */
export function clearPoolCache(): void {
  poolCache = null;
}
