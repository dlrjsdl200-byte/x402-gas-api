const express = require("express");
const { paymentMiddleware } = require("x402-express");
const gasRouter = require("../routes/gas");
const { demoSessionMiddleware, paidSessionMiddleware, TIER_PRICING } = require("../middleware/session");
const { demoRateLimit } = require("../middleware/rateLimit");
const fs = require("fs");
const path = require("path");

const app = express();

const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-PAYMENT");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "MGO - Multi-chain Gas Optimizer",
    version: "2.0.0",
    protocol: "x402",
    tiers: {
      basic: {
        price: `$${TIER_PRICING.basic.amount} USDC / 1 call`,
        chains: TIER_PRICING.basic.chains,
        description: TIER_PRICING.basic.description,
      },
      premium: {
        price: `$${TIER_PRICING.premium.amount} USDC / 1 call`,
        chains: TIER_PRICING.premium.chains,
        description: TIER_PRICING.premium.description,
      },
    },
    endpoints: {
      "/gas/basic": "Paid gas comparison (basic: 4 chains, $0.001 USDC via x402)",
      "/gas/premium": "Paid gas comparison (premium: 9 chains, $0.002 USDC via x402)",
      "/gas/demo": "Free demo (raw gas prices, 10/hr limit)",
      "/llms.txt": "AI discovery file",
      "/health": "Server health check",
    },
    payment: {
      protocol: "x402 (HTTP 402 Payment Required)",
      currency: "USDC",
      network: "base",
      how: "Send GET request → receive 402 with payment requirements → sign with x402-axios/x402-fetch → resend with X-PAYMENT header",
    },
  });
});

app.get("/llms.txt", (req, res) => {
  const llmsPath = path.join(__dirname, "..", "llms.txt");
  if (fs.existsSync(llmsPath)) res.type("text/plain").sendFile(llmsPath);
  else res.type("text/plain").send("# MGO - Multi-chain Gas Optimizer\n");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2.0.0" });
});

// Demo: free, rate-limited, raw gas data only
app.use("/gas/demo", demoRateLimit, demoSessionMiddleware, gasRouter);

// Paid tiers: x402 payment verification via facilitator
if (WALLET_ADDRESS) {
  app.use("/gas/basic",
    paymentMiddleware(WALLET_ADDRESS, { "/": { price: "$0.001", network: "base", config: { description: "MGO Basic — 4-chain gas comparison with recommendations" } } }),
    paidSessionMiddleware("basic"),
    gasRouter
  );

  app.use("/gas/premium",
    paymentMiddleware(WALLET_ADDRESS, { "/": { price: "$0.002", network: "base", config: { description: "MGO Premium — 9-chain gas comparison with full features" } } }),
    paidSessionMiddleware("premium"),
    gasRouter
  );
} else {
  // Fallback: no wallet configured, return 503 for paid tiers
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

module.exports = app;
