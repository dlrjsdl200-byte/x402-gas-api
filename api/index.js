const express = require("express");
const { paymentMiddleware, x402ResourceServer } = require("@x402/express");
const { HTTPFacilitatorClient } = require("@x402/core/server");
const { createCdpFacilitatorConfig } = require("../lib/cdp-auth");
const { registerExactEvmScheme } = require("@x402/evm/exact/server");
const { declareDiscoveryExtension } = require("@x402/extensions/bazaar");
const gasRouter = require("../routes/gas");
const { demoSessionMiddleware, paidSessionMiddleware, TIER_PRICING } = require("../middleware/session");
const { demoRateLimit } = require("../middleware/rateLimit");
const { accessLog, statsHandler } = require("../lib/accessLog");
const { getTokenPricesDetailed } = require("../lib/priceCache");
const fs = require("fs");
const path = require("path");

const app = express();

// ─── Constants ──────────────────────────────────────────────────────────────
// Receiving wallet for USDC on Base. Hard-coded on purpose so every discovery
// surface advertises the same address; the env var is only allowed to agree.
const PAY_TO = "0x665bab4c46a6ae3f755e71793e5685bc6c47dd7a";
const API_BASE = "https://api.mgo.chain-ops.xyz";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const VERSION = require("../package.json").version;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || PAY_TO;
if (WALLET_ADDRESS.toLowerCase() !== PAY_TO) {
  console.error(`[config] WALLET_ADDRESS env (${WALLET_ADDRESS}) differs from PAY_TO constant (${PAY_TO})`);
}
if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
  console.error("[config] CDP_API_KEY_ID / CDP_API_KEY_SECRET missing: facilitator auth will fail (401)");
}

// Behind Vercel's proxy: makes req.protocol https and req.ip the client IP.
app.set("trust proxy", true);
app.disable("x-powered-by");

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

### GET /prices — Free
Native token USD prices (ETH, BNB, POL, AVAX, HYPE), cached 60s.

## Response shape (basic/premium)
\`\`\`json
{
  "success": true,
  "tier": "basic",
  "recommendation": { "cheapestChain": "Base", "cheapestChainId": 8453,
    "estimatedCostsUsdc": { "dexSwap": 0.0021 },
    "vsExpensive": { "chain": "Ethereum", "savingsPercent": "94.4%" },
    "action": "Use Base — saves 94.4% vs Ethereum" },
  "chains": [ { "chain": "Base", "chainId": 8453, "gasPrice": { "baseFeeGwei": "0.0060" },
    "estimatedCosts": { "dexSwap": { "usdc": 0.0021 } }, "status": "ok" } ]
}
\`\`\`

## Payment (x402 v2)
Protocol: x402 (HTTP 402). Requirements arrive in the PAYMENT-REQUIRED response header; retry with PAYMENT-SIGNATURE.
Network: Base (eip155:8453)
Token: USDC
Pay to: ${PAY_TO}
Client: @x402/fetch or @x402/axios (wrapFetchWithPayment / wrapAxiosWithPayment).

## MCP
Remote Streamable HTTP endpoint: https://api.mgo.chain-ops.xyz/mcp (tools: get_gas_demo, get_cheapest_chain, get_gas_basic, get_gas_premium)

## Links
- Dashboard: https://mgo.chain-ops.xyz
- llms.txt: https://api.mgo.chain-ops.xyz/llms.txt
- OpenAPI: https://api.mgo.chain-ops.xyz/openapi.json
- GitHub: https://github.com/dlrjsdl200-byte/x402-gas-api
`;

