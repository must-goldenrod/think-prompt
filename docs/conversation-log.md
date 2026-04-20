# 대화 기록 (Conversation Log)

> 주요 논의와 결정이 나온 대화를 요약 보존. 결정 자체는 `00-decision-log.md`.
> 여기엔 **맥락과 고려했던 대안**까지 남긴다 (문제 발생 시 "왜 이걸 선택 안 했지?"를 되짚기 위해).

포맷:
- `## <YYYY-MM-DD> · 세션 N — 주제`
- **질문/요청:** 유저가 던진 것
- **검토:** 내가 탐색한 옵션/근거
- **결론:** 결정 또는 다음 행동 + (해당 D-번호)

---

## 2026-04-20 · 세션 1 — 서비스 컨셉 브레인스토밍

**질문/요청:** 여러 플랫폼(Claude Code/ChatGPT/Gemini/Cursor/CLI)에서 유저가 입력하는 프롬프트를 통합 수집·관리하고, 품질 진단·개선을 해주는 서비스를 어떻게 만들지. 가능성·기능 설계·기존 도구 대비 차별점·프라이버시까지.

**검토:**
- 수집 레이어를 5개 축(서버 SDK/CLI/IDE/브라우저/사내챗봇)으로 나눠 각 채널의 기술 가능성·리스크 평가.
- 저장은 Git-like 레포지토리 구조(Prompt/Usage/Outcome + version).
- 분석은 룰베이스 + LLM 심판 + A/B.
- 브라우저 확장은 기술적으로 가능하나 악성 확장과 동일 메커니즘이라 신뢰 설계가 핵심.
- 기존 경쟁(PromptLayer 등)은 API 로깅 중심, 인간이 IDE/CLI에서 치는 프롬프트까지 묶는 건 틈새.

**결론:** `docs/proposal-draft.md`에 초안으로 전체 구조 기록. 다음 세션에서 의사결정 좁히기로.

---

## 2026-04-20 · 세션 2 — 지금 정해야 할 것만 추려서 결정

**질문/요청:** 문서 다시 쓰지 말고, 지금 막혀 있는 의사결정만 리스트업.

**검토:** 7개 결정(타겟/포지션/채널/프라이버시/저장단위/스코어/수익)을 각 대안과 추천 근거로 제시. 기술스택·Enterprise 기능 등은 Phase 2로 밀어둠.

**결론:** 유저의 7개 답변으로 확정.
- 개인 무료 (D-001)
- 수집 + 개선 둘 다 (D-002)
- Claude Code 우선 (D-003)
- 로컬 중심 (D-004)
- 템플릿/턴 분리 (D-005)
- 룰 70 + 실사용 30 (D-006)
- 수익 미논의 (D-007)

`docs/proposal-draft.md §0.5`에 결정 반영. `01-hook-design.md`로 근본 설계부터 구체화 시작.

---

## 2026-04-20 · 세션 3 — Claude Code 훅 설계 (근본부터)

**질문/요청:** "근본으로 가 추천순서대로" — A(훅) → B(로컬 저장) → C(룰) 순서.

**검토:**
- 서브에이전트(`claude-code-guide`)로 현행 Claude Code 훅 스펙 조사.
- **핵심 사실 4가지:**
  1. `UserPromptSubmit`이 원문 프롬프트를 준다.
  2. 서브에이전트 프롬프트 텍스트는 훅에 없다 → `SubagentStop`의 `agent_transcript_path`를 파싱해야.
  3. 모델 최종 응답도 훅 payload에 없다 → 세션 `transcript_path` 파싱.
  4. 훅은 유저 PC 쉘에서 실행 → 로컬 중심 원칙과 구조적으로 일치.
- 훅 6개(`UserPromptSubmit`/`SessionStart`/`SubagentStart`/`SubagentStop`/`PostToolUse`/`Stop`)로 2-Tier 구조 설계 (실시간 훅 + 사후 트랜스크립트 엔리치).
- 코칭 UX 4가지 옵션 비교(조용히 기록 / `additionalContext` 주입 / `exit 2` 블로킹 / OS 알림) → A+B 혼합.
- **Fail-open 원칙 확정** (D-028 선행).

**결론:** `docs/01-hook-design.md` 작성. §9 열린 질문 4개를 M0에서 실측으로 해소.

---

## 2026-04-20 · 세션 4 — 개발 기획 문서 세트 작성

**질문/요청:** "모든 대화와 의사결정은 문서로 저장"하고, 남은 결정은 전부 **추천안으로 확정**해서 **개발 끝까지 갈 수 있는 기획 문서**를 만들 것. 유저가 **직접 테스트**해서 문제를 알 수 있는 수준까지.

