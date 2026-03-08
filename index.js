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

  const gasOutputExample = {
    success: true,
    recommendation: { cheapestChain: "Base", savingsPercent: "99.8%", action: "Use Base — saves 99.8% vs Ethereum" },
    chains: [
      { chain: "Ethereum", gasPrice: { totalFeeGwei: "12.3456" }, estimatedCosts: { dexSwap: { usdc: 5.12 } } },
      { chain: "Base", gasPrice: { totalFeeGwei: "0.0100" }, estimatedCosts: { dexSwap: { usdc: 0.001 } } },
    ],
  };

  const basicRoutes = {
    "GET /": {
      accepts: { scheme: "exact", price: "$0.001", network: "eip155:8453", payTo: WALLET_ADDRESS },
      description: "MGO Basic — 4-chain gas comparison with recommendations",
      extensions: {
        ...declareDiscoveryExtension({
          output: {
            example: gasOutputExample,
            schema: {
              properties: {
                success: { type: "boolean" },
                recommendation: { type: "object", description: "Cheapest chain recommendation with savings %" },
                chains: { type: "array", description: "Gas data for 4 chains (ETH, Base, Arbitrum, Optimism)" },
              },
            },
          },
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
            example: { ...gasOutputExample, chains: [...gasOutputExample.chains, { chain: "BNB Chain" }, { chain: "Polygon" }, { chain: "Avalanche" }, { chain: "zkSync Era" }, { chain: "Hyperliquid" }] },
            schema: {
              properties: {
                success: { type: "boolean" },
                recommendation: { type: "object", description: "Cheapest chain recommendation with savings %" },
                chains: { type: "array", description: "Gas data for 9 chains (+ BNB, Polygon, Avalanche, zkSync, Hyperliquid)" },
              },
            },
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
