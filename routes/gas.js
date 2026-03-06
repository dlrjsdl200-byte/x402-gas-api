const { Router } = require("express");
const { createPublicClient, http, formatGwei } = require("viem");
const { mainnet, base, arbitrum, optimism } = require("viem/chains");

const router = Router();

// ── Chain configs ──
const chains = [
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

function createClient(chainConfig) {
  return createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpc),
  });
}

// ── EIP-1559 gas price fetch ──
// Old method: client.getGasPrice() → legacy average, often inaccurate
// New method: baseFeePerGas from latest block + estimateMaxPriorityFeePerGas
// totalFee = baseFee + priorityFee → actual cost paid by user
async function getGasPrice(chainConfig) {
  const start = Date.now();
  try {
    const client = createClient(chainConfig);

    // Fetch latest block and priority fee estimate in parallel
    const [block, priorityFee] = await Promise.all([
      client.getBlock({ blockTag: "latest" }),
      client.estimateMaxPriorityFeePerGas().catch(() => 100000000n), // fallback: 0.1 gwei
    ]);

    // baseFeePerGas: base fee burned per gas unit (set by the network per block)
    // priorityFee: tip paid to the validator to prioritize inclusion
    const baseFee = block.baseFeePerGas ?? 0n;
    const totalFee = baseFee + priorityFee;

    const latency = Date.now() - start;

    // Common gas usage estimates for different operation types
    const ETH_TRANSFER_GAS = 21000n;    // simple ETH send
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
        ethTransfer: {
          eth: costEth(ETH_TRANSFER_GAS),
          gasUnits: ETH_TRANSFER_GAS.toString(),
          label: "Simple ETH transfer",
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

// ── GET /gas ──
router.get("/", async (req, res) => {
  const isDemo = req.query.demo === "true";
  const startTime = Date.now();

  try {
    const results = await Promise.allSettled(chains.map((c) => getGasPrice(c)));

    const gasData = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { chain: "unknown", status: "error", error: r.reason?.message }
    );

    const validResults = gasData.filter((g) => g.status === "ok");

    let recommendation = null;
    if (validResults.length > 0) {
      // Compare by totalFeeWei (baseFee + priorityFee) — accurate EIP-1559 basis
      const cheapest = validResults.reduce((min, cur) =>
        BigInt(cur.gasPrice.totalFeeWei) < BigInt(min.gasPrice.totalFeeWei)
          ? cur
          : min
      );

      const mostExpensive = validResults.reduce((max, cur) =>
        BigInt(cur.gasPrice.totalFeeWei) > BigInt(max.gasPrice.totalFeeWei)
          ? cur
          : max
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

      recommendation = {
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

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      mode: isDemo ? "demo" : "paid",
      gasPriceMethod: "EIP-1559 (baseFee + priorityFee from latest block)",
      totalLatencyMs: Date.now() - startTime,
      recommendation,
      chains: gasData,
      meta: {
        provider: "MGO — Multi-chain Gas Optimizer",
        protocol: "x402",
        version: "1.1.0",
        chainsQueried: chains.length,
        chainsSucceeded: validResults.length,
      },
    };

    if (isDemo) {
      response.demo_notice =
        "Free demo mode. Pay $0.01 USDC via x402 for 10 calls with priority RPC access.";
    }

    res.json(response);
  } catch (err) {
    console.error("[GAS ERROR]", err);
    res.status(500).json({ success: false, error: "Failed to fetch gas prices" });
  }
});

module.exports = router;
