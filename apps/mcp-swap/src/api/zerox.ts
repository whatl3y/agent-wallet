const ZEROX_BASE_URL = "https://api.0x.org";

interface ZeroxPriceParams {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
}

interface ZeroxQuoteParams extends ZeroxPriceParams {
  taker: string;
  slippageBps?: number;
}

export interface ZeroxPriceResponse {
  buyAmount: string;
  sellAmount: string;
  buyToken: string;
  sellToken: string;
  totalNetworkFee: string;
  route: {
    fills: Array<{
      source: string;
      proportionBps: string;
    }>;
  };
}

export interface ZeroxQuoteResponse extends ZeroxPriceResponse {
  transaction: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
}

function getApiKey(): string {
  const key = process.env.ZEROX_API_KEY;
  if (!key) {
    throw new Error("Missing ZEROX_API_KEY environment variable");
  }
  return key;
}

function buildHeaders(): Record<string, string> {
  return {
    "0x-api-key": getApiKey(),
    "0x-version": "v2",
    "Content-Type": "application/json",
  };
}

/**
 * Get a swap price estimate (no transaction data).
 * Use for price discovery before committing to a swap.
 */
export async function getSwapPrice(
  params: ZeroxPriceParams
): Promise<ZeroxPriceResponse> {
  const url = new URL(`${ZEROX_BASE_URL}/swap/allowance-holder/price`);
  url.searchParams.set("chainId", params.chainId.toString());
  url.searchParams.set("sellToken", params.sellToken);
  url.searchParams.set("buyToken", params.buyToken);
  url.searchParams.set("sellAmount", params.sellAmount);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`0x price API error (${response.status}): ${body}`);
  }

  return response.json();
}

/**
 * Get a firm swap quote with executable transaction data.
 * Includes the transaction calldata to execute the swap.
 */
export async function getSwapQuote(
  params: ZeroxQuoteParams
): Promise<ZeroxQuoteResponse> {
  const url = new URL(`${ZEROX_BASE_URL}/swap/allowance-holder/quote`);
  url.searchParams.set("chainId", params.chainId.toString());
  url.searchParams.set("sellToken", params.sellToken);
  url.searchParams.set("buyToken", params.buyToken);
  url.searchParams.set("sellAmount", params.sellAmount);
  url.searchParams.set("taker", params.taker);

  if (params.slippageBps !== undefined) {
    url.searchParams.set("slippageBps", params.slippageBps.toString());
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`0x quote API error (${response.status}): ${body}`);
  }

  return response.json();
}
