const express = require("express");
const crypto = require("crypto");
const gasRouter = require("../routes/gas");
const { sessionMiddleware, createSession, TIER_PRICING } = require("../middleware/session");
const fs = require("fs");
const path = require("path");

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "MGO - Multi-chain Gas Optimizer",
    version: "1.2.0",
    protocol: "x402",
    tiers: {
      basic: {
        price: `$${TIER_PRICING.basic.amount} USDC / 10 calls`,
        chains: TIER_PRICING.basic.chains,
        description: TIER_PRICING.basic.description,
      },
      premium: {
        price: `$${TIER_PRICING.premium.amount} USDC / 10 calls`,
        chains: TIER_PRICING.premium.chains,
        description: TIER_PRICING.premium.description,
      },
    },
    endpoints: {
      "/gas": "Gas comparison — tier determined by session token",
      "/gas?demo=true": "Free Basic tier preview (4 chains)",
      "/session": "POST - Get session token after payment",
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
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "1.2.0" });
});

// POST /session — create session token after payment
// Body: { txHash: '0x...', tier: 'basic' | 'premium' }
app.post("/session", (req, res) => {
  const { txHash, tier = "basic" } = req.body;
  if (!txHash) return res.status(400).json({ error: "txHash required" });

  const validTiers = ["basic", "premium"];
  if (!validTiers.includes(tier)) {
    return res.status(400).json({ error: `Invalid tier. Must be one of: ${validTiers.join(", ")}` });
  }

  const token = createSession(tier);
  const pricing = TIER_PRICING[tier];

  res.json({
    success: true,
    sessionToken: token,
    tier,
    calls: 10,
    chains: pricing.chains,
    description: pricing.description,
    message: `Include X-Session-Token header in your next 10 requests (${tier} tier)`,
  });
});

app.use("/gas", sessionMiddleware, gasRouter);

app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
