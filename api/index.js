const express = require("express");
const { paymentMiddleware, x402ResourceServer } = require("@x402/express");
const { HTTPFacilitatorClient } = require("@x402/core/server");
const { createCdpFacilitatorConfig } = require("../lib/cdp-auth");
const { registerExactEvmScheme } = require("@x402/evm/exact/server");
const { declareDiscoveryExtension } = require("@x402/extensions/bazaar");
const gasRouter = require("../routes/gas");
const { demoSessionMiddleware, paidSessionMiddleware, TIER_PRICING } = require("../middleware/session");
const { demoRateLimit } = require("../middleware/rateLimit");
const fs = require("fs");
const path = require("path");

const app = express();
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

// Inlined discovery content (Vercel serverless fs-safe)
const SKILL_MD = `# MGO — Multi-chain Gas Optimizer

Use this skill when the agent needs to find the cheapest EVM chain for a transaction, compare gas prices across chains, or optimize transaction costs.

## When to use
- "Which chain is cheapest for gas right now?"
- "Compare gas prices across EVM chains"
- "I want to send a transaction — where should I do it?"
- "Find the cheapest chain to deploy a contract"
- "How much will this transaction cost on Base vs Ethereum?"

## Base URL
https://api.mgo.chain-ops.xyz

## Endpoints

All paid endpoints use x402 protocol on Base (USDC). No API key needed.

### GET /gas/demo — Free
Raw gas prices for 4 chains. Rate limited (10/hr per IP).

### GET /gas/basic — $0.001 USDC
4-chain gas comparison with cheapest chain recommendation and savings calculation.
Chains: Ethereum, Base, Optimism, Arbitrum

### GET /gas/premium — $0.002 USDC
Full 9-chain comparison including BNB, Polygon, Avalanche, zkSync, Hyperliquid.

## Payment (x402)
Protocol: x402
Network: Base (eip155:8453)
Token: USDC

## Links
- Dashboard: https://mgo.chain-ops.xyz
- llms.txt: https://api.mgo.chain-ops.xyz/llms.txt
- GitHub: https://github.com/dlrjsdl200-byte/x402-gas-api
`;

const WELL_KNOWN_MCP = {
  name: "MGO — Multi-chain Gas Optimizer",
  description: "Real-time gas price comparison across up to 9 EVM chains. Returns cheapest chain recommendation with savings calculations. Pay-per-call via x402 on Base.",
  version: "1.0.0",
  url: "https://api.mgo.chain-ops.xyz",
  payment: { protocol: "x402", network: "base", token: "USDC", wallet: "0xEC3cAf9281a1b5371F76ee3A3eAb895fdECCe31e" },
  tools: [
    { name: "get_gas_demo", description: "Free gas prices for 4 chains (rate limited)", endpoint: "GET /gas/demo", price: "free" },
    { name: "get_gas_basic", description: "4-chain gas comparison with cheapest recommendation", endpoint: "GET /gas/basic", price: "$0.001 USDC" },
    { name: "get_gas_premium", description: "9-chain full gas comparison", endpoint: "GET /gas/premium", price: "$0.002 USDC" }
  ],
  links: { dashboard: "https://mgo.chain-ops.xyz", docs: "https://api.mgo.chain-ops.xyz/llms.txt", github: "https://github.com/dlrjsdl200-byte/x402-gas-api" }
};

const WELL_KNOWN_AGENT_CARD = {
  name: "MGO Gas Optimizer",
  description: "x402-native API that compares real-time gas prices across up to 9 EVM chains. Built for trading agents, DeFi bots, and AI agents optimizing transaction costs.",
  url: "https://api.mgo.chain-ops.xyz",
  provider: { name: "chain-ops", url: "https://chain-ops.xyz" },
  version: "1.0.0",
  capabilities: { payment: "x402", streaming: false, discovery: true },
  skills: [{ id: "gas-comparison", name: "EVM Gas Price Comparison", description: "Compare gas prices across EVM chains and find the cheapest option", tags: ["gas", "evm", "optimization", "defi", "trading"] }],
  tags: ["gas", "evm", "x402", "defi", "optimization", "multi-chain"]
};

const WELL_KNOWN_X402 = {
  version: "1",
  endpoints: [
    { path: "/gas/basic", method: "GET", description: "4-chain gas comparison with cheapest recommendation + savings %", payment: { amount: "0.001", token: "USDC", network: "base" } },
    { path: "/gas/premium", method: "GET", description: "9-chain full gas comparison", payment: { amount: "0.002", token: "USDC", network: "base" } }
  ],
  provider: { name: "chain-ops MGO", url: "https://chain-ops.xyz", wallet: "0xEC3cAf9281a1b5371F76ee3A3eAb895fdECCe31e" }
};

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-PAYMENT, Payment-Signature");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "MGO - Multi-chain Gas Optimizer",
    version: "2.1.0",
    protocol: "x402",
    tiers: {
      basic: { price: `$${TIER_PRICING.basic.amount} USDC / 1 call`, chains: TIER_PRICING.basic.chains, description: TIER_PRICING.basic.description },
      premium: { price: `$${TIER_PRICING.premium.amount} USDC / 1 call`, chains: TIER_PRICING.premium.chains, description: TIER_PRICING.premium.description },
    },
    endpoints: {
      "/gas/basic": "Paid gas comparison (basic: 4 chains, $0.001 USDC via x402)",
      "/gas/premium": "Paid gas comparison (premium: 9 chains, $0.002 USDC via x402)",
      "/gas/demo": "Free demo (raw gas prices, 10/hr limit)",
      "/llms.txt": "AI discovery file",
      "/skill.md": "OpenClaw skill file",
      "/.well-known/mcp.json": "MCP discovery",
      "/.well-known/agent-card.json": "A2A agent card",
      "/.well-known/x402.json": "x402 discovery",
      "/health": "Server health check",
    },
    payment: {
      protocol: "x402 (HTTP 402 Payment Required)",
      currency: "USDC",
      network: "base",
    },
  });
});

