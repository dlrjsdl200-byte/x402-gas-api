# x402-gas-api

> **MGO (Multi-Chain Gas Optimizer)** — x402 Protocol PHASE 1

Pay-per-use gas price optimization API across EVM chains. Powered by [x402](https://x402.org).

## Overview

MGO provides real-time, aggregated gas price data across major EVM chains. Agents and developers pay micro-fees per request via x402 — no API keys, no subscriptions.

## Endpoints

| Endpoint | Description | Price |
|---|---|---|
| `GET /gas/:chain` | Current gas prices (safe/standard/fast) | $0.001 |
| `GET /gas/:chain/history` | 24h gas price history | $0.002 |
| `GET /gas/compare` | Compare gas across all chains | $0.003 |
| `GET /gas/:chain/estimate` | Estimate tx cost by gas limit | $0.001 |

## Supported Chains

- Ethereum (mainnet)
- Polygon
- Arbitrum
- Optimism
- Base
- BSC

## Payment

All endpoints are protected by x402 HTTP payment protocol. Payments are made in USDC on Base.

```
HTTP 402 Payment Required
x-payment-required: ...
```

## Quick Start

```bash
npm install x402-fetch
```

```js
const { fetchWithPayment } = require('x402-fetch');
const res = await fetchWithPayment('https://your-deploy.railway.app/gas/ethereum', {
  wallet: yourWallet
});
console.log(await res.json());
```

## Tech Stack

- **Runtime**: Node.js + Fastify
- **Payment**: x402 facilitator (Base mainnet)
- **Data**: Alchemy / Infura RPC aggregation
- **Deploy**: Railway

## Roadmap

- [x] PHASE 1: MGO — Multi-Chain Gas Optimizer
- [ ] PHASE 2: DEX Router, Whale Tracker, Rugpull Scanner, Kimchi Premium Monitor
- [ ] PHASE 3: Super Directory MCP
- [ ] PHASE 4: Revenue structure completion

## License

MIT
