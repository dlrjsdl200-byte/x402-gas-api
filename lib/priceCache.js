// Native token USD prices from CoinGecko with a two-layer cache:
//   1. per-instance memory (fast path)
//   2. shared Upstash Redis (so N serverless instances make 1 CoinGecko call/min,
//      which keeps us under the free-tier limit; CoinGecko 429s are what made
//      prices show up as $0 before)
const redis = require("./redis");

const COINGECKO_IDS = {
  ETH: "ethereum",
  BNB: "binancecoin",
  POL: "polygon-ecosystem-token",
  AVAX: "avalanche-2",
  HYPE: "hyperliquid",
};

const CACHE_TTL_MS = 60_000;       // fresh window
const SHARED_TTL_SEC = 600;        // keep a stale copy in Redis for 10 min as fallback
const SHARED_KEY = "mgo:prices";

let cachedPrices = null;
let lastFetchedAt = 0;
let fetchPromise = null;

async function fetchFromCoinGecko() {
  const ids = Object.values(COINGECKO_IDS).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);
  const data = await res.json();
  const prices = {};
  for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) prices[symbol] = data[geckoId]?.usd ?? 0;
  if (!(prices.ETH > 0)) throw new Error("CoinGecko returned no ETH price");
  return prices;
}

async function readShared() {
  const raw = await redis.get(SHARED_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function refresh() {
  // Another instance may have refreshed within the last minute.
  const shared = await readShared();
  if (shared && Date.now() - shared.fetchedAt < CACHE_TTL_MS) return shared;
  try {
    const prices = await fetchFromCoinGecko();
    const entry = { prices, fetchedAt: Date.now(), source: "coingecko" };
    redis.setex(SHARED_KEY, SHARED_TTL_SEC, JSON.stringify(entry)); // fire and forget
    return entry;
  } catch (err) {
    if (shared) { console.warn("[PRICE] CoinGecko failed, using shared stale copy:", err.message); return { ...shared, source: "stale-shared" }; }
    if (cachedPrices) { console.warn("[PRICE] CoinGecko failed, using instance stale copy:", err.message); return { prices: cachedPrices, fetchedAt: lastFetchedAt, source: "stale-instance" }; }
    throw err;
  }
}

// Returns { ETH, BNB, POL, AVAX, HYPE } in USD. Throws only if nothing (fresh or stale) is available.
async function getTokenPrices() {
  if (cachedPrices && Date.now() - lastFetchedAt < CACHE_TTL_MS) return cachedPrices;
  if (!fetchPromise) {
    fetchPromise = refresh()
      .then((entry) => { cachedPrices = entry.prices; lastFetchedAt = entry.fetchedAt; return entry.prices; })
      .finally(() => { fetchPromise = null; });
  }
  return fetchPromise;
}

// Same as above but with metadata, for the public /prices endpoint.
async function getTokenPricesDetailed() {
  const prices = await getTokenPrices();
  return { prices, fetchedAt: new Date(lastFetchedAt).toISOString(), ageSec: Math.round((Date.now() - lastFetchedAt) / 1000) };
}

const CHAIN_NATIVE_TOKEN = {
  Ethereum: "ETH", Base: "ETH", Arbitrum: "ETH", Optimism: "ETH",
  "BNB Chain": "BNB", Polygon: "POL", Avalanche: "AVAX", "zkSync Era": "ETH", Hyperliquid: "HYPE",
};

function nativeTokenForChain(chainName) {
  return CHAIN_NATIVE_TOKEN[chainName] || "ETH";
}

module.exports = { getTokenPrices, getTokenPricesDetailed, nativeTokenForChain, CHAIN_NATIVE_TOKEN };
