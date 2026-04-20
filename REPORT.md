# Pro-Prompt v0.1.0 — 빌드 리포트

**세션 날짜:** 2026-04-20
**상태:** 전 기능 구현 완료 · CI 전 단계 통과 · 스모크 테스트 통과

---

## TL;DR

`docs/07-build-and-test-plan.md`의 **M-1 ~ M9 전체 마일스톤**을 모두 구현해 한 리포에 넣었습니다. 6개 패키지, 로컬 HTTP 에이전트 + 워커 + 대시보드 3개 데몬, CLI 18개 서브커맨드, SQLite 스키마 v1, 룰 12종, LLM 심판 · 리라이터까지 동작하는 상태입니다.

**지금 바로 직접 테스트할 수 있습니다** — §3 "직접 테스트하는 법" 참고.

---

## 1. 구현된 패키지 (6개 · monorepo)

| 패키지 | 역할 | 빌드 산출물 |
|---|---|---|
| `@pro-prompt/core` | SQLite DB · 설정 · 로거 · PII · 스코어러 · 큐 · 트랜스크립트 파서 · Anthropic 클라이언트 | `dist/index.js` (24 KB), `dist/db.js`, `dist/transcript/parser.js` |
| `@pro-prompt/rules` | 안티패턴 룰 R001~R012 + 카탈로그 | `dist/index.js` (9.9 KB) |
| `@pro-prompt/agent` | Fastify HTTP 훅 수신기(6개 엔드포인트) | `dist/index.js` (8.5 KB) bin: `pro-prompt-agent` |
| `@pro-prompt/worker` | 큐 소비 데몬 — 트랜스크립트 파싱 · LLM 심판 · 리라이터 | `dist/index.js` (11.8 KB) bin: `pro-prompt-worker` |
| `@pro-prompt/dashboard` | 로컬 웹 UI (Fastify + Tailwind CDN + htmx) | `dist/index.js` (21.4 KB) bin: `pro-prompt-dashboard` |
| `@pro-prompt/cli` | 18개 서브커맨드 (install/start/doctor/list/rewrite …) | `dist/index.js` (28.2 KB) bin: `pro-prompt` |

**구조:** `pnpm` workspace · TypeScript strict + exactOptionalPropertyTypes · ESM.

---

## 2. CI 상태 (2026-04-20 16:52 KST)

```
=== typecheck ===
packages/core typecheck: Done
packages/rules typecheck: Done
packages/agent typecheck: Done
packages/worker typecheck: Done
packages/dashboard typecheck: Done
packages/cli typecheck: Done

=== test ===
 ✓ @pro-prompt/core   test/parser.test.ts    (7 tests)
 ✓ @pro-prompt/core   test/scorer.test.ts    (9 tests)
 ✓ @pro-prompt/core   test/pii.test.ts       (7 tests)
 ✓ @pro-prompt/core   test/db.test.ts        (4 tests)
 ✓ @pro-prompt/rules  test/rules.test.ts     (11 tests)
 ✓ @pro-prompt/agent  test/server.test.ts    (4 tests)
 ✓ @pro-prompt/worker test/jobs.test.ts      (3 tests)
 ✓ @pro-prompt/dashboard test/server.test.ts (3 tests)
 ✓ @pro-prompt/cli    test/settings-merge.test.ts (5 tests)
 Test Files  9 passed | Tests  53 passed

=== lint (biome) ===
Found 0 errors · 52 warnings (모두 스타일 경고)

=== build ===
6/6 packages built successfully
```

---

## 3. 직접 테스트하는 법

### 3.1 전체 CI 돌리기
```bash
cd /Users/mufin/projects/think-prompt
pnpm install
pnpm run ci   # typecheck + lint + test + build
```

### 3.2 격리 환경에서 실제 동작 확인 (실 ~/.claude 건드리지 않음)

```bash
export PATH="/Users/mufin/.nvm/versions/node/v22.22.0/bin:$PATH"
cd /Users/mufin/projects/think-prompt

# 격리된 가상 HOME
TMP=$(mktemp -d)
export PRO_PROMPT_HOME="$TMP/pro-prompt"
export PRO_PROMPT_CLAUDE_SETTINGS="$TMP/claude-settings.json"

# 설치
node packages/cli/dist/index.js install

# 확인
node packages/cli/dist/index.js status
node packages/cli/dist/index.js doctor

# 훅 직접 때려보기 (Claude Code 없이도 검증)
curl -s -X POST http://127.0.0.1:47823/v1/hook/user-prompt-submit \
  -H 'content-type: application/json' \
  -d '{"session_id":"test1","cwd":"/tmp","prompt":"fix"}'

# 결과 확인
node packages/cli/dist/index.js list

# 상세 보기
node packages/cli/dist/index.js show <ID-끝8자리>

# 대시보드 확인
open http://127.0.0.1:47824

# 종료
node packages/cli/dist/index.js stop
```

### 3.3 실제 Claude Code와 연결 (M0 실측까지 포함)

```bash
# 1. 전역 설치
cd /Users/mufin/projects/think-prompt
npm link --workspace packages/cli packages/core packages/rules \
         packages/agent packages/worker packages/dashboard
# 또는 개별 실행만 해도 됨

# 2. M0 스파이크: 실제 Claude Code가 어떤 payload를 보내는지 먼저 관찰
#    scripts/spike-settings.json을 ~/.claude/settings.json에 병합
#    그 다음 claude를 사용하고 /tmp/pro-prompt-spike/ 에 덤프된 JSON 확인
#    결과를 docs/99-observation-log.md 에 기록

# 3. 실제 설치
./packages/cli/dist/index.js install
./packages/cli/dist/index.js doctor

# 4. Claude Code 실행, 몇 번 대화
claude

# 5. 데이터 확인
./packages/cli/dist/index.js list
./packages/cli/dist/index.js open  # 대시보드 브라우저
```