const WELL_KNOWN_MCP = {
  name: "MGO — Multi-chain Gas Optimizer",
  description: "Real-time gas price comparison across up to 9 EVM chains. Returns cheapest chain recommendation with savings calculations. Pay-per-call via x402 on Base.",
  version: VERSION,
  url: "https://api.mgo.chain-ops.xyz",
  mcp: { transport: "streamable-http", endpoint: "https://api.mgo.chain-ops.xyz/mcp" },
  payment: { protocol: "x402", network: "base", token: "USDC", wallet: "0x665bab4c46a6ae3f755e71793e5685bc6c47dd7a" },
  tools: [
    { name: "get_gas_demo", description: "Free gas prices for 4 chains (rate limited)", endpoint: "GET /gas/demo", price: "free" },
    { name: "get_cheapest_chain", description: "Direct recommendation for the cheapest EVM chain right now with savings % (free, rate limited)", endpoint: "GET /gas/demo", price: "free" },
    { name: "get_gas_basic", description: "4-chain gas comparison with cheapest recommendation", endpoint: "GET /gas/basic", price: "$0.001 USDC" },
    { name: "get_gas_premium", description: "9-chain full gas comparison", endpoint: "GET /gas/premium", price: "$0.002 USDC" }
  ],
  links: { dashboard: "https://mgo.chain-ops.xyz", docs: "https://api.mgo.chain-ops.xyz/llms.txt", github: "https://github.com/dlrjsdl200-byte/x402-gas-api", npm: "https://www.npmjs.com/package/chain-ops-mgo" }
};

const WELL_KNOWN_AGENT_CARD = {
  name: "MGO Gas Optimizer",
  description: "x402-native API that compares real-time gas prices across up to 9 EVM chains. Built for trading agents, DeFi bots, and AI agents optimizing transaction costs.",
  url: "https://api.mgo.chain-ops.xyz",
  provider: { name: "chain-ops", url: "https://chain-ops.xyz" },
  version: VERSION,
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

// ─── OpenAPI 3.1 spec ───────────────────────────────────────────────────────
// Served at /openapi.json so discovery surfaces (x402scan, Bazaar, MCP
// directories) can render rich cards for the paid endpoints. The x402 price
// per endpoint is carried in the non-standard `x-x402` extension, which the
// x402 ecosystem tooling reads.
const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "MGO — Multi-chain Gas Optimizer",
    version: VERSION,
    description:
      "Compare real-time gas prices across up to 9 EVM chains and get a cheapest-chain recommendation. Pay-per-call via x402 (USDC on Base). No API key.",
    contact: { name: "chain-ops", url: "https://chain-ops.xyz", email: "dlrjsdl200@naver.com" },
    license: { name: "Proprietary" }
  },
  servers: [{ url: "https://api.mgo.chain-ops.xyz" }],
  "x-x402": {
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x665bab4c46a6ae3f755e71793e5685bc6c47dd7a",
    facilitator: "cdp"
  },
  paths: {
    "/gas/demo": {
      get: {
        summary: "Free demo — raw gas prices for 4 chains",
        description: "Ethereum, Base, Arbitrum, Optimism. Rate limited to 10 requests/hour per IP. No payment.",
        operationId: "getGasDemo",
        security: [],
        responses: { "200": { description: "Gas comparison", content: { "application/json": { schema: { $ref: "#/components/schemas/GasResponse" } } } } }
      }
    },
    "/prices": {
      get: {
        summary: "Free native token USD prices (ETH, BNB, POL, AVAX, HYPE), 60s cache",
        operationId: "getPrices",
        security: [],
        responses: { "200": { description: "Prices", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, currency: { type: "string" }, prices: { type: "object" }, fetchedAt: { type: "string" }, ageSec: { type: "number" } } } } } } }
      }
    },
    "/gas/basic": {
      get: {
        summary: "4-chain gas comparison (paid)",
        description: "Ethereum, Base, Arbitrum, Optimism with cheapest-chain recommendation and savings %. $0.001 USDC via x402 on Base.",
        operationId: "getGasBasic",
        "x-x402": { price: "0.001", asset: "USDC", network: "eip155:8453" },
        responses: {
          "200": { description: "Gas comparison", content: { "application/json": { schema: { $ref: "#/components/schemas/GasResponse" } } } },
          "402": { description: "Payment Required. Pay $0.001 USDC via x402 (requirements in the PAYMENT-REQUIRED header), then retry with the PAYMENT-SIGNATURE header." }
        }
      }
    },
    "/gas/premium": {
      get: {
        summary: "9-chain gas comparison (paid)",
        description: "Adds BNB, Polygon, Avalanche, zkSync, Hyperliquid to the basic 4. $0.002 USDC via x402 on Base.",
        operationId: "getGasPremium",
        "x-x402": { price: "0.002", asset: "USDC", network: "eip155:8453" },
        responses: {
          "200": { description: "Gas comparison", content: { "application/json": { schema: { $ref: "#/components/schemas/GasResponse" } } } },
          "402": { description: "Payment Required. Pay $0.002 USDC via x402 (requirements in the PAYMENT-REQUIRED header), then retry with the PAYMENT-SIGNATURE header." }
        }
      }
    }
  },
  components: {
    schemas: {
      GasResponse: {
        type: "object",
        required: ["success", "chains", "recommendation"],
        properties: {
          success: { type: "boolean" },
          timestamp: { type: "string", format: "date-time" },
          tier: { type: "string", enum: ["demo", "basic", "premium"] },
          totalLatencyMs: { type: "number" },
          recommendation: {
            type: "object",
            properties: {
              cheapestChain: { type: "string", example: "Base" },
              cheapestChainId: { type: "number", example: 8453 },
              estimatedCostsUsdc: { type: "object" },
              vsExpensive: { type: "object", properties: { chain: { type: "string" }, savingsPercent: { type: "string", example: "99.8%" } } },
              action: { type: "string", example: "Use Base — saves 99.8% vs Ethereum" }
            }
          },
          chains: {
            type: "array",
            items: {
              type: "object",
              properties: {
                chain: { type: "string" },
                chainId: { type: "number" },
                nativeToken: { type: "string" },
                tokenPriceUsd: { type: "number" },
                gasPrice: { type: "object" },
                estimatedCosts: { type: "object" },
                status: { type: "string" }
              }
            }
          }
        }
      }
    }
  }
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
    description: "Find the cheapest EVM chain before sending a transaction. Compares live gas across Ethereum, Base, Arbitrum & Optimism and returns the cheapest chain with savings % (e.g. 'Use Base — saves 99.8% vs Ethereum'). Use before bridging, deploying a contract, or any tx where you can choose the chain. $0.001 USDC via x402 on Base, no API key.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_gas_premium",
    description: "Find the cheapest EVM chain across 9 networks before transacting. Covers Ethereum, Base, Arbitrum, Optimism, BNB, Polygon, Avalanche, zkSync & Hyperliquid; returns the cheapest chain with savings % for cross-chain routing decisions. Use when you need the widest chain coverage to route a tx to the lowest-fee network. $0.002 USDC via x402 on Base, no API key.",
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

