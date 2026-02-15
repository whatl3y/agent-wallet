export interface GmxTickerPrice {
  tokenSymbol: string;
  tokenAddress: string;
  minPrice: string;
  maxPrice: string;
  updatedAt: number;
}

export interface GmxTokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  synthetic: boolean;
}

/**
 * Fetch current oracle prices for all tokens.
 * Prices are in 30-decimal precision with min/max spread.
 */
export async function getTickerPrices(
  apiBaseUrl: string
): Promise<GmxTickerPrice[]> {
  const response = await fetch(`${apiBaseUrl}/prices/tickers`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GMX prices API error (${response.status}): ${body}`
    );
  }
  return response.json();
}

/**
 * Fetch supported tokens list with metadata.
 */
export async function getTokens(
  apiBaseUrl: string
): Promise<GmxTokenInfo[]> {
  const response = await fetch(`${apiBaseUrl}/tokens`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GMX tokens API error (${response.status}): ${body}`
    );
  }
  return response.json();
}

// ── Caches ─────────────────────────────────────────────────────────

interface CachedPrices {
  prices: GmxTickerPrice[];
  timestamp: number;
}

interface CachedTokens {
  tokens: GmxTokenInfo[];
  timestamp: number;
}

const priceCache = new Map<string, CachedPrices>();
const tokenCache = new Map<string, CachedTokens>();
const CACHE_TTL_MS = 5_000;

/**
 * Get ticker prices with a 5-second cache to avoid
 * redundant API calls across multiple tool invocations.
 */
export async function getCachedTickerPrices(
  apiBaseUrl: string
): Promise<GmxTickerPrice[]> {
  const cached = priceCache.get(apiBaseUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.prices;
  }

  const prices = await getTickerPrices(apiBaseUrl);
  priceCache.set(apiBaseUrl, { prices, timestamp: Date.now() });
  return prices;
}

/**
 * Get token info with a 5-second cache.
 */
export async function getCachedTokens(
  apiBaseUrl: string
): Promise<GmxTokenInfo[]> {
  const cached = tokenCache.get(apiBaseUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.tokens;
  }

  const tokens = await getTokens(apiBaseUrl);
  tokenCache.set(apiBaseUrl, { tokens, timestamp: Date.now() });
  return tokens;
}

/**
 * Build a token-decimals lookup map.
 * Keys are lowercase token addresses.
 */
export function buildDecimalsMap(
  tokens: GmxTokenInfo[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token.address.toLowerCase(), token.decimals);
  }
  return map;
}

/**
 * Build a price lookup map from ticker data.
 * Keys are lowercase token addresses.
 */
export function buildPriceMap(
  tickers: GmxTickerPrice[]
): Map<string, { min: bigint; max: bigint }> {
  const map = new Map<string, { min: bigint; max: bigint }>();
  for (const ticker of tickers) {
    map.set(ticker.tokenAddress.toLowerCase(), {
      min: BigInt(ticker.minPrice),
      max: BigInt(ticker.maxPrice),
    });
  }
  return map;
}

/**
 * Build a token symbol lookup map from ticker data.
 * Keys are lowercase token addresses.
 */
export function buildSymbolMap(
  tickers: GmxTickerPrice[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ticker of tickers) {
    map.set(ticker.tokenAddress.toLowerCase(), ticker.tokenSymbol);
  }
  return map;
}
