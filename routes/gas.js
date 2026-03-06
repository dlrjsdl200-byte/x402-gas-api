const { Router } = require("express");
const { createPublicClient, http, formatGwei } = require("viem");
const { mainnet, base, arbitrum, optimism, bsc, polygon } = require("viem/chains");

const router = Router();

// ── Basic chains (4) — $0.01 / 10 calls ──
const basicChains = [
  {
    name: "Ethereum",
    chain: mainnet,
    rpc: process.env.RPC_ETHEREUM || "https://eth.llamarpc.com",
    explorer: "https://etherscan.io",
    color: "#627EEA",
  },
  {
    name: "Base",
    chain: base,
    rpc: process.env.RPC_BASE || "https://mainnet.base.org",
    explorer: "https://basescan.org",
    color: "#0052FF",
  },
  {
    name: "Arbitrum",
    chain: arbitrum,
    rpc: process.env.RPC_ARBITRUM || "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io",
    color: "#28A0F0",
  },
  {
    name: "Optimism",
    chain: optimism,
    rpc: process.env.RPC_OPTIMISM || "https://mainnet.optimism.io",
    explorer: "https://optimistic.etherscan.io",
    color: "#FF0420",
  },
];

// ── Premium-only chains (2) — included in premium tier ──
const premiumOnlyChains = [
  {
    name: "BNB Chain",
    chain: bsc,
    rpc: process.env.RPC_BSC || "https://bsc-dataseed.binance.org",
    explorer: "https://bscscan.com",
    color: "#F3BA2F",
  },
  {
    name: "Polygon",
    chain: polygon,
    rpc: process.env.RPC_POLYGON || "https://polygon-rpc.com",
    explorer: "https://polygonscan.com",
    color: "#8247E5",
  },
];

// Premium = Basic + Premium-only (6 chains total)
const premiumChains = [...basicChains, ...premiumOnlyChains];

function createClient(chainConfig) {
  return createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpc),
  });
}

// ── EIP-1559 gas price fetch ──
// baseFeePerGas from latest block + estimateMaxPriorityFeePerGas
// totalFee = baseFee + priorityFee → actual cost paid by user
async function getGasPrice(chainConfig) {
  const start = Date.now();
  try {
    const client = createClient(chainConfig);

    const [block, priorityFee] = await Promise.all([
      client.getBlock({ blockTag: "latest" }),
      client.estimateMaxPriorityFeePerGas().catch(() => 100000000n), // fallback: 0.1 gwei
    ]);

    const baseFee = block.baseFeePerGas ?? 0n;
    const totalFee = baseFee + priorityFee;
    const latency = Date.now() - start;

    // Common gas usage estimates
    const ETH_TRANSFER_GAS = 21000n;    // simple ETH/BNB/MATIC send
    const ERC20_TRANSFER_GAS = 65000n;  // ERC-20 token transfer
    const DEX_SWAP_GAS = 150000n;       // Uniswap-style DEX swap

    const costEth = (gasUnits) =>
      (Number(totalFee * gasUnits) / 1e18).toFixed(8);

    return {
      chain: chainConfig.name,
      chainId: chainConfig.chain.id,
      gasPrice: {
        baseFeeWei: baseFee.toString(),
        priorityFeeWei: priorityFee.toString(),
        totalFeeWei: totalFee.toString(),
        baseFeeGwei: parseFloat(formatGwei(baseFee)).toFixed(4),
        priorityFeeGwei: parseFloat(formatGwei(priorityFee)).toFixed(4),
        totalFeeGwei: parseFloat(formatGwei(totalFee)).toFixed(4),
      },
      estimatedCosts: {
        nativeTransfer: {
          eth: costEth(ETH_TRANSFER_GAS),
          gasUnits: ETH_TRANSFER_GAS.toString(),
          label: "Simple native token transfer",
        },
        erc20Transfer: {
          eth: costEth(ERC20_TRANSFER_GAS),
          gasUnits: ERC20_TRANSFER_GAS.toString(),
          label: "ERC-20 token transfer",
        },
        dexSwap: {
          eth: costEth(DEX_SWAP_GAS),
          gasUnits: DEX_SWAP_GAS.toString(),
          label: "DEX swap (Uniswap-style)",
        },
      },
      blockNumber: block.number?.toString(),
      explorer: chainConfig.explorer,
      latencyMs: latency,
      status: "ok",
    };
  } catch (err) {
    return {
      chain: chainConfig.name,
      chainId: chainConfig.chain.id,
      error: err.message,
      latencyMs: Date.now() - start,
      status: "error",
    };
  }
}

