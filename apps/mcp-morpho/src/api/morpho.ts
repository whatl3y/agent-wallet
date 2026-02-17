const MORPHO_API_URL = "https://api.morpho.org/graphql";

// 60-second cache for list queries
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 60_000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(MORPHO_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Morpho API error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors?.length) {
    throw new Error(`Morpho GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`);
  }

  if (!json.data) {
    throw new Error("Morpho API returned no data");
  }

  return json.data;
}

// ── Market Types ────────────────────────────────────────────────────

export interface MorphoMarket {
  uniqueKey: string;
  loanAsset: { address: string; symbol: string; decimals: number; priceUsd: number | null };
  collateralAsset: { address: string; symbol: string; decimals: number; priceUsd: number | null } | null;
  lltv: string;
  oracleAddress: string;
  irmAddress: string;
  state: {
    borrowApy: number | null;
    supplyApy: number | null;
    borrowAssetsUsd: number | null;
    supplyAssetsUsd: number | null;
    collateralAssetsUsd: number | null;
    liquidityAssetsUsd: number | null;
    utilization: number | null;
    borrowAssets: string | null;
    supplyAssets: string | null;
    collateralAssets: string | null;
    fee: number | null;
  } | null;
}

export interface MorphoMarketPosition {
  supplyShares: string;
  supplyAssets: string;
  supplyAssetsUsd: number | null;
  borrowShares: string;
  borrowAssets: string;
  borrowAssetsUsd: number | null;
  collateral: string;
  collateralUsd: number | null;
}

// ── Vault Types ─────────────────────────────────────────────────────

export interface MorphoVault {
  address: string;
  symbol: string;
  name: string;
  asset: { address: string; symbol: string; decimals: number; priceUsd: number | null };
  chain: { id: number };
  state: {
    totalAssetsUsd: number | null;
    totalSupply: string | null;
    totalAssets: string | null;
    apy: number | null;
    netApy: number | null;
    fee: number | null;
    allocationMarkets:
      | Array<{
          uniqueKey: string;
          loanAsset: { symbol: string };
          collateralAsset: { symbol: string } | null;
          lltv: string;
        }>
      | null;
  } | null;
  metadata: { description: string | null } | null;
}

export interface MorphoVaultPosition {
  shares: string;
  assets: string;
  assetsUsd: number | null;
}

// ── Query Functions ─────────────────────────────────────────────────

export async function queryMarkets(chainId?: number, first = 100): Promise<MorphoMarket[]> {
  const cacheKey = `markets:${chainId ?? "all"}:${first}`;
  const cached = getCached<{ markets: { items: MorphoMarket[] } }>(cacheKey);
  if (cached) return cached.markets.items;

  const where = chainId ? `where: { chainId_in: [${chainId}] }` : "";
  const query = `
    query {
      markets(first: ${first}, ${where} orderBy: SupplyAssetsUsd, orderDirection: Desc) {
        items {
          uniqueKey
          loanAsset { address symbol decimals priceUsd }
          collateralAsset { address symbol decimals priceUsd }
          lltv
          oracleAddress
          irmAddress
          state {
            borrowApy supplyApy
            borrowAssetsUsd supplyAssetsUsd collateralAssetsUsd liquidityAssetsUsd
            utilization borrowAssets supplyAssets collateralAssets fee
          }
        }
      }
    }
  `;

  const data = await graphql<{ markets: { items: MorphoMarket[] } }>(query);
  setCache(cacheKey, data);
  return data.markets.items;
}

export async function queryMarketByKey(uniqueKey: string): Promise<MorphoMarket | null> {
  const query = `
    query($key: String!) {
      marketByUniqueKey(uniqueKey: $key) {
        uniqueKey
        loanAsset { address symbol decimals priceUsd }
        collateralAsset { address symbol decimals priceUsd }
        lltv
        oracleAddress
        irmAddress
        state {
          borrowApy supplyApy
          borrowAssetsUsd supplyAssetsUsd collateralAssetsUsd liquidityAssetsUsd
          utilization borrowAssets supplyAssets collateralAssets fee
        }
      }
    }
  `;

  const data = await graphql<{ marketByUniqueKey: MorphoMarket | null }>(query, { key: uniqueKey });
  return data.marketByUniqueKey;
}

