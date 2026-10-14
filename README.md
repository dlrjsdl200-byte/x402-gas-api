# MGO — Multi-chain Gas Optimizer

An x402-native API that compares real-time gas prices across up to 9 EVM chains and recommends the cheapest one. Built for trading agents, DeFi bots, and any AI agent that needs to optimize transaction costs.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables
cp .env.example .env
# Set WALLET_ADDRESS (USDC receiving wallet on Base) and CDP_API_KEY_ID/SECRET (facilitator auth)

# 3. Run locally (same entry point as production)
npm start

# 4. Test
# Open in browser: http://localhost:3000/gas/demo
```

## Tiers

| Feature | Demo (Free) | Basic ($0.001) | Premium ($0.002) |
|---|---|---|---|
| Chains | 4 | 4 | 9 |
| Gas prices | Yes | Yes | Yes |
| Cheapest chain recommendation | No | Yes | Yes |
| Savings % calculation | No | Yes | Yes |
| Cost savings estimate | No | Yes | Yes |
| BNB, Polygon, Avalanche, zkSync, Hyperliquid | No | No | Yes |
| Rate limit | 10/hr, 100/day | Unlimited | Unlimited |

## Endpoints

| Endpoint | Payment | Description |
|---|---|---|
| `GET /gas/demo` | Free | Raw gas prices only (10/hr rate limit) |
| `GET /gas/basic` | $0.001 USDC (x402) | 4-chain comparison + recommendation + savings |
| `GET /gas/premium` | $0.002 USDC (x402) | 9-chain full comparison |
| `GET /prices` | Free | Native token USD prices (ETH, BNB, POL, AVAX, HYPE), 60s cache |
| `POST /mcp` | Free / x402 | MCP Streamable HTTP endpoint (tools: `get_gas_demo`, `get_cheapest_chain`, `get_gas_basic`, `get_gas_premium`) |
| `GET /openapi.json` | Free | OpenAPI 3.1 spec |
| `GET /llms.txt`, `/skill.md` | Free | AI agent discovery files |
| `GET /.well-known/x402`, `/.well-known/x402.json`, `/.well-known/mcp.json`, `/.well-known/agent-card.json` | Free | Discovery metadata |
| `GET /health` | Free | Server health check |

## Payment Flow (x402 v2)

1. `GET /gas/basic` or `/gas/premium` → `402` with requirements in the `PAYMENT-REQUIRED` header (base64 JSON). A v1-shaped copy is also in the body for legacy clients.
2. Client signs an EIP-3009 USDC authorization on Base (`eip155:8453`)
3. Resend with `PAYMENT-SIGNATURE` header → facilitator (Coinbase CDP) verifies → data response with `PAYMENT-RESPONSE` receipt → USDC settled on-chain

If the upstream RPC / price feed is unavailable the API answers `503` and **no payment is settled**.

```javascript
// Client example (@x402/fetch, x402 v2)
const { wrapFetchWithPayment } = require("@x402/fetch");
const { x402Client } = require("@x402/core/client");
const { ExactEvmScheme } = require("@x402/evm/exact/client");
const { privateKeyToAccount } = require("viem/accounts");

const client = new x402Client().register("eip155:*", new ExactEvmScheme(privateKeyToAccount(process.env.EVM_PRIVATE_KEY)));
const paidFetch = wrapFetchWithPayment(fetch, client);
const res = await paidFetch("https://api.mgo.chain-ops.xyz/gas/basic");
```

## MCP (Claude / Cursor / any MCP client)

Remote Streamable HTTP server, no install:

```json
{
  "mcpServers": {
    "mgo-gas": { "url": "https://api.mgo.chain-ops.xyz/mcp" }
  }
}
```

Also published as npm package [`chain-ops-mgo`](https://www.npmjs.com/package/chain-ops-mgo) and in the official MCP Registry (`xyz.chain-ops/mgo`). Paid tools return the decoded x402 payment requirements; pay with an x402 client against the `resource` URL.

## Operations

- Access log + `/stats` (Upstash Redis, key via `STATS_KEY`; send it as `x-stats-key` header)
- Demo rate limit and the CoinGecko price cache are shared through the same Redis
- Secrets never live in this repo: see `.env.example`

## Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

## Platform Registration

1. **BlockRun** — Register MCP server URL
2. **Dexter** — One-line facilitator config
3. **x402.org** — Automatic llms.txt crawling