// Self-calls go over HTTP so the paid path stays identical to what agents hit.
// They carry a fixed User-Agent so /stats can separate them from real traffic.
const SELF_UA = "mgo-mcp-internal/" + VERSION;
const selfFetch = (p) => fetch(`${API_BASE}${p}`, { headers: { "user-agent": SELF_UA }, signal: AbortSignal.timeout(25_000) });

// Decode the x402 v2 PAYMENT-REQUIRED header (base64 JSON) if present.
function decodePaymentRequired(res) {
  const h = res.headers.get("payment-required");
  if (!h) return null;
  try { return JSON.parse(Buffer.from(h, "base64").toString("utf8")); } catch { return null; }
}

async function callMcpTool(toolName) {
  if (toolName === "get_gas_demo" || toolName === "get_cheapest_chain") {
    const res = await selfFetch("/gas/demo");
    if (!res.ok) throw new Error(`Gas demo API error: ${res.status}`);
    const data = await res.json();
    if (toolName === "get_cheapest_chain" && data.chains?.length) {
      // Demo responses omit USDC figures, so compare native DEX-swap cost.
      // All four demo chains use ETH, so native cost is directly comparable.
      const ok = data.chains.filter(c => c.status === "ok" && c.estimatedCosts?.dexSwap?.native);
      if (!ok.length) throw new Error("no chain data available");
      const sorted = [...ok].sort((a, b) => parseFloat(a.estimatedCosts.dexSwap.native) - parseFloat(b.estimatedCosts.dexSwap.native));
      const cheap = sorted[0], exp = sorted[sorted.length - 1];
      const cc = parseFloat(cheap.estimatedCosts.dexSwap.native), ec = parseFloat(exp.estimatedCosts.dexSwap.native);
      const savings = ec > 0 ? ((1 - cc / ec) * 100).toFixed(1) : "0.0";
      return `🏆 Cheapest EVM chain: ${cheap.chain}\n   ${cheap.gasPrice?.baseFeeGwei} gwei  |  DEX swap ${cc.toFixed(8)} ETH\n\n   vs ${exp.chain}: ${ec.toFixed(8)} ETH  →  saves ${savings}%\n\n   USDC figures and the 9-chain view are in get_gas_basic / get_gas_premium (x402, $0.001 / $0.002).`;
    }
    return formatGasData(data);
  }
  const endpoint = toolName === "get_gas_basic" ? "/gas/basic" : "/gas/premium";
  const price = toolName === "get_gas_basic" ? "$0.001" : "$0.002";
  const res = await selfFetch(endpoint);
  if (res.status === 402) {
    const pr = decodePaymentRequired(res);
    return JSON.stringify({
      _requires_payment: true,
      price: `${price} USDC`,
      network: "Base (eip155:8453)",
      token: "USDC",
      payTo: PAY_TO,
      resource: `${API_BASE}${endpoint}`,
      how: "Fetch the resource URL with an x402 client (e.g. @x402/fetch). It reads the PAYMENT-REQUIRED header, signs a USDC authorization and retries with PAYMENT-SIGNATURE.",
      payment_required: pr || undefined,
      message: `Payment required: ${price} USDC on Base. This is an x402 pay-per-call endpoint.`
    }, null, 2);
  }
  if (!res.ok) throw new Error(`MGO API error: ${res.status}`);
  return formatGasData(await res.json());
}

