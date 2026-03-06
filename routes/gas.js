const { Router } = require("express");
const { createPublicClient, http, formatGwei } = require("viem");
const { mainnet, base, arbitrum, optimism } = require("viem/chains");

const router = Router();

// ── 체인별 퍼블릭 RPC 클라이언트 ──
const chains = [
  {
    name: "Ethereum",
    chain: mainnet,
    rpc: process.env.RPC_ETHEREUM || "https://eth.llamarpc.com",
    explorer: "https://etherscan.io",
    color: "#627EEA"
  },
  {
    name: "Base",
    chain: base,
    rpc: process.env.RPC_BASE || "https://mainnet.base.org",
    explorer: "https://basescan.org",
    color: "#0052FF"
  },
  {
    name: "Arbitrum",
    chain: arbitrum,
    rpc: process.env.RPC_ARBITRUM || "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io",
    color: "#28A0F0"
  },
  {
    name: "Optimism",
    chain: optimism,
    rpc: process.env.RPC_OPTIMISM || "https://mainnet.optimism.io",
    explorer: "https://optimistic.etherscan.io",
    color: "#FF0420"
  }
];

function createClient(chainConfig) {
  return createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpc),
  });
}

// ── 단일 체인 가스비 조회 ──
async function getGasPrice(chainConfig) {
  const start = Date.now();
  try {
    const client = createClient(chainConfig);
    const gasPrice = await client.getGasPrice();
    const latency = Date.now() - start;

    // 표준 21,000 gas 기준 전송 비용 (ETH 단위)
    const transferCostWei = gasPrice * 21000n;
    const transferCostEth = Number(transferCostWei) / 1e18;

    return {
      chain: chainConfig.name,
      chainId: chainConfig.chain.id,
      gasPrice: {
        wei: gasPrice.toString(),
        gwei: parseFloat(formatGwei(gasPrice)).toFixed(4),
      },
      estimatedTransferCost: {
        eth: transferCostEth.toFixed(8),
        gas21k: "Standard ETH transfer (21,000 gas)"
      },
      explorer: chainConfig.explorer,
      latencyMs: latency,
      status: "ok"
    };
  } catch (err) {
    return {
      chain: chainConfig.name,
      chainId: chainConfig.chain.id,
      error: err.message,
      latencyMs: Date.now() - start,
      status: "error"
    };
  }
}

// ── GET /gas ──
router.get("/", async (req, res) => {
  const isDemo = req.query.demo === "true";
  const startTime = Date.now();

  try {
    // 모든 체인 동시 조회
    const results = await Promise.allSettled(
      chains.map(c => getGasPrice(c))
    );

    const gasData = results.map(r =>
      r.status === "fulfilled" ? r.value : { chain: "unknown", status: "error", error: r.reason?.message }
    );

    // 성공한 결과만 필터링
    const validResults = gasData.filter(g => g.status === "ok");

    // 최저가 체인 찾기
    let recommendation = null;
    if (validResults.length > 0) {
      const cheapest = validResults.reduce((min, cur) =>
        BigInt(cur.gasPrice.wei) < BigInt(min.gasPrice.wei) ? cur : min
      );

      const mostExpensive = validResults.reduce((max, cur) =>
        BigInt(cur.gasPrice.wei) > BigInt(max.gasPrice.wei) ? cur : max
      );

      const savingsPercent = mostExpensive.gasPrice.wei !== "0"
        ? ((1 - Number(BigInt(cheapest.gasPrice.wei)) / Number(BigInt(mostExpensive.gasPrice.wei))) * 100).toFixed(1)
        : "0";

      recommendation = {
        cheapestChain: cheapest.chain,
        cheapestChainId: cheapest.chainId,
        gasPriceGwei: cheapest.gasPrice.gwei,
        vsExpensive: {
          chain: mostExpensive.chain,
          savingsPercent: `${savingsPercent}%`
        },
        action: `Use ${cheapest.chain} for lowest gas cost`
      };
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      mode: isDemo ? "demo" : "paid",
      totalLatencyMs: Date.now() - startTime,
      recommendation,
      chains: gasData,
      meta: {
        provider: "MGO — Multi-chain Gas Optimizer",
        protocol: "x402",
        version: "1.0.0",
        chainsQueried: chains.length,
        chainsSucceeded: validResults.length
      }
    };

    // 데모 모드에는 워터마크
    if (isDemo) {
      response.demo_notice = "This is a free demo. Pay $0.01 USDC for 10 premium calls with lower latency.";
    }

    res.json(response);
  } catch (err) {
    console.error("[GAS ERROR]", err);
    res.status(500).json({ success: false, error: "Failed to fetch gas prices" });
  }
});

module.exports = router;
