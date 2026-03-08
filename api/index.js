const express = require("express");
const gasRouter = require("../routes/gas");
const { sessionMiddleware, TIER_PRICING } = require("../middleware/session");
const { demoRateLimit } = require("../middleware/rateLimit");
const fs = require("fs");
const path = require("path");

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "MGO - Multi-chain Gas Optimizer",
    version: "1.3.0",
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
      "/gas?txHash=0x...&tier=basic": "Paid gas comparison (basic: 4 chains)",
      "/gas?txHash=0x...&tier=premium": "Paid gas comparison (premium: 9 chains)",
      "/gas?demo=true": "Free Basic tier preview (4 chains)",
      "/llms.txt": "AI discovery file",
      "/health": "Server health check",
    },
  });
});

app.get("/llms.txt", (req, res) => {
  const llmsPath = path.join(__dirname, "..", "llms.txt");
  if (fs.existsSync(llmsPath)) res.type("text/plain").sendFile(llmsPath);
  else res.type("text/plain").send("# MGO - Multi-chain Gas Optimizer\n");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "1.3.0" });
});

app.use("/gas", demoRateLimit, sessionMiddleware, gasRouter);

app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
