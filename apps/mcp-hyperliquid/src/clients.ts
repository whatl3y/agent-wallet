import {
  HttpTransport,
  InfoClient,
} from "@nktkas/hyperliquid";
import type { PerpsMeta } from "@nktkas/hyperliquid";
import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";

const isTestnet = process.env.HYPERLIQUID_TESTNET === "true";

let infoClient: InfoClient | null = null;
let metaCache: PerpsMeta | null = null;

function getTransport(): HttpTransport {
  return new HttpTransport({ isTestnet });
}

export function getInfoClient(): InfoClient {
  if (!infoClient) {
    infoClient = new InfoClient({ transport: getTransport() });
  }
  return infoClient;
}

export function isHyperliquidTestnet(): boolean {
  return isTestnet;
}

/**
 * Resolve a coin symbol (e.g. "BTC") to its numeric asset index.
 * Caches the meta response for efficiency.
 */
export async function getCoinIndex(coin: string): Promise<number> {
  if (!metaCache) {
    metaCache = await getInfoClient().meta();
  }
  const index = metaCache.universe.findIndex(
    (m) => m.name.toUpperCase() === coin.toUpperCase()
  );
  if (index === -1) {
    throw new Error(
      `Unknown coin: ${coin}. Available: ${metaCache.universe.map((m) => m.name).join(", ")}`
    );
  }
  return index;
}

/**
 * Get perps metadata (cached).
 */
export async function getMeta(): Promise<PerpsMeta> {
  if (!metaCache) {
    metaCache = await getInfoClient().meta();
  }
  return metaCache;
}

/**
 * Clear the metadata cache (useful if universe changes).
 */
export function clearMetaCache(): void {
  metaCache = null;
}

// ── Arbitrum viem client (read-only, for bridge balance checks) ─────

const ARBITRUM_RPC =
  process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";

let arbPublicClient: ReturnType<typeof createPublicClient> | null = null;

export function getArbitrumPublicClient() {
  if (!arbPublicClient) {
    arbPublicClient = createPublicClient({
      chain: arbitrum,
      transport: http(ARBITRUM_RPC),
    });
  }
  return arbPublicClient;
}
