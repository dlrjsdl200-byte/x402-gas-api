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
  payment: { protocol: "x402", network: "base", token: "USDC", wallet: "0x665bab4c46a6ae3f755e71793e5685bc6c47dd7a" },
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

const WELL_KNOWN_X402_DISCOVERY = {
  version: 1,
  resources: [
    "https://api.mgo.chain-ops.xyz/gas/basic",
    "https://api.mgo.chain-ops.xyz/gas/premium"
  ],
  ownershipProofs: ["0x665bab4c46a6ae3f755e71793e5685bc6c47dd7a"]
};

const WELL_KNOWN_X402_LEGACY = {
  version: "1",
  endpoints: [
    { path: "/gas/basic", method: "GET", description: "4-chain gas comparison with cheapest recommendation + savings %", payment: { amount: "0.001", token: "USDC", network: "base" } },
    { path: "/gas/premium", method: "GET", description: "9-chain full gas comparison", payment: { amount: "0.002", token: "USDC", network: "base" } }
  ],
  provider: { name: "chain-ops MGO", url: "https://chain-ops.xyz", wallet: "0x665bab4c46a6ae3f755e71793e5685bc6c47dd7a" }
};

// ─── MCP tool definitions ───────────────────────────────────────────────────
const MCP_TOOLS = [
  {
    name: "get_gas_demo",
    description: "Get free real-time gas prices for 4 major EVM chains (Ethereum, Base, Arbitrum, Optimism). Rate limited 10/hr.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_cheapest_chain",
    description: "Get a direct recommendation for the cheapest EVM chain right now with savings %. Free, rate limited.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_gas_basic",
    description: "4-chain EVM gas comparison with cheapest recommendation. Chains: Ethereum, Base, Arbitrum, Optimism. Cost: $0.001 USDC via x402 on Base.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_gas_premium",
    description: "Full 9-chain EVM gas comparison. Chains: +BNB, Polygon, Avalanche, zkSync, Hyperliquid. Cost: $0.002 USDC via x402 on Base.",
    inputSchema: { type: "object", properties: {}, required: [] }
  }
];

function formatGasData(data) {
  if (!data || !data.chains) return JSON.stringify(data, null, 2);
  const lines = [];
  if (data.recommendation) {
    const r = data.recommendation;
    lines.push(`🏆 CHEAPEST: ${r.cheapestChain}`);
    lines.push(`   DEX swap: $${r.estimatedCostsUsdc?.dexSwap} USDC`);
    if (r.vsExpensive) lines.push(`   vs ${r.vsExpensive.chain}: saves ${r.vsExpensive.savingsPercent}`);
    if (r.action) lines.push(`   → ${r.action}`);
    lines.push("");
  }
  lines.push(`⛽ GAS PRICES (${(data.tier || "demo").toUpperCase()}):`);
  const sorted = [...data.chains].sort(
    (a, b) => parseFloat(a.gasPrice?.baseFeeGwei || "999") - parseFloat(b.gasPrice?.baseFeeGwei || "999")
  );
  for (const c of sorted) {
    const gwei = c.gasPrice?.baseFeeGwei || "?";
    const cost = c.estimatedCosts?.dexSwap?.usdc;
    lines.push(`   ${c.chain.padEnd(14)} ${String(gwei).padStart(10)} gwei` + (cost !== undefined ? `  |  DEX: $${cost}` : ""));
  }
  lines.push("");
  lines.push(`Updated: ${data.timestamp} (${data.totalLatencyMs}ms)`);
  return lines.join("\n");
}

