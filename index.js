require("dotenv").config();
const express = require("express");
const { paymentMiddleware, x402ResourceServer } = require("@x402/express");
const { HTTPFacilitatorClient } = require("@x402/core/server");
const { registerExactEvmScheme } = require("@x402/evm/exact/server");
const { declareDiscoveryExtension } = require("@x402/extensions/bazaar");
const gasRouter = require("./routes/gas");
const { demoSessionMiddleware, paidSessionMiddleware, TIER_PRICING } = require("./middleware/session");
const { demoRateLimit } = require("./middleware/rateLimit");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-PAYMENT, Payment-Signature");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ name: "MGO - Multi-chain Gas Optimizer", version: "2.1.0", protocol: "x402" });
});

app.get("/llms.txt", (req, res) => {
  const llmsPath = path.join(__dirname, "llms.txt");
  if (fs.existsSync(llmsPath)) res.type("text/plain").sendFile(llmsPath);
  else res.type("text/plain").send("# MGO - Multi-chain Gas Optimizer\n");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Demo: free, rate-limited, raw gas data only
app.use("/gas/demo", demoRateLimit, demoSessionMiddleware, gasRouter);

// Paid tiers: x402 payment verification via facilitator + Bazaar discoverable
if (WALLET_ADDRESS) {
  const facilitatorClient = new HTTPFacilitatorClient({ url: "https://facilitator.xpay.sh" });
  const server = new x402ResourceServer(facilitatorClient);
  registerExactEvmScheme(server);

  const chainExample = (name, gwei, usdcCost) => ({
    chain: name,
    chainId: 1,
    nativeToken: "ETH",
    tokenPriceUsd: 3500,
    gasPrice: { baseFeeGwei: gwei, priorityFeeGwei: "0.0010", totalFeeGwei: gwei },
    estimatedCosts: {
      nativeTransfer: { native: "0.00004200", usdc: 0.147, gasUnits: "21000", label: "Simple native token transfer" },
      erc20Transfer: { native: "0.00013000", usdc: 0.455, gasUnits: "65000", label: "ERC-20 token transfer" },
      dexSwap: { native: "0.00030000", usdc: usdcCost, gasUnits: "150000", label: "DEX swap (Uniswap-style)" },
    },
    status: "ok",
  });

  const outputSchema = {
    properties: {
      success: { type: "boolean", description: "Whether the request succeeded" },
      timestamp: { type: "string", description: "ISO 8601 timestamp" },
      tier: { type: "string", description: "demo | basic | premium" },
      totalLatencyMs: { type: "number", description: "Total API response time in ms" },
      tokenPrices: { type: "object", description: "Current native token prices in USD (e.g. ETH, BNB)" },
      recommendation: {
        type: "object",
        description: "Cheapest chain recommendation with savings calculation",
        properties: {
          cheapestChain: { type: "string", description: "Name of the cheapest chain" },
          cheapestChainId: { type: "number", description: "Chain ID of the cheapest chain" },
          estimatedCostsUsdc: { type: "object", description: "USDC costs for native transfer, ERC-20, DEX swap" },
          vsExpensive: { type: "object", description: "Comparison with most expensive chain" },
          action: { type: "string", description: "Human-readable recommendation" },
        },
      },
      chains: {
        type: "array",
        description: "Gas data per chain",
        items: {
          type: "object",
          properties: {
            chain: { type: "string", description: "Chain name" },
            chainId: { type: "number", description: "EVM chain ID" },
            nativeToken: { type: "string", description: "Native token symbol" },
            tokenPriceUsd: { type: "number", description: "Native token price in USD" },
            gasPrice: {
              type: "object",
              properties: {
                baseFeeGwei: { type: "string" },
                priorityFeeGwei: { type: "string" },
                totalFeeGwei: { type: "string" },
              },
            },
            estimatedCosts: {
              type: "object",
              description: "Cost estimates for common transaction types",
              properties: {
                nativeTransfer: { type: "object" },
                erc20Transfer: { type: "object" },
                dexSwap: { type: "object" },
              },
            },
            status: { type: "string", description: "ok | error" },
          },
        },
      },
    },
    required: ["success", "chains", "recommendation"],
  };

  const basicExample = {
    success: true,
    timestamp: "2026-03-08T10:00:00.000Z",
    tier: "basic",
    totalLatencyMs: 420,
    tokenPrices: { ETH: 3500 },
    recommendation: { cheapestChain: "Base", cheapestChainId: 8453, estimatedCostsUsdc: { dexSwap: 0.001 }, vsExpensive: { chain: "Ethereum", dexSwapUsdc: 5.12, savingsPercent: "99.8%" }, action: "Use Base — saves 99.8% vs Ethereum" },
    chains: [
      chainExample("Ethereum", "12.3456", 5.12),
      chainExample("Base", "0.0100", 0.001),
      chainExample("Arbitrum", "0.0200", 0.002),
      chainExample("Optimism", "0.0150", 0.0015),
    ],
  };

  const premiumExample = {
    ...basicExample,
    tier: "premium",
    chains: [
      ...basicExample.chains,
      chainExample("BNB Chain", "1.0000", 0.05),
      chainExample("Polygon", "30.0000", 0.003),
      chainExample("Avalanche", "25.0000", 0.12),
      chainExample("zkSync Era", "0.0250", 0.002),
      chainExample("Hyperliquid", "0.5000", 0.01),
    ],
  };

  const basicRoutes = {
    "GET /": {
      accepts: { scheme: "exact", price: "$0.001", network: "eip155:8453", payTo: WALLET_ADDRESS },
      description: "MGO Basic — 4-chain gas comparison with recommendations",
      extensions: {
        ...declareDiscoveryExtension({
          output: { example: basicExample, schema: outputSchema },
        }),
      },
    },
  };

  const premiumRoutes = {
    "GET /": {
      accepts: { scheme: "exact", price: "$0.002", network: "eip155:8453", payTo: WALLET_ADDRESS },
      description: "MGO Premium — 9-chain gas comparison with full features",
      extensions: {
        ...declareDiscoveryExtension({
          output: {
            example: premiumExample,
            schema: { ...outputSchema, properties: { ...outputSchema.properties, chains: { ...outputSchema.properties.chains, description: "Gas data for 9 chains (ETH, Base, Arbitrum, Optimism, BNB, Polygon, Avalanche, zkSync, Hyperliquid)" } } },
          },
        }),
      },
    },
  };

  app.use("/gas/basic",
    paymentMiddleware(basicRoutes, server),
    paidSessionMiddleware("basic"),
    gasRouter
  );

  app.use("/gas/premium",
    paymentMiddleware(premiumRoutes, server),
    paidSessionMiddleware("premium"),
    gasRouter
  );
} else {
  console.warn("WARN: WALLET_ADDRESS not set. Paid tiers will return 503.");
  app.use("/gas/basic", (req, res) => {
    res.status(503).json({ error: "Payment not configured. WALLET_ADDRESS environment variable is missing." });
  });
  app.use("/gas/premium", (req, res) => {
    res.status(503).json({ error: "Payment not configured. WALLET_ADDRESS environment variable is missing." });
  });
}

app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`\nMGO Gas API running on http://localhost:${PORT}`);
  console.log(`Demo:    http://localhost:${PORT}/gas/demo`);
  console.log(`Basic:   http://localhost:${PORT}/gas/basic`);
  console.log(`Premium: http://localhost:${PORT}/gas/premium`);
  console.log(`llms:    http://localhost:${PORT}/llms.txt`);
  console.log(`Health:  http://localhost:${PORT}/health\n`);
});