**검토:** 추가로 확정해야 할 기술/프로세스 결정 18개(D-008 ~ D-025)를 추천안으로 일괄 확정.
- Node 20 LTS + TypeScript
- pnpm monorepo (cli/agent/worker/dashboard/core/rules)
- Fastify + better-sqlite3 + Anthropic SDK
- 로컬 HTTP 에이전트 + 워커 두 데몬, pidfile 관리
- 대시보드는 서버 렌더 HTML + htmx + Alpine, 번들 없음
- MIT, npm global, macOS + Linux
- Fail-open / 텔레메트리 없음 / 90일 보존 기본값

**결론:** 문서 세트 9개 작성·확정.
- `00-decision-log.md` (D-001 ~ D-030 기록)
- `01-hook-design.md` (세션 3에서)
- `02-tech-stack.md`
- `03-local-storage.md` (SQLite 스키마 v0)
- `04-transcript-parser.md`
- `05-quality-engine.md` (룰 R001~R012 + 스코어 공식 + LLM 심판 · 리라이터)
- `06-coaching-ux.md` (대시보드 라우트 + CLI 커맨드 + 인라인 힌트)
- `07-build-and-test-plan.md` (M-1 ~ M9 + **유저 테스트 절차 · 기대 출력 · 실패 모드 디버그**)
- `99-observation-log.md` (M0 실측 템플릿)
- `README.md` (인덱스)
- `conversation-log.md` (이 문서)

**다음 행동:** M-1(리포 세팅) → M0(실측 스파이크). M0 결과로 01/04 문서 업데이트 후 M1 착수.

---

## 2026-04-20 · 세션 5 — M-1 ~ M9 전체 구현

**질문/요청:** "전부 다시작해서 모두 마무리하고 보고해" — 전체 구축하고 보고.

**검토·실행:**
- Node 22.22 · npm · pnpm 10.32 확인.
- M-1: monorepo 스캐폴딩 완료(.gitignore, LICENSE, biome.json, vitest.workspace.ts, CI, etc.)
- 6개 패키지 생성(core/rules/agent/worker/dashboard/cli) + 각 package.json/tsconfig/tsup/vitest.
- SQLite 스키마 v1 + 마이그레이션 · ULID · PII 마스킹 · 설정 · 로거 · 큐 · 트랜스크립트 파서 · Anthropic 클라이언트 구현.
- 룰 R001~R012 전부 구현(한/영 키워드) + 카탈로그/레지스트리.
- Fastify 에이전트 6개 훅 라우트 (fail-open · 코치 모드 `additionalContext` 주입 포함).
- 워커 5개 잡 핸들러(parse_transcript, parse_subagent_transcript, session_end, judge, rewrite) + 큐 소비자 데몬.
- 대시보드 7개 라우트(overview, prompts, prompts/:id, sessions/:id, rules, settings, doctor) + Tailwind CDN 렌더.
- CLI 18개 서브커맨드(install/uninstall/start/stop/restart/status/doctor/list/show/rewrite/coach/config/reprocess/export/open/wipe) + 데몬 lifecycle(spawn detached + pidfile) + settings.json 병합/제거(기존 유저 훅 보존 검증).

**과정에서 해결한 이슈:**
- `exactOptionalPropertyTypes` 관련 타입 에러 → 옵셔널 필드를 `| undefined`로 명시.
- `pino.multistream`이 default export에 없음 → named import + 자체 MultiStream Writable.
- SQL 마이그레이션 파일이 tsup 빌드에 복사 안 됨 → TS string 상수로 인라인.
- 한국어 맥락 키워드 정규식이 "이 TypeScript 프로젝트" 같은 자연스러운 문장을 놓침 → 명사 단독 매칭으로 완화.
- better-sqlite3 native build가 pnpm 10의 보안 기본값에 차단됨 → `pnpm.onlyBuiltDependencies` 명시.

**검증 결과:**
- typecheck: 6/6 통과
- vitest: **53/53 통과** (9 파일)
- biome lint: 0 errors · 52 warnings
- 전 패키지 빌드 성공
- 엔드투엔드 스모크 테스트: install → 3 데몬 기동 → HTTP 훅 POST → DB 저장 → 스코어링 → 대시보드 HTML 200 OK → stop

**산출물:**
- `REPORT.md` (빌드 리포트 · 테스트 방법)
- 6 패키지 빌드 dist
- 12 설계 문서 (이미 있던 것 유지 · 변경 없음)

**미해결 / 위임:**
- M0 실측(`scripts/spike-hook.sh` + `scripts/spike-settings.json`)은 유저가 실제 Claude Code에 붙여 실행해야 함. 결과를 `docs/99-observation-log.md`에 채워야 parser.ts / schema.ts 최종화 가능.
- GitHub 리포 생성 · 첫 커밋 · npm publish 는 유저 결정 후 진행.
