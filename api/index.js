/**
 * Vercel Serverless Function Entry Point
 * Vercel은 /api/index.js를 자동으로 서버리스 함수로 인식
 */

const express = require("express");
const gasRouter = require("../routes/gas");
const { sessionMiddleware } = require("../middleware/session");
const fs = require("fs");
const path = require("path");

const app = express();

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

// 루트
app.get("/", (req, res) => {
  res.json({
    name: "MGO — Multi-chain Gas Optimizer",
    version: "1.0.0",
    protocol: "x402",
    endpoints: {
      "/gas": "4-chain gas comparison — $0.01 per 10 calls",
      "/gas?demo=true": "Free demo mode",
      "/llms.txt": "AI discovery file",
    },
  });
});

// llms.txt
app.get("/llms.txt", (req, res) => {
  const llmsPath = path.join(__dirname, "..", "llms.txt");
  if (fs.existsSync(llmsPath)) {
    res.type("text/plain").sendFile(llmsPath);
  } else {
    res.type("text/plain").send("# MGO - Multi-chain Gas Optimizer\n");
  }
});

// Health
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Gas API
app.use("/gas", sessionMiddleware, gasRouter);

// 에러 핸들링
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
