#!/usr/bin/env node
/**
 * MGO MCP Server
 * Claude / Cursor 등 MCP 호환 클라이언트에서 직접 호출 가능
 *
 * 실행: node mcp-server.js (stdio 모드)
 * 등록: Claude Desktop → Settings → MCP Servers → 이 파일 경로 추가
 */

const { createPublicClient, http, formatGwei } = require("viem");
const { mainnet, base, arbitrum, optimism } = require("viem/chains");
const readline = require("readline");

// ── 체인 설정 ──
const CHAINS = [
  { name: "Ethereum", chain: mainnet, rpc: "https://eth.llamarpc.com" },
  { name: "Base",     chain: base,     rpc: "https://mainnet.base.org" },
  { name: "Arbitrum", chain: arbitrum, rpc: "https://arb1.arbitrum.io/rpc" },
  { name: "Optimism", chain: optimism, rpc: "https://mainnet.optimism.io" },
];

// ── 가스비 조회 함수 ──
async function fetchGasPrices() {
  const results = await Promise.allSettled(
    CHAINS.map(async (c) => {
      const client = createPublicClient({ chain: c.chain, transport: http(c.rpc) });
      const gasPrice = await client.getGasPrice();
      return {
        chain: c.name,
        chainId: c.chain.id,
        gasPriceWei: gasPrice.toString(),
        gasPriceGwei: parseFloat(formatGwei(gasPrice)).toFixed(4),
        transferCostEth: (Number(gasPrice * 21000n) / 1e18).toFixed(8),
      };
    })
  );

  const data = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  if (data.length === 0) throw new Error("All RPC calls failed");

  const cheapest = data.reduce((min, cur) =>
    BigInt(cur.gasPriceWei) < BigInt(min.gasPriceWei) ? cur : min
  );

  return {
    recommendation: `Use ${cheapest.chain} (${cheapest.gasPriceGwei} gwei)`,
    cheapest: cheapest.chain,
    chains: data,
    timestamp: new Date().toISOString(),
  };
}

// ── MCP 프로토콜 핸들러 (JSON-RPC over stdio) ──
const MCP_TOOLS = [
  {
    name: "get_cheapest_gas",
    description:
      "Compare real-time gas prices across Ethereum, Base, Arbitrum, and Optimism. Returns the cheapest chain and estimated transfer costs.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write(msg + "\n");
}

function sendError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  process.stdout.write(msg + "\n");
}

async function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    case "initialize":
      return sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mgo-gas-optimizer", version: "1.0.0" },
      });

    case "notifications/initialized":
      // 클라이언트 초기화 완료 알림 — 응답 불필요
      return;

    case "tools/list":
      return sendResponse(id, { tools: MCP_TOOLS });

    case "tools/call": {
      const toolName = params?.name;
      if (toolName === "get_cheapest_gas") {
        try {
          const data = await fetchGasPrices();
          return sendResponse(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(data, null, 2),
              },
            ],
          });
        } catch (err) {
          return sendResponse(id, {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          });
        }
      }
      return sendError(id, -32601, `Unknown tool: ${toolName}`);
    }

    default:
      return sendError(id, -32601, `Unknown method: ${method}`);
  }
}

// ── stdio 읽기 ──
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  try {
    const request = JSON.parse(line.trim());
    await handleRequest(request);
  } catch (err) {
    sendError(null, -32700, "Parse error");
  }
});

process.stderr.write("MGO MCP Server started (stdio mode)\n");
