const COINGECKO_IDS = {
  ETH: "ethereum",
  BNB: "binancecoin",
  POL: "polygon-ecosystem-token",
  AVAX: "avalanche-2",
  HYPE: "hyperliquid",
};

const CACHE_TTL_MS = 60_000; // 1 minute

let cachedPrices = null;
let lastFetchedAt = 0;
let fetchPromise = null;

async function fetchPrices() {
  const ids = Object.values(COINGECKO_IDS).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);

  const data = await res.json();

  const prices = {};
  for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
    prices[symbol] = data[geckoId]?.usd ?? 0;
  }
  return prices;
}

async function getTokenPrices() {
  const now = Date.now();

  if (cachedPrices && now - lastFetchedAt < CACHE_TTL_MS) {
    return cachedPrices;
  }

  // Deduplicate concurrent requests
  if (!fetchPromise) {
    fetchPromise = fetchPrices()
      .then((prices) => {
        cachedPrices = prices;
        lastFetchedAt = Date.now();
        fetchPromise = null;
        return prices;
      })
      .catch((err) => {
        fetchPromise = null;
        // Return stale cache if available
        if (cachedPrices) {
          console.warn("[PRICE] CoinGecko fetch failed, using stale cache:", err.message);
          return cachedPrices;
        }
        throw err;
      });
  }

  return fetchPromise;
}

// Map chain name → native token symbol
const CHAIN_NATIVE_TOKEN = {
  Ethereum: "ETH",
  Base: "ETH",
  Arbitrum: "ETH",
  Optimism: "ETH",
  "BNB Chain": "BNB",
  Polygon: "POL",
  Avalanche: "AVAX",
  "zkSync Era": "ETH",
  Hyperliquid: "HYPE",
};

function nativeTokenForChain(chainName) {
  return CHAIN_NATIVE_TOKEN[chainName] || "ETH";
}

module.exports = { getTokenPrices, nativeTokenForChain, CHAIN_NATIVE_TOKEN };
