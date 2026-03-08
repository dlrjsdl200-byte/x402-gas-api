require("dotenv").config();
const express = require("express");
const { paymentMiddleware } = require("x402-express");
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-PAYMENT");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ name: "MGO - Multi-chain Gas Optimizer", version: "2.0.0", protocol: "x402" });
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