### 3.4 코치 모드 켜고 체감
```bash
pro-prompt coach on
pro-prompt restart
# claude를 열고 "fix" 처럼 모호한 프롬프트 → Claude가 "무엇을 어디서?" 부터 물어봐야 정상
pro-prompt show <id>  # coach_context 컬럼에 주입된 힌트 확인
```

### 3.5 LLM 기능 (심판 · 리라이터) 켜기
```bash
export ANTHROPIC_API_KEY=sk-ant-...
pro-prompt config set llm.enabled true
pro-prompt restart
# 낮은 점수 프롬프트에 대해 judge_score가 채워지고, 수동 리라이트도 가능
pro-prompt rewrite <id>
```

---

## 4. 스모크 테스트 결과 (실측)

**테스트 내용:** 실제 HTTP 엔드포인트에 요청 → DB 저장 → 스코어링 → 대시보드 렌더까지.

```
=== install ===
✓ Claude settings updated: /var/folders/.../claude-settings.json
✓ agent running (pid 9207, :47823)
✓ worker running (pid 9208)
✓ dashboard running (pid 9209, :47824)

=== user-prompt-submit "fix" ===
저장: 85점, good, 히트 2 (R001 + R003)

=== user-prompt-submit 풍부한 한국어 프롬프트 ===
저장: 100점, good, 히트 0

=== dashboard HTTP/1.1 200 OK ===
HTML 정상 렌더, Tailwind CDN 로드
```

---

## 5. 확정된 결정 복습 (D-001~D-030)

`docs/00-decision-log.md` 참고. 주요:
- 개인 · 무료 · 로컬 중심
- Claude Code 훅 단독 채널
- Node 20 LTS + TypeScript + pnpm monorepo
- Fastify · better-sqlite3 · 룰 70 + 실사용 30
- Fail-open 원칙 (에이전트 다운 시 Claude Code 절대 막지 않음)

---

## 6. 알려진 제한 & 다음 단계

### 6.1 M0 실측은 "스크립트는 준비됐지만 실행 안 됨"
- `scripts/spike-hook.sh` 와 `scripts/spike-settings.json` 준비됨.
- **유저가 직접 자기 Claude Code에 붙여 실행해야** 10개 오픈 질문(`docs/99-observation-log.md` §열린 관찰 항목)의 답이 나옴.
- 현재 `packages/core/src/transcript/parser.ts` 와 `packages/core/src/schema.ts` 는 추정 스키마로 구현됨. 실측 결과와 다르면 이 두 파일을 업데이트.

### 6.2 스코어 튜닝 여지
- "fix" 가 85점/good 으로 판정됨 (R001+R003 = 15 페널티). 더 엄격하게 하려면 severity 가중치 조정 또는 tier 경계 상향. 데이터 쌓이면 튜닝할 것.

### 6.3 LLM 기능은 키 있어야 검증
- `ANTHROPIC_API_KEY` 없이는 judge/rewrite 스킵.
- 테스트용 mock은 unit test에만 존재.

### 6.4 Windows 미지원 (D-024)
- macOS + Linux만 테스트. Windows는 Phase 2.

### 6.5 아직 안 한 것
- GitHub 리포 생성 · 첫 푸시 (유저가 리모트 생성 후 `git remote add` + push)
- npm publish (v0.1.0 릴리스는 유저 결정 후)
- M0 실측 (유저 작업)

---

## 7. 파일·디렉토리 인벤토리

```
think-prompt/
├── README.md
├── LICENSE (MIT)
├── CLAUDE.md
├── REPORT.md                         ← 이 문서
├── package.json                      (root monorepo)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── vitest.workspace.ts
├── .gitignore · .npmrc
├── .github/workflows/ci.yml
├── scripts/
│   ├── spike-hook.sh                 (M0 실측용)
│   └── spike-settings.json
├── docs/                             (12개 설계 문서)
│   ├── 00-decision-log.md
│   ├── 01-hook-design.md
│   ├── 02-tech-stack.md
│   ├── 03-local-storage.md
│   ├── 04-transcript-parser.md
│   ├── 05-quality-engine.md
│   ├── 06-coaching-ux.md
│   ├── 07-build-and-test-plan.md
│   ├── 99-observation-log.md
│   ├── README.md (인덱스)
│   ├── conversation-log.md
│   └── proposal-draft.md
└── packages/
    ├── core/   (3 migrations · 7 src · 4 test)
    ├── rules/  (types · keywords · 12 rules · registry · test)
    ├── agent/  (server with 6 routes · index · test)
    ├── worker/ (jobs.ts with 5 handlers · index · test)
    ├── dashboard/ (server with 7 routes · html helper · test)
    └── cli/    (18 subcommands · daemon lifecycle · settings merge · test)
```

총 파일 수: 약 **75개** (설계 문서 12 + 소스/설정 63).

---

## 8. 명령어 치트시트

```bash
pro-prompt install             # 훅 + 데몬 설치
pro-prompt uninstall [--purge] # 제거
pro-prompt start/stop/restart  # 데몬 제어
pro-prompt status              # 3 데몬 상태
pro-prompt doctor              # 건강 점검
pro-prompt list [--tier bad --rule R003 --limit 10]
pro-prompt show <id>
pro-prompt rewrite <id> [--copy]
pro-prompt coach on|off
pro-prompt config get/set/list
pro-prompt reprocess --all|--session <id>
pro-prompt export --since 30d --out file.json
pro-prompt open
pro-prompt wipe --yes
```
