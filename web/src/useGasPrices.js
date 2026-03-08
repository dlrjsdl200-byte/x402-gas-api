import { useState, useEffect, useRef } from "react";
import { createPublicClient, http, fallback, formatGwei, parseAbi } from "viem";
import { mainnet, base, arbitrum, optimism, bsc, polygon, avalanche, zksync, hyperEvm } from "viem/chains";

// ── Chain config ──
const CHAIN_NATIVE_TOKEN = {
  Ethereum: "ETH", Base: "ETH", Arbitrum: "ETH", Optimism: "ETH",
  "BNB Chain": "BNB", Polygon: "POL", Avalanche: "AVAX",
  "zkSync Era": "ETH", Hyperliquid: "HYPE",
};

const BASIC_CHAINS = [
  { name: "Ethereum", chain: mainnet, rpcs: ["https://cloudflare-eth.com", "https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"], color: "#627EEA", tier: "basic" },
  { name: "Base", chain: base, rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.drpc.org"], color: "#0052FF", tier: "basic" },
  { name: "Arbitrum", chain: arbitrum, rpcs: ["https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org", "https://arb1.arbitrum.io/rpc"], color: "#28A0F0", tier: "basic" },
  { name: "Optimism", chain: optimism, rpcs: ["https://optimism-rpc.publicnode.com", "https://optimism.drpc.org", "https://mainnet.optimism.io"], color: "#FF0420", tier: "basic" },
];

const PREMIUM_CHAINS = [
  { name: "BNB Chain", chain: bsc, rpcs: ["https://bsc-dataseed.binance.org", "https://bsc.drpc.org", "https://bsc-rpc.publicnode.com"], color: "#F3BA2F", tier: "premium" },
  { name: "Polygon", chain: polygon, rpcs: ["https://polygon.drpc.org", "https://polygon-bor-rpc.publicnode.com", "https://1rpc.io/matic"], color: "#8247E5", tier: "premium" },
  { name: "Avalanche", chain: avalanche, rpcs: ["https://avalanche-c-chain-rpc.publicnode.com", "https://api.avax.network/ext/bc/C/rpc", "https://avalanche.drpc.org"], color: "#E84142", tier: "premium" },
  { name: "zkSync Era", chain: zksync, rpcs: ["https://mainnet.era.zksync.io", "https://1rpc.io/zksync2-era", "https://zksync.drpc.org"], color: "#8C8DFC", tier: "premium" },
  { name: "Hyperliquid", chain: hyperEvm, rpcs: ["https://rpc.hyperliquid.xyz/evm"], color: "#2DE6B1", tier: "premium" },
];

const CHAINS = [...BASIC_CHAINS, ...PREMIUM_CHAINS];

const clients = CHAINS.map((c) =>
  createPublicClient({
    chain: c.chain,
    transport: fallback(c.rpcs.map((url) => http(url, { timeout: 10_000 }))),
  })
);

// ── Gas units ──
const ETH_TRANSFER_GAS = 21000n;
const ERC20_TRANSFER_GAS = 65000n;
const DEX_SWAP_GAS = 150000n;

// ── CoinGecko price cache (1 min) ──
const COINGECKO_IDS = "ethereum,binancecoin,polygon-ecosystem-token,avalanche-2,hyperliquid";
const GECKO_MAP = {
  ethereum: "ETH", binancecoin: "BNB",
  "polygon-ecosystem-token": "POL", "avalanche-2": "AVAX", hyperliquid: "HYPE",
};

let priceCache = null;
let priceFetchedAt = 0;

async function getTokenPrices() {
  const now = Date.now();
  if (priceCache && now - priceFetchedAt < 60_000) return priceCache;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const data = await res.json();
    const prices = {};
    for (const [geckoId, symbol] of Object.entries(GECKO_MAP)) {
      prices[symbol] = data[geckoId]?.usd ?? 0;
    }
    priceCache = prices;
    priceFetchedAt = now;
    return prices;
  } catch {
    return priceCache || { ETH: 0, BNB: 0, POL: 0, AVAX: 0, HYPE: 0 };
  }
}

// ── Optimism L1 data fee ──
const OP_ORACLE = "0x420000000000000000000000000000000000000F";
const oracleAbi = parseAbi([
  "function l1BaseFee() view returns (uint256)",
  "function baseFeeScalar() view returns (uint32)",
  "function blobBaseFeeScalar() view returns (uint32)",
  "function blobBaseFee() view returns (uint256)",
]);

const CALLDATA_SIZES = { nativeTransfer: 0, erc20Transfer: 68, dexSwap: 260 };