// ─── Access logging (Upstash Redis) ─────────────────────────────────────────
app.use(accessLog);

// ─── CORS & body parsing ────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-PAYMENT, PAYMENT-SIGNATURE, Mcp-Session-Id, MCP-Protocol-Version");
  // Browser clients (x402scan "Try it", dashboards) can only read these if exposed.
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE, Mcp-Session-Id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

// ─── Smithery MCP Streamable HTTP endpoint ──────────────────────────────────
// Spec: https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/
const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
app.post("/mcp", async (req, res) => {
  const body = req.body;
  res.setHeader("Content-Type", "application/json");
  if (!body || Array.isArray(body) || body.jsonrpc !== "2.0") {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
  }
  const { id, method, params } = body;

  // Notifications (no id) must not get a JSON-RPC response: 202 Accepted, empty body.
  if (id === undefined || id === null) {
    return res.status(202).end();
  }

  try {
    if (method === "initialize") {
      const requested = params?.protocolVersion;
      return res.json({
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "mgo-gas-optimizer", version: VERSION }
        }
      });
    }

    if (method === "ping") {
      return res.json({ jsonrpc: "2.0", id, result: {} });
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
          error: { code: -32602, message: `Unknown tool: ${toolName}` }
        });
      }
      try {
        const text = await callMcpTool(toolName);
        return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } });
      } catch (err) {
        // Tool execution errors are reported inside the result per MCP spec.
        console.error("[mcp tool]", toolName, err.message);
        return res.json({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `Tool failed: ${err.message}` }] } });
      }
    }

    return res.json({
      jsonrpc: "2.0", id,
      error: { code: -32601, message: `Method not found: ${method}` }
    });

  } catch (err) {
    console.error("[mcp]", err);
    return res.json({
      jsonrpc: "2.0", id,
      error: { code: -32603, message: "Internal error" }
    });
  }
});

