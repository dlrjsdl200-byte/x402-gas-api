# MGO — Multi-chain Gas Optimizer

An x402-native API that compares real-time gas prices across up to 9 EVM chains and recommends the cheapest one. Built for trading agents, DeFi bots, and any AI agent that needs to optimize transaction costs.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables
cp .env.example .env
# Set WALLET_ADDRESS to your USDC receiving wallet on Base

# 3. Run locally
npm run dev

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
| `GET /llms.txt` | Free | AI agent discovery file |
| `GET /health` | Free | Server health check |

## Payment Flow (x402 Protocol)

1. `GET /gas/basic` or `/gas/premium` → 402 response with payment requirements
2. Client signs EIP-712 USDC authorization (using x402-axios or x402-fetch)
3. Resend with `X-PAYMENT` header → facilitator verifies → data response → on-chain settlement

```javascript
// Client example (x402-axios)
const { withPayment } = require("x402-axios");
const client = withPayment(axios.create(), walletClient);
const response = await client.get("https://api.mgo.chain-ops.xyz/gas/basic");
```

## MCP Server (Claude / Cursor)

```bash
npm run mcp
```

Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "mgo-gas": {
      "command": "node",
      "args": ["/path/to/x402-gas-api/mcp-server.js"]
    }
  }
}
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

## Platform Registration

1. **BlockRun** — Register MCP server URL
2. **Dexter** — One-line facilitator config
3. **x402.org** — Automatic llms.txt crawling