async function callMcpTool(toolName) {
  const MGO = "https://api.mgo.chain-ops.xyz";
  if (toolName === "get_gas_demo" || toolName === "get_cheapest_chain") {
    const res = await fetch(`${MGO}/gas/demo`);
    if (!res.ok) throw new Error(`Gas demo API error: ${res.status}`);
    const data = await res.json();
    if (toolName === "get_cheapest_chain" && data.chains?.length) {
      const sorted = [...data.chains].sort(
        (a, b) => parseFloat(a.gasPrice?.baseFeeGwei || "999") - parseFloat(b.gasPrice?.baseFeeGwei || "999")
      );
      const cheap = sorted[0], exp = sorted[sorted.length - 1];
      const cc = cheap.estimatedCosts?.dexSwap?.usdc || 0;
      const ec = exp.estimatedCosts?.dexSwap?.usdc || 0;
      const savings = ec > 0 ? ((1 - cc / ec) * 100).toFixed(1) : "99.8";
      return `🏆 Cheapest EVM chain: ${cheap.chain}\n   ${cheap.gasPrice?.baseFeeGwei} gwei  |  DEX swap $${cc} USDC\n\n   vs ${exp.chain}: $${ec} USDC  →  saves ${savings}%\n\n   For all 9 chains: use get_gas_premium ($0.002 USDC)`;
    }
    return formatGasData(data);
  }
  const endpoint = toolName === "get_gas_basic" ? "/gas/basic" : "/gas/premium";
  const price = toolName === "get_gas_basic" ? "$0.001" : "$0.002";
  const res = await fetch(`${MGO}${endpoint}`);
  if (res.status === 402) {
    const info = await res.json().catch(() => ({}));
    return JSON.stringify({
      _requires_payment: true,
      price: `${price} USDC`,
      network: "Base (eip155:8453)",
      token: "USDC",
      payment_challenge: info,
      message: `Payment required: ${price} USDC on Base. This is an x402 pay-per-call endpoint.`
    }, null, 2);
  }
  if (!res.ok) throw new Error(`MGO API error: ${res.status}`);
  return formatGasData(await res.json());
}

// ─── CORS & body parsing ────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-PAYMENT, Payment-Signature, mcp-session-id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

