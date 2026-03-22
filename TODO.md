# chain-ops 생태계 확장 TODO

> 최종 업데이트: 2026-03-22

---

## ✅ 완료

| 항목 | 내용 |
|------|------|
| skill.md + .well-known 3종 | api.mgo.chain-ops.xyz 라이브 |
| ClawHub 스킬 등재 | chain-ops-mgo v1.0.0 |
| Moltbook 에이전트 등록 + claim | chain-ops-agent @L_Gun 인증 |
| GitHub Actions 매일 자동 포스팅 | KST 오전 9시 general 포스팅 |
| chain-ops.xyz Agent Activity 섹션 | ClawHub LIVE 카드, Moltbook 멘션 감지 |
| MGO 제품 카드에 ClawHub 버튼 추가 | chain-ops.xyz 홈페이지 |

---

## 🔴 최우선 (지금 당장)

### 1. CDP Bazaar discoverable 활성화 ✅ 진행 중
- `api/index.js` paymentMiddleware에 `discoverable: true` 추가
- 완료 시 효과: x402scan.com 자동 수집 + x402search.xyz 인덱싱 + CDP Bazaar 노출

### 2. npm publish — chain-ops-mgo
```bash
# /home/claude/chain-ops-mgo 폴더에 파일 준비됨
cd chain-ops-mgo
npm login
npm publish
```
- 완료 시 효과: Smithery 자동 등재, npm 검색 노출

### 3. skills.sh 등재
- x402-gas-api GitHub 레포에 SKILL.md 있음 → skills.sh에 레포 등록만 하면 됨
- URL: https://skills.sh → Submit skill → `dlrjsdl200-byte/x402-gas-api`
- 완료 시 효과: Claude Code, Cursor, Codex 등 18개 에이전트에서 자동 발견

---

## 🟡 이번 주

### 4. x402scan.com URL 제출
- URL: https://www.x402scan.com/resources/register
- 제출값: `https://api.mgo.chain-ops.xyz/gas/basic`

### 5. x402.org 에코시스템 등재
- 폼: https://docs.google.com/forms/d/e/1FAIpQLSc2rlaeH31rZpJ_RFNL7egxi9fYTEUjW9r2kwkhd2pMae2dog/viewform
- Category: Services/Endpoints
- Description: Multi-chain Gas Optimizer for AI agents. 9 EVM chains, x402 on Base, from $0.001 USDC.

### 6. Moltbook workflow 고도화
- URL 제거 (스팸 필터 회피)
- 피드 읽고 관련 포스트에 댓글 달기 (karma 쌓기)
- m/evm-gas Submolt 개설
- 포스팅 내용: 순수 데이터만, 링크 없이

### 7. EntRoute 등재
- URL: https://entroute.io
- machine-first API discovery — 에이전트가 semantic search로 x402 엔드포인트 탐색

---

## 🟢 중기 (다음 달)

### 8. Smithery MCP 서버 등재
- MGO를 MCP 서버로 래핑
- Claude Desktop, Cursor, VS Code에서 one-command 설치

### 9. HyperPulse 완성 + LIVE
- `/funding/anomaly`, `/oi/spike`, `/liquidation/heatmap`, `/market/snapshot`, `/trade/signal`
- 홈페이지 LIVE 뱃지와 실제 상태 일치시키기

### 10. Insider Scanner 완성 + LIVE
- `/insider/alerts`, `/insider/score`, `/insider/signal`

### 11. Arb Scanner 버그 수정
- DEX 볼륨 $10K 미만 필터 추가
- Binance bookTicker API 교체
- Prediction 빈 결과 응답 개선
- ClawHub 스킬 등재

### 12. Moltbook m/evm-gas Submolt 성장
- 매일 포스팅 + 댓글로 karma 쌓기
- 팔로워 100명 목표

### 13. 유튜브 "그냥만들었어요" 연계
- chain-ops 성과 (ClawHub installs, 온체인 수익) 영상화
- 영상 트래픽 → chain-ops 유입 선순환

### 14. chain-ops-sdk 통합 패키지
- chain-ops-mgo + chain-ops-arb + chain-ops-insider 묶는 통합 npm 패키지
- 완성 후 배포

---

## 📊 현재 등재 현황

| 플랫폼 | 상태 | URL |
|--------|------|-----|
| ClawHub | ✅ LIVE | clawhub.ai/dlrjsdl200-byte/chain-ops-mgo |
| Moltbook | ✅ 에이전트 활성 | moltbook.com/u/chain-ops-agent |
| x402scan | 🔶 CDP 자동 수집 예정 | x402scan.com |
| x402.org | ❌ 미등재 | 폼 제출 필요 |
| skills.sh | ❌ 미등재 | 레포 등록 필요 |
| SkillsMP | 🔶 자동 크롤링 예정 | SKILL.md 있음 |
| Smithery | ❌ 미등재 | npm publish 후 자동 |
| npm | ❌ 미배포 | chain-ops-mgo 파일 준비됨 |
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