async function fetchOptimismL1Fees() {
  const opIdx = CHAINS.findIndex((c) => c.name === "Optimism");
  if (opIdx === -1) return { nativeTransfer: 0n, erc20Transfer: 0n, dexSwap: 0n };

  try {
    const c = clients[opIdx];
    const [l1BaseFee, baseFeeScalar, blobBaseFeeScalar, blobBaseFee] = await Promise.all([
      c.readContract({ address: OP_ORACLE, abi: oracleAbi, functionName: "l1BaseFee" }),
      c.readContract({ address: OP_ORACLE, abi: oracleAbi, functionName: "baseFeeScalar" }),
      c.readContract({ address: OP_ORACLE, abi: oracleAbi, functionName: "blobBaseFeeScalar" }),
      c.readContract({ address: OP_ORACLE, abi: oracleAbi, functionName: "blobBaseFee" }),
    ]);

    const fees = {};
    for (const [txType, bytes] of Object.entries(CALLDATA_SIZES)) {
      if (bytes === 0) { fees[txType] = 0n; continue; }
      const scaledL1 = BigInt(baseFeeScalar) * l1BaseFee * 16n;
      const scaledBlob = BigInt(blobBaseFeeScalar) * blobBaseFee;
      fees[txType] = (scaledL1 + scaledBlob) * BigInt(bytes) / 1000000n;
    }
    return fees;
  } catch {
    return { nativeTransfer: 0n, erc20Transfer: 0n, dexSwap: 0n };
  }
}

// ── Fetch single chain ──
function buildChainResult(chainConfig, block, priorityFee, tokenPrices, opL1Fees, start) {
  const baseFee = block.baseFeePerGas ?? 0n;
  const totalFee = baseFee + priorityFee;
  const nativeToken = CHAIN_NATIVE_TOKEN[chainConfig.name] || "ETH";
  const tokenPrice = tokenPrices[nativeToken] || 0;
  const isOp = chainConfig.name === "Optimism";

  const l2Cost = (gasUnits) => Number(totalFee * gasUnits) / 1e18;
  const l1Native = isOp ? Number(opL1Fees.nativeTransfer) / 1e18 : 0;
  const l1Erc20 = isOp ? Number(opL1Fees.erc20Transfer) / 1e18 : 0;
  const l1Dex = isOp ? Number(opL1Fees.dexSwap) / 1e18 : 0;

  const toUsdc = (native) => parseFloat((native * tokenPrice).toFixed(6));

  const nativeTransferCost = l2Cost(ETH_TRANSFER_GAS) + l1Native;
  const erc20Cost = l2Cost(ERC20_TRANSFER_GAS) + l1Erc20;
  const dexCost = l2Cost(DEX_SWAP_GAS) + l1Dex;

  return {
    chain: chainConfig.name,
    chainId: chainConfig.chain.id,
    color: chainConfig.color,
    tier: chainConfig.tier,
    nativeToken,
    tokenPriceUsd: tokenPrice,
    baseFeeGwei: parseFloat(formatGwei(baseFee)).toFixed(4),
    priorityFeeGwei: parseFloat(formatGwei(priorityFee)).toFixed(4),
    totalFeeGwei: parseFloat(formatGwei(totalFee)).toFixed(4),
    totalFeeWei: totalFee.toString(),
    costs: {
      nativeTransfer: { native: nativeTransferCost.toFixed(8), usdc: toUsdc(nativeTransferCost) },
      erc20Transfer: { native: erc20Cost.toFixed(8), usdc: toUsdc(erc20Cost) },
      dexSwap: { native: dexCost.toFixed(8), usdc: toUsdc(dexCost) },
    },
    blockNumber: block.number?.toString(),
    latencyMs: Date.now() - start,
    status: "ok",
  };
}

async function fetchOne(client, chainConfig, tokenPrices, opL1Fees) {
  const start = Date.now();
  const [block, priorityFee] = await Promise.all([
    client.getBlock({ blockTag: "latest" }),
    client.estimateMaxPriorityFeePerGas().catch(() => 100000000n),
  ]);
  return buildChainResult(chainConfig, block, priorityFee, tokenPrices, opL1Fees, start);
}

// ── Hook ──
const POLL_INTERVAL = 3000;

export function useGasPrices() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  async function fetchAll() {
    try {
      const [tokenPrices, opL1Fees] = await Promise.all([
        getTokenPrices(),
        fetchOptimismL1Fees(),
      ]);

      const results = await Promise.allSettled(
        CHAINS.map((c, i) => fetchOne(clients[i], c, tokenPrices, opL1Fees))
      );

      const gasData = results.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : {
              chain: CHAINS[i].name,
              chainId: CHAINS[i].chain.id,
              color: CHAINS[i].color,
              tier: CHAINS[i].tier,
              status: "error",
              error: r.reason?.message || "RPC failed",
            }
      );

      const validData = gasData.filter((g) => g.status === "ok");

      if (validData.length === 0) {
        setError("All RPC calls failed");
        return;
      }

      // Compare by USDC dexSwap cost
      const cheapest = validData.reduce((min, cur) =>
        cur.costs.dexSwap.usdc < min.costs.dexSwap.usdc ? cur : min
      );
      const mostExpensive = validData.reduce((max, cur) =>
        cur.costs.dexSwap.usdc > max.costs.dexSwap.usdc ? cur : max
      );

      const savingsPercent =
        mostExpensive.costs.dexSwap.usdc > 0
          ? ((1 - cheapest.costs.dexSwap.usdc / mostExpensive.costs.dexSwap.usdc) * 100).toFixed(1)
          : "0";

      setData({
        chains: gasData,
        cheapest: cheapest.chain,
        savingsPercent,
        vsChain: mostExpensive.chain,
        tokenPrices,
      });
      setError(null);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, []);

  return { data, error, loading, lastUpdate, refetch: fetchAll };
}
