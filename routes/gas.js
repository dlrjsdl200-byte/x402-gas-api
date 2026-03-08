const { Router } = require("express");
const { createPublicClient, http, fallback, formatGwei } = require("viem");
const { mainnet, base, arbitrum, optimism, bsc, polygon, avalanche, zksync, hyperEvm } = require("viem/chains");
const { getTokenPrices, nativeTokenForChain } = require("../lib/priceCache");
const { estimateL1Fee } = require("../lib/optimismL1Fee");

const router = Router();

// ── Gas units for cost estimation ──
const ETH_TRANSFER_GAS = 21000n;
const ERC20_TRANSFER_GAS = 65000n;
const DEX_SWAP_GAS = 150000n;

// ── Basic chains (4) — $0.001 / 1 call ──
const basicChains = [
  {
    name: "Ethereum",
    chain: mainnet,
    rpcs: ["https://cloudflare-eth.com", "https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
    explorer: "https://etherscan.io",
    color: "#627EEA",
  },
  {
    name: "Base",
    chain: base,
    rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.drpc.org"],
    explorer: "https://basescan.org",
    color: "#0052FF",
  },
  {
    name: "Arbitrum",
    chain: arbitrum,
    rpcs: ["https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org", "https://arb1.arbitrum.io/rpc"],
    explorer: "https://arbiscan.io",
    color: "#28A0F0",
  },
  {
    name: "Optimism",
    chain: optimism,
    rpcs: ["https://optimism-rpc.publicnode.com", "https://optimism.drpc.org", "https://mainnet.optimism.io"],
    explorer: "https://optimistic.etherscan.io",
    color: "#FF0420",
  },
];

// ── Premium-only chains (5) — included in premium tier ──
const premiumOnlyChains = [
  {
    name: "BNB Chain",
    chain: bsc,
    rpcs: ["https://bsc-dataseed.binance.org", "https://bsc.drpc.org", "https://bsc-rpc.publicnode.com"],
    explorer: "https://bscscan.com",
    color: "#F3BA2F",
  },
  {
    name: "Polygon",
    chain: polygon,
    rpcs: ["https://polygon.drpc.org", "https://polygon-bor-rpc.publicnode.com", "https://1rpc.io/matic"],
    explorer: "https://polygonscan.com",
    color: "#8247E5",
  },
  {
    name: "Avalanche",
    chain: avalanche,
    rpcs: ["https://avalanche-c-chain-rpc.publicnode.com", "https://api.avax.network/ext/bc/C/rpc", "https://avalanche.drpc.org"],
    explorer: "https://snowtrace.io",
    color: "#E84142",
  },
  {
    name: "zkSync Era",
    chain: zksync,
    rpcs: ["https://mainnet.era.zksync.io", "https://1rpc.io/zksync2-era", "https://zksync.drpc.org"],
    explorer: "https://explorer.zksync.io",
    color: "#8C8DFC",
  },
  {
    name: "Hyperliquid",
    chain: hyperEvm,
    rpcs: ["https://rpc.hyperliquid.xyz/evm"],
    explorer: "https://explorer.hyperliquid.xyz",
    color: "#2DE6B1",
  },
];

// Premium = Basic + Premium-only (9 chains total)
const premiumChains = [...basicChains, ...premiumOnlyChains];

function createClient(chainConfig) {
  return createPublicClient({
    chain: chainConfig.chain,
    transport: fallback(
      chainConfig.rpcs.map((url) => http(url, { timeout: 10_000 }))
    ),
  });
}

// Convert native token cost to USDC
function toUsdc(nativeAmount, tokenPrice) {
  return parseFloat((nativeAmount * tokenPrice).toFixed(6));
}

// ── Fetch gas price for a single chain ──
async function getGasPrice(chainConfig, tokenPrices, optimismL1Fees) {
  const start = Date.now();
  try {
    const client = createClient(chainConfig);
    const nativeToken = nativeTokenForChain(chainConfig.name);
    const tokenPrice = tokenPrices[nativeToken] || 0;

    const [block, priorityFee] = await Promise.all([
      client.getBlock({ blockTag: "latest" }),
      client.estimateMaxPriorityFeePerGas().catch(() => 100000000n),
    ]);

    const baseFee = block.baseFeePerGas ?? 0n;
    const totalFee = baseFee + priorityFee;
    const latency = Date.now() - start;

    // L2 execution cost in native token
    const l2CostNative = (gasUnits) => Number(totalFee * gasUnits) / 1e18;

    // Optimism: add L1 data fee (in ETH, since OP uses ETH as native)
    const isOptimism = chainConfig.name === "Optimism";
    const l1FeeNativeTransfer = isOptimism ? Number(optimismL1Fees.nativeTransfer) / 1e18 : 0;
    const l1FeeErc20 = isOptimism ? Number(optimismL1Fees.erc20Transfer) / 1e18 : 0;
    const l1FeeDex = isOptimism ? Number(optimismL1Fees.dexSwap) / 1e18 : 0;

    const costs = {
      nativeTransfer: {
        native: (l2CostNative(ETH_TRANSFER_GAS) + l1FeeNativeTransfer).toFixed(8),
        usdc: toUsdc(l2CostNative(ETH_TRANSFER_GAS) + l1FeeNativeTransfer, tokenPrice),
        gasUnits: ETH_TRANSFER_GAS.toString(),
        label: "Simple native token transfer",
      },
      erc20Transfer: {
        native: (l2CostNative(ERC20_TRANSFER_GAS) + l1FeeErc20).toFixed(8),
        usdc: toUsdc(l2CostNative(ERC20_TRANSFER_GAS) + l1FeeErc20, tokenPrice),
        gasUnits: ERC20_TRANSFER_GAS.toString(),
        label: "ERC-20 token transfer",
      },
      dexSwap: {
        native: (l2CostNative(DEX_SWAP_GAS) + l1FeeDex).toFixed(8),
        usdc: toUsdc(l2CostNative(DEX_SWAP_GAS) + l1FeeDex, tokenPrice),
        gasUnits: DEX_SWAP_GAS.toString(),
        label: "DEX swap (Uniswap-style)",
      },
    };

    return {
      chain: chainConfig.name,
      chainId: chainConfig.chain.id,
      nativeToken,
      tokenPriceUsd: tokenPrice,
      gasPrice: {
        baseFeeWei: baseFee.toString(),
        priorityFeeWei: priorityFee.toString(),
        totalFeeWei: totalFee.toString(),
        baseFeeGwei: parseFloat(formatGwei(baseFee)).toFixed(4),
        priorityFeeGwei: parseFloat(formatGwei(priorityFee)).toFixed(4),
        totalFeeGwei: parseFloat(formatGwei(totalFee)).toFixed(4),
      },
      ...(isOptimism && {
        l1DataFee: {
          nativeTransferWei: optimismL1Fees.nativeTransfer.toString(),
          erc20TransferWei: optimismL1Fees.erc20Transfer.toString(),
          dexSwapWei: optimismL1Fees.dexSwap.toString(),
          note: "L1 data posting fee (Ecotone formula) added to estimated costs",
        },
      }),
      estimatedCosts: costs,
      blockNumber: block.number?.toString(),
      explorer: chainConfig.explorer,
      latencyMs: latency,
      status: "ok",
    };
  } catch (err) {
    return {
      chain: chainConfig.name,
      chainId: chainConfig.chain.id,
      nativeToken: nativeTokenForChain(chainConfig.name),
      error: err.message,
      latencyMs: Date.now() - start,
      status: "error",
    };
  }
}

// ── Recommendation based on USDC cost ──
function buildRecommendation(validResults) {
  if (validResults.length === 0) return null;

  const cheapest = validResults.reduce((min, cur) =>
    cur.estimatedCosts.dexSwap.usdc < min.estimatedCosts.dexSwap.usdc ? cur : min
  );
  const mostExpensive = validResults.reduce((max, cur) =>
    cur.estimatedCosts.dexSwap.usdc > max.estimatedCosts.dexSwap.usdc ? cur : max
  );

  const savingsPercent =
    mostExpensive.estimatedCosts.dexSwap.usdc > 0
      ? (
          (1 - cheapest.estimatedCosts.dexSwap.usdc / mostExpensive.estimatedCosts.dexSwap.usdc) *
          100
        ).toFixed(1)
      : "0";

  return {
    cheapestChain: cheapest.chain,
    cheapestChainId: cheapest.chainId,
    estimatedCostsUsdc: {
      nativeTransfer: cheapest.estimatedCosts.nativeTransfer.usdc,
      erc20Transfer: cheapest.estimatedCosts.erc20Transfer.usdc,
      dexSwap: cheapest.estimatedCosts.dexSwap.usdc,
    },
    vsExpensive: {
      chain: mostExpensive.chain,
      dexSwapUsdc: mostExpensive.estimatedCosts.dexSwap.usdc,
      savingsPercent: `${savingsPercent}%`,
    },
    action: `Use ${cheapest.chain} — saves ${savingsPercent}% vs ${mostExpensive.chain}`,
  };
}

// ── GET /gas ──
router.get("/", async (req, res) => {
  const isDemo = req.query.demo === "true";
  const isPremium = req.sessionTier === "premium";
  const startTime = Date.now();

  const activeChains = isPremium ? premiumChains : basicChains;

  try {
    // Fetch token prices + Optimism L1 fees + all gas prices in parallel
    const optimismConfig = activeChains.find((c) => c.name === "Optimism");

    const [tokenPrices, optimismL1Fees] = await Promise.all([
      getTokenPrices().catch(() => ({ ETH: 0, BNB: 0, POL: 0, AVAX: 0, HYPE: 0 })),
      optimismConfig
        ? estimateL1Fee(optimismConfig.rpcs).catch(() => ({ nativeTransfer: 0n, erc20Transfer: 0n, dexSwap: 0n }))
        : { nativeTransfer: 0n, erc20Transfer: 0n, dexSwap: 0n },
    ]);

    const results = await Promise.allSettled(
      activeChains.map((c) => getGasPrice(c, tokenPrices, optimismL1Fees))
    );

    const gasData = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { chain: "unknown", status: "error", error: r.reason?.message }
    );

    const validResults = gasData.filter((g) => g.status === "ok");

    // Demo: no recommendation (raw gas data only)
    const recommendation = isDemo ? null : buildRecommendation(validResults);

    // Demo: strip recommendation-related fields from chain data
    const outputChains = isDemo
      ? gasData.map(({ estimatedCosts, ...rest }) => ({
          ...rest,
          estimatedCosts: estimatedCosts
            ? {
                nativeTransfer: { native: estimatedCosts.nativeTransfer.native, gasUnits: estimatedCosts.nativeTransfer.gasUnits, label: estimatedCosts.nativeTransfer.label },
                erc20Transfer: { native: estimatedCosts.erc20Transfer.native, gasUnits: estimatedCosts.erc20Transfer.gasUnits, label: estimatedCosts.erc20Transfer.label },
                dexSwap: { native: estimatedCosts.dexSwap.native, gasUnits: estimatedCosts.dexSwap.gasUnits, label: estimatedCosts.dexSwap.label },
              }
            : undefined,
        }))
      : gasData;

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      tier: isDemo ? "demo" : isPremium ? "premium" : "basic",
      totalLatencyMs: Date.now() - startTime,
      ...(isDemo ? {} : { tokenPrices }),
      recommendation,
      chains: outputChains,
      meta: {
        provider: "MGO — Multi-chain Gas Optimizer",
        protocol: "x402",
        version: "2.0.0",
        tier: isDemo ? "demo" : isPremium ? "premium" : "basic",
        chainsQueried: activeChains.length,
        chainsSucceeded: validResults.length,
        costUnit: "USDC",
        priceSource: "CoinGecko (1-min cache)",
        notes: [
          "All estimated costs are in USDC for cross-chain comparison",
          "Optimism costs include L1 data posting fee (Ecotone formula)",
          "Gas prices shown in native gwei; USDC = native cost × token price",
        ],
        pricing: {
          basic: "$0.001 USDC / 1 call — 4 chains (ETH, Base, Arbitrum, Optimism)",
          premium: "$0.002 USDC / 1 call — 9 chains (+ BNB, Polygon, Avalanche, zkSync, Hyperliquid)",
        },
      },
    };

    if (isDemo) {
      response.demo_notice =
        "Free demo — raw gas prices only. Upgrade to Basic ($0.001) for recommendations & savings calculations, or Premium ($0.002) for 9-chain coverage.";
    }

    if (!isPremium && !isDemo) {
      response.upgrade_notice =
        "Upgrade to Premium ($0.002/call) to unlock BNB, Polygon, Avalanche, zkSync, Hyperliquid comparisons.";
    }

    res.json(response);
  } catch (err) {
    console.error("[GAS ERROR]", err);
    res.status(500).json({ success: false, error: "Failed to fetch gas prices" });
  }
});

module.exports = router;
