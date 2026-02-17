/**
 * Balancer V3 API client.
 *
 * Uses the public Balancer API (https://api-v3.balancer.fi) GraphQL endpoint
 * for pool discovery, TVL, APR data, and Smart Order Router (SOR) swap paths.
 * Pool data is cached for 60 seconds to reduce API load.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface BalancerPoolToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceUSD: string;
  weight: string | null;
  priceRate: string;
}

export interface BalancerPoolAprItem {
  id: string;
  apr: number;
  type: string;
  rewardTokenSymbol: string | null;
}

export interface BalancerPool {
  id: string;
  address: string;
  name: string;
  symbol: string;
  type: string;
  protocolVersion: number;
  dynamicData: {
    totalLiquidity: string;
    volume24h: string;
    fees24h: string;
    aprItems: BalancerPoolAprItem[];
    swapFee: string;
  };
  poolTokens: BalancerPoolToken[];
}

// ── Constants ────────────────────────────────────────────────────────

const BALANCER_API_URL = "https://api-v3.balancer.fi";
const CACHE_TTL_MS = 60_000; // 1 minute

// ── Cache ────────────────────────────────────────────────────────────

interface CachedData<T> {
  data: T;
  timestamp: number;
}

const poolsCache = new Map<string, CachedData<BalancerPool[]>>();

// ── GraphQL Helper ───────────────────────────────────────────────────

async function gqlQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(BALANCER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(
      `Balancer API error (${response.status}): ${await response.text()}`
    );
  }

  const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Balancer API GraphQL error: ${json.errors[0].message}`);
  }
  if (!json.data) {
    throw new Error("Balancer API returned no data");
  }
  return json.data;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Fetch Balancer V3 pools for a chain. Results are cached for 60s.
 */
export async function getPools(
  apiChainName: string,
  options?: { minTvl?: number; poolType?: string }
): Promise<BalancerPool[]> {
  const cacheKey = `${apiChainName}:${options?.poolType ?? "all"}`;
  const cached = poolsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const where: Record<string, unknown> = {
    chainIn: [apiChainName],
    protocolVersionIn: [3],
  };
  if (options?.minTvl) {
    where.minTvl = options.minTvl;
  }
  if (options?.poolType) {
    where.poolTypeIn = [options.poolType];
  }

  const data = await gqlQuery<{ poolGetPools: BalancerPool[] }>(
    `query GetPools($where: GqlPoolFilter) {
      poolGetPools(where: $where, orderBy: totalLiquidity, orderDirection: desc, first: 100) {
        id
        address
        name
        symbol
        type
        protocolVersion
        dynamicData {
          totalLiquidity
          volume24h
          fees24h
          aprItems {
            id
            apr
            type
            rewardTokenSymbol
          }
          swapFee
        }
        poolTokens {
          address
          symbol
          name
          decimals
          balance
          balanceUSD
          weight
          priceRate
        }
      }
    }`,
    { where }
  );

  const pools = data.poolGetPools;
  poolsCache.set(cacheKey, { data: pools, timestamp: Date.now() });
  return pools;
}

/**
 * Fetch a specific pool by its ID (address).
 */
export async function getPool(
  apiChainName: string,
  poolId: string
): Promise<BalancerPool | null> {
  try {
    const data = await gqlQuery<{ poolGetPool: BalancerPool }>(
      `query GetPool($id: String!, $chain: GqlChain!) {
        poolGetPool(id: $id, chain: $chain) {
          id
          address
          name
          symbol
          type
          protocolVersion
          dynamicData {
            totalLiquidity
            volume24h
            fees24h
            aprItems {
              id
              apr
              type
              rewardTokenSymbol
            }
            swapFee
          }
          poolTokens {
            address
            symbol
            name
            decimals
            balance
            balanceUSD
            weight
            priceRate
          }
        }
      }`,
      { id: poolId, chain: apiChainName }
    );
    return data.poolGetPool;
  } catch {
    return null;
  }
}