function buildRecommendation(validResults) {
  if (validResults.length === 0) return null;

  const cheapest = validResults.reduce((min, cur) =>
    BigInt(cur.gasPrice.totalFeeWei) < BigInt(min.gasPrice.totalFeeWei) ? cur : min
  );
  const mostExpensive = validResults.reduce((max, cur) =>
    BigInt(cur.gasPrice.totalFeeWei) > BigInt(max.gasPrice.totalFeeWei) ? cur : max
  );
  const savingsPercent =
    mostExpensive.gasPrice.totalFeeWei !== "0"
      ? (
          (1 -
            Number(BigInt(cheapest.gasPrice.totalFeeWei)) /
              Number(BigInt(mostExpensive.gasPrice.totalFeeWei))) *
          100
        ).toFixed(1)
      : "0";

  return {
    cheapestChain: cheapest.chain,
    cheapestChainId: cheapest.chainId,
    totalFeeGwei: cheapest.gasPrice.totalFeeGwei,
    baseFeeGwei: cheapest.gasPrice.baseFeeGwei,
    priorityFeeGwei: cheapest.gasPrice.priorityFeeGwei,
    estimatedSwapCostEth: cheapest.estimatedCosts.dexSwap.eth,
    vsExpensive: {
      chain: mostExpensive.chain,
      savingsPercent: `${savingsPercent}%`,
    },
    action: `Use ${cheapest.chain} — saves ${savingsPercent}% vs ${mostExpensive.chain}`,
  };
}

// ── GET /gas ──
// Tier logic:
//   ?demo=true          → Basic 4-chain preview (free)
//   Basic session token → Basic 4-chain ($0.01 / 10 calls)
//   Premium session token → Premium 6-chain ($0.02 / 10 calls)
router.get("/", async (req, res) => {
  const isDemo = req.query.demo === "true";
  const isPremium = req.sessionTier === "premium";
  const startTime = Date.now();

  // Select chain set based on tier
  const activeChains = isPremium ? premiumChains : basicChains;

  try {
    const results = await Promise.allSettled(activeChains.map((c) => getGasPrice(c)));

    const gasData = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { chain: "unknown", status: "error", error: r.reason?.message }
    );

    const validResults = gasData.filter((g) => g.status === "ok");
    const recommendation = buildRecommendation(validResults);

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      tier: isDemo ? "demo" : isPremium ? "premium" : "basic",
      gasPriceMethod: "EIP-1559 (baseFee + priorityFee from latest block)",
      totalLatencyMs: Date.now() - startTime,
      recommendation,
      chains: gasData,
      meta: {
        provider: "MGO — Multi-chain Gas Optimizer",
        protocol: "x402",
        version: "1.2.0",
        tier: isDemo ? "demo" : isPremium ? "premium" : "basic",
        chainsQueried: activeChains.length,
        chainsSucceeded: validResults.length,
        pricing: {
          basic: "$0.01 USDC / 10 calls — 4 chains (ETH, Base, Arbitrum, Optimism)",
          premium: "$0.02 USDC / 10 calls — 6 chains (+ BNB Chain, Polygon)",
        },
      },
    };

    if (isDemo) {
      response.demo_notice =
        "Free demo — Basic tier (4 chains). Pay $0.01 USDC for Basic or $0.02 USDC for Premium (6 chains).";
    }

    if (!isPremium && !isDemo) {
      response.upgrade_notice =
        "Upgrade to Premium ($0.02/10 calls) to unlock BNB Chain + Polygon comparisons.";
    }

    res.json(response);
  } catch (err) {
    console.error("[GAS ERROR]", err);
    res.status(500).json({ success: false, error: "Failed to fetch gas prices" });
  }
});

module.exports = router;
