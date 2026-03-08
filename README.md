# MGO — Multi-chain Gas Optimizer

x402 에이전트 네이티브 가스비 비교 API.
최대 9개 EVM 체인 실시간 가스비를 비교해서 최저가를 추천합니다.

## 빠른 시작

```bash
# 1. 패키지 설치
npm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일에서 WALLET_ADDRESS를 본인 지갑 주소로 변경

# 3. 로컬 실행
npm run dev

# 4. 테스트
# 브라우저에서: http://localhost:3000/gas/demo
```

## 티어

| 기능 | Demo (무료) | Basic ($0.001) | Premium ($0.002) |
|---|---|---|---|
| 체인 수 | 4 | 4 | 9 |
| 가스 가격 | O | O | O |
| 최저가 추천 | X | O | O |
| 절감률 계산 | X | O | O |
| 절약액 계산 | X | O | O |
| BNB, Polygon 등 5체인 | X | X | O |
| Rate Limit | 10/hr, 100/day | 무제한 | 무제한 |

## 엔드포인트

| 엔드포인트 | 결제 | 설명 |
|---|---|---|
| `GET /gas/demo` | 무료 | 데모 (raw 가스비만, 10/hr 제한) |
| `GET /gas/basic` | $0.001 USDC (x402) | Basic 4체인 + 추천 + 절감률 |
| `GET /gas/premium` | $0.002 USDC (x402) | Premium 9체인 풀스펙 |
| `GET /llms.txt` | 무료 | AI 에이전트 디스커버리 파일 |
| `GET /health` | 무료 | 서버 상태 확인 |

## 결제 플로우 (x402 Protocol)

1. `GET /gas/basic` 또는 `/gas/premium` → 402 응답 (payment requirements)
2. 클라이언트가 EIP-712 서명으로 USDC 결제 승인 (x402-axios 또는 x402-fetch 사용)
3. `X-PAYMENT` 헤더와 함께 재요청 → facilitator 검증 → 데이터 응답 → 온체인 정산

```javascript
// 클라이언트 예제 (x402-axios)
const { withPayment } = require("x402-axios");
const client = withPayment(axios.create(), walletClient);
const response = await client.get("https://api.mgo.chain-ops.xyz/gas/basic");
```

## MCP 서버 (Claude/Cursor 연동)

```bash
npm run mcp
```

Claude Desktop 설정에 추가:
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

## Vercel 배포

```bash
npm i -g vercel
vercel --prod
```

## 플랫폼 등록

1. **BlockRun** — MCP 서버 URL 등록
2. **Dexter** — 패실리테이터 한 줄 설정
3. **x402.org** — llms.txt 자동 크롤링
