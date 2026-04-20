# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

**Think-Prompt (가칭)** — Claude Code 프롬프트를 로컬에서 수집·진단·코칭하는 개인 개발자용 무료 툴.

## 리포 상태

기획/설계 단계. 소스 코드는 아직 없음. 설계 · 의사결정 · 빌드 계획이 `docs/` 에 있다.

## 문서 구조 (`docs/`)

문서 인덱스는 [docs/README.md](./docs/README.md).

**읽는 순서는 번호순.**

- **`00-decision-log.md`** — 모든 확정 결정(D-001…). 문제 터지면 여기부터.
- **`01-hook-design.md`** — Claude Code 훅 선택과 fail-open 아키텍처.
- **`02-tech-stack.md`** — Node 20 LTS / pnpm monorepo / Fastify / better-sqlite3 등.
- **`03-local-storage.md`** — SQLite 스키마, 데몬 수명주기.
- **`04-transcript-parser.md`** — 훅이 못 잡는 데이터의 JSONL 파싱 규격.
- **`05-quality-engine.md`** — 룰 R001~R012, 스코어 공식, LLM 심판·리라이터.
- **`06-coaching-ux.md`** — 대시보드 라우트, 인라인 코칭, CLI 커맨드.
- **`07-build-and-test-plan.md`** — **M-1 → M9 마일스톤 + 유저 테스트 절차**.
- **`99-observation-log.md`** — 실측 결과 (M0에서 확정).
- **`conversation-log.md`** — 주요 논의의 맥락.

## 작업 원칙 (이 리포에서)

- **모든 결정은 `00-decision-log.md`에 D-번호로 기록.** 기존 결정 번복 시 취소선 + 새 D-번호로 supersede.
- **실측과 다른 사실은 `99-observation-log.md`에 기록** 후 해당 스펙 문서에 반영.
- **Fail-open 원칙(D-028):** 어떤 코드도 Claude Code를 막지 않는다. 에이전트 다운 = 조용히 통과.
- **로컬 중심(D-004):** 원문 프롬프트는 유저 PC 밖으로 나가지 않는다. 서버 동기화는 Opt-in.
- **마일스톤 끝날 때마다:** `think-prompt doctor` 통과 + 유저가 `07-build-and-test-plan.md`의 해당 M 테스트 절차로 직접 검증.

## 빌드 · 테스트 · 실행

### 전제 조건
- Node 20 LTS 이상 (개발 기준 22.22)
- pnpm 10+

### 명령
```bash
pnpm install            # 워크스페이스 설치
pnpm -r build           # 6 패키지 전부 빌드 (tsup)
pnpm typecheck          # 각 패키지 tsc --noEmit
pnpm test               # vitest 전 패키지
pnpm lint               # biome
pnpm run ci             # 위 네 개를 순차 실행
pnpm -F @think-prompt/core test   # 한 패키지만 테스트
```

### 로컬에서 바이너리 돌리기 (격리 환경)
```bash
TMP=$(mktemp -d)
export THINK_PROMPT_HOME="$TMP/think-prompt"
export THINK_PROMPT_CLAUDE_SETTINGS="$TMP/claude-settings.json"
node packages/cli/dist/index.js install
node packages/cli/dist/index.js status
node packages/cli/dist/index.js doctor
```

### 데몬 3개
- **agent** (`packages/agent`) — `127.0.0.1:47823`, Claude Code 훅 6개 수신
- **worker** (`packages/worker`) — 큐(JSONL) 소비, 트랜스크립트 파싱 · LLM 호출
- **dashboard** (`packages/dashboard`) — `127.0.0.1:47824`, 로컬 웹 UI

### 데이터 위치
- `~/.think-prompt/prompts.db` (SQLite WAL)
- `~/.think-prompt/queue.jsonl`, `queue.offset`
- `~/.think-prompt/agent.log`, `worker.log`

### 세부 계획
`docs/07-build-and-test-plan.md` · 빌드 리포트는 `REPORT.md`.
