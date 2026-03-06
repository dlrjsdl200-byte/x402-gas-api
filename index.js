require("dotenv").config();
const express = require("express");
const gasRouter = require("./routes/gas");
const { sessionMiddleware, createSession } = require("./middleware/session");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ name: "MGO - Multi-chain Gas Optimizer", version: "1.0.0", protocol: "x402" });
});

app.get("/llms.txt", (req, res) => {
  const llmsPath = path.join(__dirname, "llms.txt");
  if (fs.existsSync(llmsPath)) res.type("text/plain").sendFile(llmsPath);
  else res.type("text/plain").send("# MGO - Multi-chain Gas Optimizer\n");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`\n🔥 MGO Gas API running on http://localhost:${PORT}`);
  console.log(`📡 Demo:   http://localhost:${PORT}/gas?demo=true`);
  console.log(`🤖 llms:   http://localhost:${PORT}/llms.txt`);
  console.log(`💚 Health: http://localhost:${PORT}/health\n`);
});