export async function queryUserMarketPosition(
  userAddress: string,
  marketUniqueKey: string
): Promise<MorphoMarketPosition | null> {
  const query = `
    query($user: String!, $marketKey: String!) {
      marketPosition(userAddress: $user, marketUniqueKey: $marketKey) {
        supplyShares supplyAssets supplyAssetsUsd
        borrowShares borrowAssets borrowAssetsUsd
        collateral collateralUsd
      }
    }
  `;

  const data = await graphql<{ marketPosition: MorphoMarketPosition | null }>(query, {
    user: userAddress,
    marketKey: marketUniqueKey,
  });
  return data.marketPosition;
}

export async function queryVaults(chainId?: number, first = 100): Promise<MorphoVault[]> {
  const cacheKey = `vaults:${chainId ?? "all"}:${first}`;
  const cached = getCached<{ vaults: { items: MorphoVault[] } }>(cacheKey);
  if (cached) return cached.vaults.items;

  const where = chainId ? `where: { chainId_in: [${chainId}] }` : "";
  const query = `
    query {
      vaults(first: ${first}, ${where} orderBy: TotalAssetsUsd, orderDirection: Desc) {
        items {
          address symbol name
          asset { address symbol decimals priceUsd }
          chain { id }
          state {
            totalAssetsUsd totalSupply totalAssets apy netApy fee
          }
          metadata { description }
        }
      }
    }
  `;

  const data = await graphql<{ vaults: { items: MorphoVault[] } }>(query);
  setCache(cacheKey, data);
  return data.vaults.items;
}

export async function queryVaultByAddress(address: string, chainId: number): Promise<MorphoVault | null> {
  const query = `
    query($address: String!, $chainId: Int!) {
      vaultByAddress(address: $address, chainId: $chainId) {
        address symbol name
        asset { address symbol decimals priceUsd }
        chain { id }
        state {
          totalAssetsUsd totalSupply totalAssets apy netApy fee
        }
        metadata { description }
      }
    }
  `;

  const data = await graphql<{ vaultByAddress: MorphoVault | null }>(query, { address, chainId });
  return data.vaultByAddress;
}

export async function queryUserVaultPosition(
  userAddress: string,
  vaultAddress: string,
  chainId: number
): Promise<MorphoVaultPosition | null> {
  const query = `
    query($user: String!, $vault: String!, $chainId: Int!) {
      vaultPosition(userAddress: $user, vaultAddress: $vault, chainId: $chainId) {
        shares assets assetsUsd
      }
    }
  `;

  const data = await graphql<{ vaultPosition: MorphoVaultPosition | null }>(query, {
    user: userAddress,
    vault: vaultAddress,
    chainId,
  });
  return data.vaultPosition;
}

export async function queryUserPositions(
  userAddress: string,
  chainId?: number
): Promise<{
  marketPositions: Array<MorphoMarketPosition & { market: MorphoMarket }>;
  vaultPositions: Array<MorphoVaultPosition & { vault: MorphoVault }>;
}> {
  const chainFilter = chainId ? `, chainId: ${chainId}` : "";
  const query = `
    query($user: String!) {
      marketPositions(where: { userAddress_in: [$user]${chainFilter} }, first: 100) {
        items {
          supplyShares supplyAssets supplyAssetsUsd
          borrowShares borrowAssets borrowAssetsUsd
          collateral collateralUsd
          market {
            uniqueKey
            loanAsset { address symbol decimals priceUsd }
            collateralAsset { address symbol decimals priceUsd }
            lltv oracleAddress irmAddress
            state {
              borrowApy supplyApy
              borrowAssetsUsd supplyAssetsUsd collateralAssetsUsd liquidityAssetsUsd
              utilization borrowAssets supplyAssets collateralAssets fee
            }
          }
        }
      }
      vaultPositions(where: { userAddress_in: [$user]${chainFilter} }, first: 100) {
        items {
          shares assets assetsUsd
          vault {
            address symbol name
            asset { address symbol decimals priceUsd }
            chain { id }
            state { totalAssetsUsd totalSupply totalAssets apy netApy fee }
            metadata { description }
          }
        }
      }
    }
  `;

  const data = await graphql<{
    marketPositions: { items: Array<MorphoMarketPosition & { market: MorphoMarket }> };
    vaultPositions: { items: Array<MorphoVaultPosition & { vault: MorphoVault }> };
  }>(query, { user: userAddress });

  return {
    marketPositions: data.marketPositions.items,
    vaultPositions: data.vaultPositions.items,
  };
}
