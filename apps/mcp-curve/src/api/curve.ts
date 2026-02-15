/**
 * Curve Finance REST API client.
 *
 * Uses the public api.curve.fi endpoint for pool discovery, TVL, and APY data.
 * Pool data is cached for 60 seconds to reduce API load.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface CurvePoolCoin {
  address: string;
  symbol: string;
  decimals: string;
  usdPrice: number | null;
  poolBalance: string;
  isBasePoolLpToken: boolean;
}

export interface CurveGaugeReward {
  gaugeAddress: string;
  tokenAddress: string;
  tokenPrice: number;
  symbol: string;
  apy: number;
}

export interface CurvePoolData {
  id: string;
  address: string;
  name: string;
  symbol: string;
  lpTokenAddress: string;
  gaugeAddress: string | null;
  totalSupply: string;
  virtualPrice: string;
  amplificationCoefficient: string;
  usdTotal: number;
  isMetaPool: boolean;
  coins: CurvePoolCoin[];
  gaugeCrvApy: [number, number] | null;
  gaugeRewards: CurveGaugeReward[];
  assetTypeName: string;
  registryId: string;
  implementation: string;
}

interface CurvePoolsResponse {
  success: boolean;
  data: {
    poolData: CurvePoolData[];
    tvl: number;
    tvlAll: number;
  };
  generatedTimeMs: number;
}

interface CurveSubgraphResponse {
  success: boolean;
  data: Array<{
    address: string;
    latestDailyApy: number;
    latestWeeklyApy: number;
  }>;
}

// ── Constants ────────────────────────────────────────────────────────

const CURVE_API_BASE = "https://api.curve.fi/v1";
const CACHE_TTL_MS = 60_000; // 1 minute

// ── Cache ────────────────────────────────────────────────────────────

interface CachedData<T> {
  data: T;
  timestamp: number;
}

const poolCache = new Map<string, CachedData<CurvePoolData[]>>();
const apyCache = new Map<
  string,
  CachedData<Map<string, { daily: number; weekly: number }>>
>();

// ── Public API ───────────────────────────────────────────────────────

/**
 * Fetch all Curve pools for a blockchain. Results are cached for 60s.
 */
export async function getPools(
  blockchainId: string
): Promise<CurvePoolData[]> {
  const cached = poolCache.get(blockchainId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const response = await fetch(
    `${CURVE_API_BASE}/getPools/all/${blockchainId}`
  );
  if (!response.ok) {
    throw new Error(
      `Curve API error (${response.status}): ${await response.text()}`
    );
  }

  const json: CurvePoolsResponse = await response.json();
  if (!json.success) {
    throw new Error("Curve API returned success=false");
  }

  const pools = json.data.poolData;
  poolCache.set(blockchainId, { data: pools, timestamp: Date.now() });
  return pools;
}

/**
 * Find a specific pool by address.
 */
export async function getPoolByAddress(
  blockchainId: string,
  poolAddress: string
): Promise<CurvePoolData | undefined> {
  const pools = await getPools(blockchainId);
  return pools.find(
    (p) => p.address.toLowerCase() === poolAddress.toLowerCase()
  );
}

/**
 * Fetch base APY (from trading fees) for pools via Curve's subgraph endpoint.
 */
export async function getBaseApys(
  blockchainId: string
): Promise<Map<string, { daily: number; weekly: number }>> {
  const cached = apyCache.get(blockchainId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const response = await fetch(
    `${CURVE_API_BASE}/getSubgraphData/${blockchainId}`
  );
  if (!response.ok) {
    throw new Error(
      `Curve subgraph API error (${response.status}): ${await response.text()}`
    );
  }

  const json: CurveSubgraphResponse = await response.json();
  const map = new Map<string, { daily: number; weekly: number }>();

  if (json.success && Array.isArray(json.data)) {
    for (const entry of json.data) {
      map.set(entry.address.toLowerCase(), {
        daily: entry.latestDailyApy,
        weekly: entry.latestWeeklyApy,
      });
    }
  }

  apyCache.set(blockchainId, { data: map, timestamp: Date.now() });
  return map;
}
