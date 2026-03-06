const express = require("express");
const crypto = require("crypto");
const gasRouter = require("../routes/gas");
const { sessionMiddleware, createSession } = require("../middleware/session");
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
    version: "1.0.0",
    protocol: "x402",
    endpoints: {
      "/gas": "4-chain gas comparison - $0.01 per 10 calls",
      "/gas?demo=true": "Free demo mode",
      "/session": "POST - Get session token after payment",
      "/llms.txt": "AI discovery file",
      "/health": "Server health check"
    }
  });
});

app.get("/llms.txt", (req, res) => {
  const llmsPath = path.join(__dirname, "..", "llms.txt");
  if (fs.existsSync(llmsPath)) res.type("text/plain").sendFile(llmsPath);
  else res.type("text/plain").send("# MGO - Multi-chain Gas Optimizer\n");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/session", (req, res) => {
  const { txHash } = req.body;
  if (!txHash) return res.status(400).json({ error: "txHash required" });
  const token = createSession();
  res.json({
    success: true,
    sessionToken: token,
    calls: 10,
    message: "Include X-Session-Token header in next 10 requests"
  });
});

app.use("/gas", sessionMiddleware, gasRouter);

app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