// ─── Smithery MCP Streamable HTTP endpoint ──────────────────────────────────
// Spec: https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/
app.post("/mcp", async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};

  // Set SSE headers for streaming (Smithery expects this)
  res.setHeader("Content-Type", "application/json");

  try {
    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "mgo-gas-optimizer", version: "1.0.0" }
        }
      });
    }

    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0", id,
        result: { tools: MCP_TOOLS }
      });
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      if (!MCP_TOOLS.find(t => t.name === toolName)) {
        return res.json({
          jsonrpc: "2.0", id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` }
        });
      }
      const text = await callMcpTool(toolName);
      return res.json({
        jsonrpc: "2.0", id,
        result: { content: [{ type: "text", text }] }
      });
    }

    // notifications/initialized — no response needed
    if (method === "notifications/initialized") {
      return res.status(204).end();
    }

    return res.json({
      jsonrpc: "2.0", id,
      error: { code: -32601, message: `Method not found: ${method}` }
    });

  } catch (err) {
    return res.json({
      jsonrpc: "2.0", id,
      error: { code: -32603, message: err.message || "Internal error" }
    });
  }
});

// GET /mcp — Smithery discovery ping
app.get("/mcp", (req, res) => {
  res.json({
    name: "mgo-gas-optimizer",
    version: "1.0.0",
    description: "Compare gas prices across up to 9 EVM chains. Pay-per-call via x402 on Base.",
    tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description })),
    transport: "http",
    endpoint: "https://api.mgo.chain-ops.xyz/mcp"
  });
});

// ─── Static routes ──────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    name: "MGO - Multi-chain Gas Optimizer",
    version: "2.2.0",
    protocol: "x402",
    tiers: {
      basic: { price: `$${TIER_PRICING.basic.amount} USDC / 1 call`, chains: TIER_PRICING.basic.chains, description: TIER_PRICING.basic.description },
      premium: { price: `$${TIER_PRICING.premium.amount} USDC / 1 call`, chains: TIER_PRICING.premium.chains, description: TIER_PRICING.premium.description },
    },
    endpoints: {
      "/gas/basic": "Paid gas comparison (4 chains, $0.001 USDC via x402)",
      "/gas/premium": "Paid gas comparison (9 chains, $0.002 USDC via x402)",
      "/gas/demo": "Free demo (raw gas prices, 10/hr limit)",
      "/mcp": "Smithery MCP Streamable HTTP endpoint",
      "/llms.txt": "AI discovery file",
      "/skill.md": "OpenClaw skill file",
      "/.well-known/x402": "x402scan discovery",
      "/.well-known/x402.json": "x402 discovery (legacy)",
      "/.well-known/mcp.json": "MCP discovery JSON",
      "/.well-known/agent-card.json": "A2A agent card",
      "/health": "Server health check",
    },
    payment: { protocol: "x402 (HTTP 402 Payment Required)", currency: "USDC", network: "base" },
  });
});

app.get("/llms.txt", (req, res) => {
  const llmsPath = path.join(__dirname, "..", "llms.txt");
  if (fs.existsSync(llmsPath)) res.type("text/plain").sendFile(llmsPath);
  else res.type("text/plain").send("# MGO - Multi-chain Gas Optimizer\n");
});

app.get("/skill.md", (req, res) => { res.type("text/markdown").send(SKILL_MD); });
app.get("/.well-known/mcp.json", (req, res) => { res.json(WELL_KNOWN_MCP); });
app.get("/.well-known/agent-card.json", (req, res) => { res.json(WELL_KNOWN_AGENT_CARD); });
app.get("/.well-known/x402", (req, res) => { res.json(WELL_KNOWN_X402_DISCOVERY); });
app.get("/.well-known/x402.json", (req, res) => { res.json(WELL_KNOWN_X402_LEGACY); });
app.get("/health", (req, res) => { res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2.2.0" }); });

// ─── Gas routes ──────────────────────────────────────────────────────────────
app.use("/gas/demo", demoRateLimit, demoSessionMiddleware, gasRouter);

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
      success: { type: "boolean" }, timestamp: { type: "string" }, tier: { type: "string" },
      totalLatencyMs: { type: "number" }, tokenPrices: { type: "object" },
      recommendation: { type: "object", properties: { cheapestChain: { type: "string" }, cheapestChainId: { type: "number" }, estimatedCostsUsdc: { type: "object" }, vsExpensive: { type: "object" }, action: { type: "string" } } },
      chains: { type: "array", items: { type: "object", properties: { chain: { type: "string" }, chainId: { type: "number" }, nativeToken: { type: "string" }, tokenPriceUsd: { type: "number" }, gasPrice: { type: "object" }, estimatedCosts: { type: "object" }, status: { type: "string" } } } },
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
    paymentMiddleware({ "GET /": { accepts: { scheme: "exact", price: "$0.001", network: "eip155:8453", payTo: WALLET_ADDRESS }, description: "MGO Basic — 4-chain gas comparison", discoverable: true, extensions: { ...declareDiscoveryExtension({ output: { example: basicExample, schema: outputSchema } }) } } }, server),
    paidSessionMiddleware("basic"), gasRouter
  );

  app.use("/gas/premium",
    paymentMiddleware({ "GET /": { accepts: { scheme: "exact", price: "$0.002", network: "eip155:8453", payTo: WALLET_ADDRESS }, description: "MGO Premium — 9-chain gas comparison", discoverable: true, extensions: { ...declareDiscoveryExtension({ output: { example: premiumExample, schema: { ...outputSchema } } }) } } }, server),
    paidSessionMiddleware("premium"), gasRouter
  );
} else {
  app.use("/gas/basic", (req, res) => res.status(503).json({ error: "Payment not configured." }));
  app.use("/gas/premium", (req, res) => res.status(503).json({ error: "Payment not configured." }));
}

app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
