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

### GET /prices — Free
Native token USD prices (ETH, BNB, POL, AVAX, HYPE), cached 60s.

## Response Structure (basic / premium)

```json
{
  "success": true,
  "tier": "basic",
  "recommendation": {
    "cheapestChain": "Base",
    "cheapestChainId": 8453,
    "estimatedCostsUsdc": { "nativeTransfer": 0.0003, "erc20Transfer": 0.0009, "dexSwap": 0.0021 },
    "vsExpensive": { "chain": "Ethereum", "dexSwapUsdc": 0.0379, "savingsPercent": "94.4%" },
    "action": "Use Base — saves 94.4% vs Ethereum"
  },
  "chains": [
    {
      "chain": "Base", "chainId": 8453, "nativeToken": "ETH", "tokenPriceUsd": 2509.3,
      "gasPrice": { "baseFeeGwei": "0.0060", "priorityFeeGwei": "0.0010", "totalFeeGwei": "0.0070" },
      "estimatedCosts": { "dexSwap": { "native": "0.00000105", "usdc": 0.0021, "gasUnits": "150000" } },
      "status": "ok"
    }
  ]
}
```
Demo responses have `recommendation: null` and no USDC figures.

## Payment (x402 v2)

Protocol: x402 (HTTP 402). Requirements are in the `PAYMENT-REQUIRED` response header; retry with `PAYMENT-SIGNATURE`.  
Network: Base (eip155:8453)  
Token: USDC  
Pay to: 0x665bab4c46a6ae3f755e71793e5685bc6c47dd7a

```javascript
// @x402/fetch example (x402 v2)
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
const client = new x402Client().register("eip155:*", new ExactEvmScheme(privateKeyToAccount(process.env.EVM_PRIVATE_KEY)));
const fetch402 = wrapFetchWithPayment(fetch, client);
const res = await fetch402("https://api.mgo.chain-ops.xyz/gas/basic");
```

## MCP Server (remote, no install)

```json
{
  "mcpServers": {
    "mgo-gas": { "url": "https://api.mgo.chain-ops.xyz/mcp" }
  }
}
```
Tools: `get_gas_demo`, `get_cheapest_chain` (free), `get_gas_basic`, `get_gas_premium` (x402).

## Links
- API: https://api.mgo.chain-ops.xyz
- Dashboard: https://mgo.chain-ops.xyz
- llms.txt: https://api.mgo.chain-ops.xyz/llms.txt
- GitHub: https://github.com/dlrjsdl200-byte/x402-gas-api
