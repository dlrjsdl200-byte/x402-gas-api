# MGO — Multi-chain Gas Optimizer

x402 에이전트 네이티브 가스비 비교 API.
Ethereum, Base, Arbitrum, Optimism 4개 체인 실시간 가스비를 비교해서 최저가를 추천합니다.

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
# 브라우저에서: http://localhost:3000/gas?demo=true
```

## 엔드포인트

| 엔드포인트 | 결제 | 설명 |
|---|---|---|
| `GET /gas` | $0.01 (10회) | 4개 체인 가스비 비교 + 최저가 추천 |
| `GET /gas?demo=true` | 무료 | 데모 모드 |
| `GET /llms.txt` | 무료 | AI 에이전트 디스커버리 파일 |
| `GET /health` | 무료 | 서버 상태 확인 |

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
