# chain-ops 생태계 확장 TODO

> 최종 업데이트: 2026-03-22

---

## ✅ 완료

| 항목 | 내용 | 날짜 |
|------|------|------|
| skill.md + .well-known 3종 | api.mgo.chain-ops.xyz 라이브 | 03-21 |
| ClawHub 스킬 등재 | chain-ops-mgo v1.0.0 | 03-22 |
| Moltbook 에이전트 등록 + claim | chain-ops-agent @L_Gun 인증 | 03-22 |
| GitHub Actions 매일 자동 포스팅 | KST 오전 9시 general 포스팅 | 03-22 |
| chain-ops.xyz Agent Activity 섹션 | ClawHub LIVE 카드, Moltbook 멘션 감지 | 03-22 |
| CDP Bazaar `discoverable: true` | x402scan + x402search.xyz 자동 등재 | 03-22 |
| npm publish `chain-ops-mgo@1.0.0` | npmjs.com 라이브, Smithery 자동 등재 예정 | 03-22 |
| skills.sh 등재 | Claude Code, Cursor, Codex 등 30개+ 에이전트 | 03-22 |
| **Moltbook workflow 고도화** | URL 제거, 피드 댓글, 업보트로 karma 쌓기 | 03-22 |
| **홈페이지 npm/skills.sh 배지 추가** | MGO 카드 + Activity 섹션 + Docs 링크 | 03-22 |

---

## 🔴 지금 당장 (네가 직접 해야 함)

### 1. x402scan.com URL 제출
- URL: https://www.x402scan.com/resources/register
- 제출값: `https://api.mgo.chain-ops.xyz/gas/basic`

### 2. x402.org 에코시스템 등재
- 폼: https://docs.google.com/forms/d/e/1FAIpQLSc2rlaeH31rZpJ_RFNL7egxi9fYTEUjW9r2kwkhd2pMae2dog/viewform
- Category: Services/Endpoints
- Name: chain-ops MGO
- Description: Multi-chain Gas Optimizer for AI agents. 9 EVM chains, x402 on Base, from $0.001 USDC.
- Website: https://mgo.chain-ops.xyz

---

## 🟡 이번 주

### 3. HyperPulse 완성 + LIVE
- 홈페이지 LIVE 뱃지 달려있는데 실제 미완성
- Claude Code에서 빌드 필요
- 엔드포인트: /funding/anomaly, /oi/spike, /liquidation/heatmap, /market/snapshot, /trade/signal

### 4. Insider Scanner 완성 + LIVE
- 홈페이지 LIVE 뱃지 달려있는데 실제 미완성
- 엔드포인트: /insider/alerts, /insider/score, /insider/signal

### 5. Arb Scanner 버그 수정
- DEX 볼륨 $10K 미만 필터 추가
- Binance bookTicker API 교체
- Prediction 빈 결과 응답 개선
- ClawHub 스킬 등재

### 6. Moltbook m/evm-gas Submolt 개설
```powershell
Invoke-RestMethod -Method POST -Uri "https://www.moltbook.com/api/v1/submolts" `
  -Headers @{"Authorization"="Bearer moltbook_sk_q-qdAzvUFFXwLdaSRd8zRP5r9iQngPWL"} `
  -ContentType "application/json" `
  -Body '{"name":"evm-gas","display_name":"EVM Gas Intelligence","description":"Real-time gas price data, chain comparisons, and cost optimization for AI agents on EVM networks."}'
```

---

## 🟢 중기 (다음 달)

### 7. Smithery MCP 서버 등재
- MGO를 MCP 서버로 래핑
- Claude Desktop, Cursor, VS Code에서 one-command 설치

### 8. EntRoute 등재
- URL: https://entroute.io
- machine-first API discovery — 에이전트가 semantic search로 x402 엔드포인트 탐색

### 9. BlockRun 카탈로그 등재
- URL: https://blockrun.ai
- 데이터 API #1 카테고리 (31%), 903명 활성 유저

### 10. 유튜브 "그냥만들었어요" 연계
- chain-ops 성과 수치 영상화 (ClawHub installs, 온체인 수익)
- 영상 트래픽 → chain-ops 유입 선순환

### 11. chain-ops-sdk 통합 패키지
- chain-ops-mgo + chain-ops-arb + chain-ops-insider 묶는 통합 npm 패키지
- 완성 후 배포

---

## 📊 현재 등재 현황

| 플랫폼 | 상태 | URL |
|--------|------|-----|
| ClawHub | ✅ LIVE | clawhub.ai/dlrjsdl200-byte/chain-ops-mgo |
| npmjs.com | ✅ LIVE | npmjs.com/package/chain-ops-mgo |
| skills.sh | ✅ LIVE (30+ agents) | skills.sh/dlrjsdl200-byte/chain-ops-mgo |
| Moltbook | ✅ 에이전트 활성 | moltbook.com/u/chain-ops-agent |
| CDP Bazaar | ✅ discoverable:true | 자동 등재 중 |
| x402scan | 🔶 URL 제출 필요 | x402scan.com |
| x402.org | ❌ 미등재 | 폼 제출 필요 |
| Smithery | 🔶 npm 등재 후 자동 | 대기 중 |
| SkillsMP | 🔶 SKILL.md 크롤링 예정 | 자동 수집 |
| BlockRun | ❌ 미등재 | blockrun.ai |
| EntRoute | ❌ 미등재 | entroute.io |

---

## 💡 나중에 검토할 아이디어

- Fluora (MonetizedMCP 마켓플레이스) 등재
- Heurist Mesh skill 등재
- Dexter 마켓플레이스 등재
- SkillsDirectory.com 보안 검증 후 Grade-A 뱃지 획득
- x402jobs 워크플로우 블록 등재
- Polymarket insider signal 엔드포인트 신규 개발
