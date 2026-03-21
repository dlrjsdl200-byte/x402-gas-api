# MGO — Multi-chain Gas Optimizer

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
Raw gas prices for 4 chains. Rate limited (10/hr per IP). Good for testing.

```
curl https://api.mgo.chain-ops.xyz/gas/demo
```

### GET /gas/basic — $0.001 USDC
4-chain gas comparison with cheapest chain recommendation and savings calculation.
Chains: Ethereum, Base, Optimism, Arbitrum

### GET /gas/premium — $0.002 USDC
Full 9-chain comparison including BNB, Polygon, Avalanche, zkSync, Hyperliquid.

## Response Structure

```json
{
  "cheapestChain": "Base",
  "savingsPercent": "97.7%",
  "recommendation": "Use Base — 97.7% cheaper than Ethereum",
  "chains": [
    {
      "name": "Base",
      "gasPriceGwei": 0.001,
      "estimatedCostUSDC": 0.000021,
      "rank": 1
    }
  ]
}
```

## Payment (x402)

Protocol: x402  
Network: Base (eip155:8453)  
Token: USDC  
Wallet: 0xEC3cAf9281a1b5371F76ee3A3eAb895fdECCe31e

```javascript
// x402-fetch example
import { wrapFetchWithPayment } from 'x402-fetch';
const fetch402 = wrapFetchWithPayment(fetch, walletClient);
const res = await fetch402('https://api.mgo.chain-ops.xyz/gas/basic');
```

## MCP Server

For Claude Desktop / Claude Code:

```json
{
  "mcpServers": {
    "mgo-gas": {
      "command": "node",
      "args": ["/path/to/mcp-server.js"]
    }
  }
}
```

## Links
- API: https://api.mgo.chain-ops.xyz
- Dashboard: https://mgo.chain-ops.xyz
- llms.txt: https://api.mgo.chain-ops.xyz/llms.txt
- GitHub: https://github.com/dlrjsdl200-byte/x402-gas-api
