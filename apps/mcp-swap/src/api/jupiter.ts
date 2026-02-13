const JUPITER_BASE_URL = "https://api.jup.ag";

interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}

interface JupiterSwapParams {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
}

interface RoutePlanStep {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: RoutePlanStep[];
}

export interface JupiterSwapResponse {
  swapTransaction: string;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.JUPITER_API_KEY;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

/**
 * Get a swap quote from Jupiter.
 * Returns route info and expected output amount.
 */
export async function getJupiterQuote(
  params: JupiterQuoteParams
): Promise<JupiterQuoteResponse> {
  const url = new URL(`${JUPITER_BASE_URL}/swap/v1/quote`);
  url.searchParams.set("inputMint", params.inputMint);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.amount);

  if (params.slippageBps !== undefined) {
    url.searchParams.set("slippageBps", params.slippageBps.toString());
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jupiter quote API error (${response.status}): ${body}`);
  }

  return response.json();
}

/**
 * Build a swap transaction from a Jupiter quote.
 * Returns a base64-encoded unsigned VersionedTransaction.
 */
export async function getJupiterSwap(
  params: JupiterSwapParams
): Promise<JupiterSwapResponse> {
  const response = await fetch(`${JUPITER_BASE_URL}/swap/v1/swap`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jupiter swap API error (${response.status}): ${body}`);
  }

  return response.json();
}
