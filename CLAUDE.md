# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

**Think-Prompt** — Claude Code 프롬프트를 **로컬에서** 수집·진단·코칭하는 개인 개발자용 오픈소스 툴. 설치하면 Claude Code 훅이 유저가 친 프롬프트를 로컬 SQLite에 적재하고, 안티패턴 룰(R001~R012)로 0-100점을 매긴 뒤, 대시보드와 CLI로 회고/코칭을 제공한다.

## 핵심 아키텍처 원칙

이 리포의 모든 코드는 다음 원칙을 위반하면 안 된다 — 위반 시 `docs/00-decision-log.md` 를 supersede 하는 새 결정을 먼저 추가해야 한다.

- **Fail-open (D-028).** 어떤 코드도 Claude Code를 막지 않는다. 에이전트/워커가 다운되어도 Claude Code 턴은 **조용히 통과**한다. 훅 타임아웃 150ms 안에서만 작업.
- **로컬 중심 (D-004).** 원문 프롬프트는 유저 PC 밖으로 나가지 않는다. LLM 리라이트는 옵트인, 그때만 마스킹본이 Anthropic으로 전송된다.
- **템플릿 vs 사용 이벤트 분리 (D-005).** 스키마/API 설계 시 `prompts`(재사용 템플릿, 버전 관리) 와 `prompt_usages`(유저 턴 이벤트) 를 섞지 않는다.
- **스코어는 룰 70% + 실사용 30% (D-006).** LLM 심판은 룰 스코어 < 60 같은 의심 케이스에만 호출.
- **결정 기록 필수.** 아키텍처·스코어 공식·프라이버시에 영향 주는 변경은 `docs/00-decision-log.md`에 D-번호로 append. 실측이 스펙과 다르면 `docs/99-observation-log.md`에 기록 후 문서 반영.

## 2-Tier 캡처 아키텍처 (핵심 파이프라인)

훅은 동기 실행이라 느려지면 Claude Code 자체가 느려진다 → **Tier 분리**가 이 리포 전체 설계의 뿌리.

```
Claude Code                      think-prompt
    ↓  (Tier 1: 동기 훅, <150ms)
UserPromptSubmit  ──→ agent (:47823) ──→ SQLite append + queue.jsonl push
SessionStart, SubagentStart         │
                                     └─ 룰 기반 즉석 진단만 (LLM/네트워크 금지)
    ↓  (Tier 2: 비동기)
Stop, SubagentStop, PostToolUse ──→ queue.jsonl ──→ worker
                                                       │
                                                       ├─ transcript_path JSONL 파싱
                                                       ├─ 모델 응답/서브에이전트 프롬프트 복원
                                                       ├─ 룰 스코어 + (선택) LLM 심판
                                                       └─ DB 정규화 저장
```

- **훅 payload에 "유저 원문 프롬프트"까지만 들어온다.** 모델 응답·서브에이전트 프롬프트는 payload에 **없음** → `transcript_path`/`agent_transcript_path` JSONL을 **사후 파싱**해서 복원 (`packages/core/src/transcript/`).
- **대시보드 데이터 정합성은 worker에 의존한다.** Tier 1만으로는 프롬프트만 있고 컨텍스트가 비어있는 상태가 정상. worker가 돌아야 스코어/응답/세션 전체가 채워짐.

## 패키지 토폴로지 (의존 방향)

```
cli ──▶ agent, worker, dashboard ──▶ core ──▶ rules
                                         │
                                         └──▶ (DB, PII, scorer, transcript parser, LLM adapter)
```

- `packages/core` — DB(`db.ts`, `schema.ts`, `migrations/`), 설정(`config.ts`), 경로(`paths.ts`), PII 마스킹(`pii.ts`), 스코어러(`scorer.ts`), 큐(`queue.ts`), 트랜스크립트 파서(`transcript/`), LLM 어댑터(`llm/`), 로거(`logger.ts`). **여기서 공개된 함수만** 다른 패키지가 import.
- `packages/rules` — R001~R012 룰 정의(`rules.ts`), 키워드(`keywords.ts`), 레지스트리(`registry.ts`). core에만 의존. **새 룰 추가 시 positive + negative 샘플 테스트 필수** (CONTRIBUTING.md).
- `packages/agent` — Fastify 훅 수신기 (`127.0.0.1:47823`). 6개 Claude Code 훅 라우트가 모두 여기에. Tier 1 제약(LLM/네트워크 금지) 유지.
- `packages/worker` — 큐 컨슈머(`jobs.ts`), 트랜스크립트 JSONL 파싱, 스코어 재계산, LLM 심판/리라이터 호출.
- `packages/dashboard` — 서버 렌더 HTML (`127.0.0.1:47824`). eta + Alpine.js + Tailwind(CDN) + htmx, **번들러 없음**. `html.ts`는 렌더, `server.ts`는 Fastify 라우트.
- `packages/cli` — `think-prompt` 바이너리. `commands/` 하위에 서브커맨드별 파일. `daemon.ts`가 detached child + pidfile 관리, `settings-merge.ts`가 `~/.claude/settings.json` 훅 블록 병합, `hook-template.ts`가 훅 스크립트 템플릿.

## 데이터/파일 위치