app.get("/llms.txt", (req, res) => {
  const llmsPath = path.join(__dirname, "..", "llms.txt");
  if (fs.existsSync(llmsPath)) res.type("text/plain").sendFile(llmsPath);
  else res.type("text/plain").send("# MGO - Multi-chain Gas Optimizer\n");
});

// Agent discovery endpoints (inlined for Vercel serverless)
app.get("/skill.md", (req, res) => {
  res.type("text/markdown").send(SKILL_MD);
});

app.get("/.well-known/mcp.json", (req, res) => {
  res.json(WELL_KNOWN_MCP);
});

app.get("/.well-known/agent-card.json", (req, res) => {
  res.json(WELL_KNOWN_AGENT_CARD);
});

app.get("/.well-known/x402.json", (req, res) => {
  res.json(WELL_KNOWN_X402);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2.1.0" });
});

// Demo: free, rate-limited, raw gas data only
app.use("/gas/demo", demoRateLimit, demoSessionMiddleware, gasRouter);

// Paid tiers
if (WALLET_ADDRESS) {
  const facilitatorClient = new HTTPFacilitatorClient(
    createCdpFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET)
  );
  const server = new x402ResourceServer(facilitatorClient);
  registerExactEvmScheme(server);

  const chainExample = (name, gwei, usdcCost) => ({
    chain: name, chainId: 1, nativeToken: "ETH", tokenPriceUsd: 3500,
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
      tokenPrices: { type: "object", description: "Current native token prices in USD" },
      recommendation: {
        type: "object", description: "Cheapest chain recommendation with savings calculation",
        properties: {
          cheapestChain: { type: "string", description: "Name of the cheapest chain" },
          cheapestChainId: { type: "number", description: "Chain ID of the cheapest chain" },
          estimatedCostsUsdc: { type: "object", description: "USDC costs for native transfer, ERC-20, DEX swap" },
          vsExpensive: { type: "object", description: "Comparison with most expensive chain" },
          action: { type: "string", description: "Human-readable recommendation" },
        },
      },
      chains: {
        type: "array", description: "Gas data per chain",
        items: {
          type: "object",
          properties: {
            chain: { type: "string" }, chainId: { type: "number" }, nativeToken: { type: "string" },
            tokenPriceUsd: { type: "number" },
            gasPrice: { type: "object", properties: { baseFeeGwei: { type: "string" }, priorityFeeGwei: { type: "string" }, totalFeeGwei: { type: "string" } } },
            estimatedCosts: { type: "object", properties: { nativeTransfer: { type: "object" }, erc20Transfer: { type: "object" }, dexSwap: { type: "object" } } },
            status: { type: "string" },
          },
        },
      },
    },
    required: ["success", "chains", "recommendation"],
  };

  const basicExample = {
    success: true, timestamp: "2026-03-08T10:00:00.000Z", tier: "basic", totalLatencyMs: 420,
    tokenPrices: { ETH: 3500 },
    recommendation: { cheapestChain: "Base", cheapestChainId: 8453, estimatedCostsUsdc: { dexSwap: 0.001 }, vsExpensive: { chain: "Ethereum", dexSwapUsdc: 5.12, savingsPercent: "99.8%" }, action: "Use Base — saves 99.8% vs Ethereum" },
    chains: [chainExample("Ethereum", "12.3456", 5.12), chainExample("Base", "0.0100", 0.001), chainExample("Arbitrum", "0.0200", 0.002), chainExample("Optimism", "0.0150", 0.0015)],
  };

  const premiumExample = {
    ...basicExample, tier: "premium",
    chains: [...basicExample.chains, chainExample("BNB Chain", "1.0000", 0.05), chainExample("Polygon", "30.0000", 0.003), chainExample("Avalanche", "25.0000", 0.12), chainExample("zkSync Era", "0.0250", 0.002), chainExample("Hyperliquid", "0.5000", 0.01)],
  };

  app.use("/gas/basic",
    paymentMiddleware({ "GET /": { accepts: { scheme: "exact", price: "$0.001", network: "eip155:8453", payTo: WALLET_ADDRESS }, description: "MGO Basic — 4-chain gas comparison with recommendations", extensions: { ...declareDiscoveryExtension({ output: { example: basicExample, schema: outputSchema } }) } } }, server),
    paidSessionMiddleware("basic"), gasRouter
  );

  app.use("/gas/premium",
    paymentMiddleware({ "GET /": { accepts: { scheme: "exact", price: "$0.002", network: "eip155:8453", payTo: WALLET_ADDRESS }, description: "MGO Premium — 9-chain gas comparison with full features", extensions: { ...declareDiscoveryExtension({ output: { example: premiumExample, schema: { ...outputSchema } } }) } } }, server),
    paidSessionMiddleware("premium"), gasRouter
  );
} else {
  app.use("/gas/basic", (req, res) => res.status(503).json({ error: "Payment not configured. WALLET_ADDRESS missing." }));
  app.use("/gas/premium", (req, res) => res.status(503).json({ error: "Payment not configured. WALLET_ADDRESS missing." }));
}

app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