// GET /mcp: no SSE stream is offered (405 per Streamable HTTP spec); plain GETs get a discovery blurb.
app.get("/mcp", (req, res) => {
  if ((req.headers.accept || "").includes("text/event-stream")) {
    return res.status(405).set("Allow", "POST").json({ error: "SSE stream not supported; use POST /mcp" });
  }
  res.json({
    name: "mgo-gas-optimizer",
    version: VERSION,
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
    version: VERSION,
    protocol: "x402",
    tiers: {
      basic: { price: `$${TIER_PRICING.basic.amount} USDC / 1 call`, chains: TIER_PRICING.basic.chains, description: TIER_PRICING.basic.description },
      premium: { price: `$${TIER_PRICING.premium.amount} USDC / 1 call`, chains: TIER_PRICING.premium.chains, description: TIER_PRICING.premium.description },
    },
    endpoints: {
      "/gas/basic": "Paid gas comparison (4 chains, $0.001 USDC via x402)",
      "/gas/premium": "Paid gas comparison (9 chains, $0.002 USDC via x402)",
      "/gas/demo": "Free demo (raw gas prices, 10/hr limit)",
      "/prices": "Free native token USD prices (60s cache)",
      "/mcp": "Smithery MCP Streamable HTTP endpoint",
      "/llms.txt": "AI discovery file",
      "/skill.md": "OpenClaw skill file",
      "/.well-known/x402": "x402scan discovery",
      "/.well-known/x402.json": "x402 discovery (legacy)",
      "/openapi.json": "OpenAPI 3.1 spec",
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
app.get("/openapi.json", (req, res) => { res.json(OPENAPI_SPEC); });
// Serve a brand icon at the API root so discovery surfaces (x402scan, etc.)
// can render one. Redirect to the canonical favicon on the marketing site.
app.get("/favicon.ico", (req, res) => { res.redirect(302, "https://chain-ops.xyz/favicon.ico"); });
app.get("/health", (req, res) => { res.json({ status: "ok", timestamp: new Date().toISOString(), version: VERSION }); });
app.get("/stats", statsHandler);

// Free token prices, served from the shared cache so the dashboard does not
// call CoinGecko from every browser (which got rate-limited and rendered $0).
app.get("/prices", async (req, res) => {
  try {
    const out = await getTokenPricesDetailed();
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({ success: true, currency: "USD", ...out });
  } catch (err) {
    console.error("[PRICES]", err.message);
    res.status(503).set("Retry-After", "30").json({ success: false, error: "Price feed unavailable" });
  }
});

// ─── Gas routes ──────────────────────────────────────────────────────────────
app.use("/gas/demo", demoRateLimit, demoSessionMiddleware, gasRouter);

// x402 v1 clients (legacy `x402-fetch` / `x402-axios`) read payment requirements
// from the 402 body, not from the PAYMENT-REQUIRED header. The @x402 server
// middleware sends `{}` as body, so give them a v1-shaped body derived from the
// header. NOTE: this server only settles v2 payments; v1 attempts will get a
// second 402, but they are then visible in /stats with their payer address.
function toV1Body(prHeader) {
  const pr = JSON.parse(Buffer.from(String(prHeader), "base64").toString("utf8"));
  return {
    x402Version: 1,
    error: pr.error || "Payment required",
    accepts: (pr.accepts || []).map((a) => ({
      scheme: a.scheme,
      network: a.network === "eip155:8453" ? "base" : a.network,
      maxAmountRequired: a.amount,
      resource: pr.resource?.url,
      description: pr.resource?.description || "",
      mimeType: pr.resource?.mimeType || "application/json",
      payTo: a.payTo,
      maxTimeoutSeconds: a.maxTimeoutSeconds,
      asset: a.asset,
      extra: a.extra || { name: "USD Coin", version: "2" },
    })),
    // v2 clients: the authoritative copy is in the PAYMENT-REQUIRED header.
    paymentRequired: pr,
  };
}
function withV1Body(pay) {
  return (req, res, next) => {
    const origJson = res.json.bind(res);
    res.json = (body) => {
      const pr = res.getHeader("PAYMENT-REQUIRED");
      if (res.statusCode === 402 && pr && body && typeof body === "object" && Object.keys(body).length === 0) {
        try { body = toV1Body(pr); } catch (e) { console.error("[x402] v1 body", e.message); }
      }
      return origJson(body);
    };
    return Promise.resolve(pay(req, res, next)).catch(next);
  };
}

if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
  const facilitatorClient = new HTTPFacilitatorClient(
    createCdpFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET)
  );
  const server = new x402ResourceServer(facilitatorClient);
  registerExactEvmScheme(server);

  // Bazaar discovery examples: real chain ids / native tokens so agents reading
  // the sample do not see `chainId: 1` for every chain.
  const chainExample = (name, chainId, nativeToken, tokenPriceUsd, gwei, usdcCost) => ({
    chain: name, chainId, nativeToken, tokenPriceUsd,
    gasPrice: { baseFeeGwei: gwei, priorityFeeGwei: "0.0010", totalFeeGwei: gwei },
    estimatedCosts: {
      nativeTransfer: { native: "0.00004200", usdc: +(usdcCost * 0.14).toFixed(6), gasUnits: "21000", label: "Simple native token transfer" },
      erc20Transfer: { native: "0.00013000", usdc: +(usdcCost * 0.43).toFixed(6), gasUnits: "65000", label: "ERC-20 token transfer" },
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
    chains: [
      chainExample("Ethereum", 1, "ETH", 3500, "12.3456", 5.12),
      chainExample("Base", 8453, "ETH", 3500, "0.0100", 0.001),
      chainExample("Arbitrum", 42161, "ETH", 3500, "0.0200", 0.002),
      chainExample("Optimism", 10, "ETH", 3500, "0.0150", 0.0015),
    ],
  };

  const premiumExample = {
    ...basicExample, tier: "premium",
    tokenPrices: { ETH: 3500, BNB: 600, POL: 0.4, AVAX: 25, HYPE: 30 },
    chains: [
      ...basicExample.chains,
      chainExample("BNB Chain", 56, "BNB", 600, "1.0000", 0.05),
      chainExample("Polygon", 137, "POL", 0.4, "30.0000", 0.003),
      chainExample("Avalanche", 43114, "AVAX", 25, "25.0000", 0.12),
      chainExample("zkSync Era", 324, "ETH", 3500, "0.0250", 0.002),
      chainExample("Hyperliquid", 999, "HYPE", 30, "0.5000", 0.01),
    ],
  };

  // One middleware for both paid routes (one facilitator handshake per cold start).
  // `resource` is explicit so the advertised URL is https regardless of proxy headers.
  const paidRoutes = {
    "GET /gas/basic": {
      accepts: { scheme: "exact", price: "$0.001", network: "eip155:8453", payTo: WALLET_ADDRESS },
      resource: `${API_BASE}/gas/basic`,
      mimeType: "application/json",
      description: "Find the cheapest EVM chain before you transact. Compares live gas across Ethereum, Base, Arbitrum & Optimism and returns the cheapest chain with savings % (e.g. \"Use Base — saves 99.8% vs Ethereum\"). Call this before bridging, deploying, or any tx with chain flexibility. $0.001 USDC, no API key.",
      extensions: { ...declareDiscoveryExtension({ output: { example: basicExample, schema: outputSchema } }) },
    },
    "GET /gas/premium": {
      accepts: { scheme: "exact", price: "$0.002", network: "eip155:8453", payTo: WALLET_ADDRESS },
      resource: `${API_BASE}/gas/premium`,
      mimeType: "application/json",
      description: "Find the cheapest EVM chain across 9 networks before you transact. Covers Ethereum, Base, Arbitrum, Optimism, BNB, Polygon, Avalanche, zkSync & Hyperliquid; returns the cheapest chain with savings % so agents route txs to the lowest-fee chain. Best for cross-chain routing decisions. $0.002 USDC, no API key.",
      extensions: { ...declareDiscoveryExtension({ output: { example: premiumExample, schema: { ...outputSchema } } }) },
    },
  };

  app.use(withV1Body(paymentMiddleware(paidRoutes, server)));
  app.use("/gas/basic", paidSessionMiddleware("basic"), gasRouter);
  app.use("/gas/premium", paidSessionMiddleware("premium"), gasRouter);
} else {
  app.use("/gas/basic", (req, res) => res.status(503).json({ error: "Payment not configured (CDP credentials missing)." }));
  app.use("/gas/premium", (req, res) => res.status(503).json({ error: "Payment not configured (CDP credentials missing)." }));
}
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