```
~/.think-prompt/
├── prompts.db             # SQLite WAL (프롬프트·이벤트·스코어)
├── queue.jsonl            # worker 큐 (append-only, offset 파일로 소비 추적)
├── queue.offset
├── config.json            # 유저 전역 설정
├── agent.pid, worker.pid, dashboard.pid
└── agent.log, worker.log  # pino 구조화 JSON, 7일 로테이션

~/.claude/settings.json    # 훅 블록 merge 대상 (install/uninstall이 수술)
```

**포트:** agent 47823, dashboard 47824. 충돌 시 +1씩 최대 10회 탐색 (`config.json`으로 고정 가능).

## 빌드 · 테스트 · 실행

### 전제
- Node 20 LTS 이상 (22 권장)
- pnpm 10+ (`packageManager` 필드로 고정)
- macOS/Linux. Windows는 Phase 2.

### 커맨드
```bash
pnpm install                             # 워크스페이스 설치
pnpm -r build                            # 6 패키지 전부 빌드 (tsup, ESM)
pnpm typecheck                           # 각 패키지 tsc --noEmit
pnpm test                                # vitest 전 패키지 (현재 ~53 tests)
pnpm lint                                # biome check
pnpm lint:fix                            # biome 자동수정 (push 전 권장)
pnpm run ci                              # build → typecheck → lint → test
pnpm clean                               # dist + node_modules/.cache 제거

# 한 패키지만
pnpm -F @think-prompt/core test
pnpm -F @think-prompt/rules test -- --run some-rule.test.ts
```

### 격리 환경에서 바이너리 돌리기
글로벌 `~/.think-prompt/`와 `~/.claude/settings.json`을 건드리지 않고 테스트할 때:

```bash
TMP=$(mktemp -d)
export THINK_PROMPT_HOME="$TMP/think-prompt"
export THINK_PROMPT_CLAUDE_SETTINGS="$TMP/claude-settings.json"
node packages/cli/dist/index.js install    # 훅 + 데몬 설치
node packages/cli/dist/index.js status     # 데몬 3개 상태
node packages/cli/dist/index.js doctor     # 건강 진단
node packages/cli/dist/index.js open       # 대시보드 오픈 (:47824)
```

### 대시보드만 따로 띄우기
```bash
node packages/dashboard/dist/index.js      # :47824 바인드, dashboard.pid 기록
```

### CLI 서브커맨드 (전체)
`install / uninstall / start / stop / restart / status / doctor / list / show / rewrite / coach / config (get|set|list) / reprocess / export / open / wipe` — 정의는 `packages/cli/src/index.ts`, 구현은 `packages/cli/src/commands/*`.

## 어디를 고칠지 (작업 맵)

| 하고 싶은 것 | 패키지 | 주요 파일 |
|---|---|---|
| 새 룰 추가 | `packages/rules` | `src/rules.ts`, `src/keywords.ts`, 샘플 테스트 |
| 스코어 공식 변경 | `packages/core` | `src/scorer.ts`, `test/scorer.test.ts` |
| 새 훅 라우트 | `packages/agent` | `src/server.ts` |
| CLI 서브커맨드 | `packages/cli` | `src/commands/*.ts`, `src/index.ts` |
| 대시보드 UI | `packages/dashboard` | `src/server.ts`, `src/html.ts` |
| 백그라운드 작업 | `packages/worker` | `src/jobs.ts` |
| 트랜스크립트 파싱 | `packages/core` | `src/transcript/` |
| PII 마스킹 룰 | `packages/core` | `src/pii.ts` |
| 훅 스크립트 템플릿 | `packages/cli` | `src/hook-template.ts` |

## 문서 (`docs/`)

번호순으로 읽는다. 설계·결정 근거는 여기에만 있다 (코드에는 주석 없음).

- **`00-decision-log.md`** — 모든 확정 결정(D-001…). 문제 터지면 여기부터.
- **`01-hook-design.md`** — 훅 선택 + fail-open + 2-Tier.
- **`02-tech-stack.md`** — Node / pnpm / Fastify / better-sqlite3 / biome / vitest / tsup.
- **`03-local-storage.md`** — SQLite 스키마, 데몬 수명주기.
- **`04-transcript-parser.md`** — JSONL 파싱 규격.
- **`05-quality-engine.md`** — R001~R012, 스코어 공식, LLM 심판·리라이터.
- **`06-coaching-ux.md`** — 대시보드 라우트, 인라인 코칭, CLI.
- **`07-build-and-test-plan.md`** — **M-1 → M9 마일스톤 + 유저 테스트 절차**.
- **`08-quality-criteria.md`** — 수용 기준.
- **`99-observation-log.md`** — 실측 결과.
- **`conversation-log.md`** — 논의 맥락.

## 이 리포에서의 작업 규칙

- **마일스톤 종료 기준:** `think-prompt doctor` 통과 + `07-build-and-test-plan.md`의 해당 M 테스트 절차를 유저가 직접 돌려서 검증.
- **타입:** TypeScript `strict` + `exactOptionalPropertyTypes`. `any` 지양, 외부 입력은 zod 스키마로 좁힌다.
- **커밋:** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`, `ci:`). v0.x는 파괴적 변경 허용이지만 CHANGELOG + PR 본문에 명시.
- **프라이버시 관련 변경**(수집/저장/마스킹/공유)은 D-004, D-030을 건드리지 않는지 반드시 확인.
- **빌드 리포트:** 현재 상태는 리포 루트 `REPORT.md`.
