# 07 · 빌드 & 테스트 계획 (End-to-End)

> 이 문서 하나로 **M0 → 릴리스까지 순차 실행** 가능하도록 작성.
> 각 마일스톤은:
> - **Goal** · 무엇을 만드는가
> - **Deliverables** · 산출물(파일/커맨드)
> - **Acceptance Criteria** · 통과 기준
> - **Test by User** · 유저가 직접 실행할 테스트 절차 + 기대 출력
> - **Known Failure Modes** · 자주 터지는 문제 + 디버그 명령
>
> 원칙:
> - 각 마일스톤은 **1~2일** 분량.
> - 끝나면 항상 `pro-prompt doctor`가 통과해야 한다.
> - 실패 시 `docs/99-observation-log.md`에 기록.

---

## 리포 초기 세팅 (M-1)

**이건 마일스톤 전 1회성 작업.**

**Deliverables:**
- Git repo 초기화 + `.gitignore` (node_modules, dist, `.pro-prompt-test/`)
- Root `package.json` with `pnpm workspaces`
- `pnpm-workspace.yaml`
- `tsconfig.base.json` (strict + extends in packages)
- `biome.json` (lint+format)
- `vitest.workspace.ts`
- 빈 패키지 6개: cli/agent/worker/dashboard/core/rules (각 `package.json` + `src/index.ts`)
- GitHub Actions `ci.yml` (install → typecheck → test → build)
- README.md (설치 · 사용 안내 자리만 선점)
- LICENSE (MIT)

**Test by User:**
```bash
pnpm install
pnpm -r build
pnpm -r test
```
기대: 전 패키지 빌드/테스트 통과, 에러 0.

---

## M0 · 훅 동작 실측 스파이크

**Goal:** 문서상의 가정 4개를 실제 Claude Code로 확인한다. 코드는 일회성이어도 OK.

**Deliverables:**
- `scripts/spike-hook.sh` — 훅에서 stdin 전체를 `/tmp/pro-prompt-spike/<event>-<timestamp>.json` 로 덤프
- `scripts/spike-settings.json` — Claude Code `settings.json`에 임시 설치할 훅 블록
- `docs/99-observation-log.md` — 실측 결과 기록

**테스트 절차:**
1. `scripts/spike-hook.sh` 작성:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   DIR=/tmp/pro-prompt-spike
   mkdir -p "$DIR"
   EVT="${CLAUDE_HOOK_EVENT_NAME:-unknown}"
   cat > "$DIR/${EVT}-$(date +%s%N).json"
   ```
2. `~/.claude/settings.json`에 6개 훅 이벤트 대상으로 이 스크립트 등록 (임시).
3. Claude Code 실행 → 다음 시나리오 수행:
   - 평범한 질문 1번
   - `/clear` 후 새 세션
   - 복잡한 작업 → 서브에이전트 스폰되는 것 (Task 또는 Agent)
   - `/compact` 실행
4. `ls /tmp/pro-prompt-spike` 로 덤프된 JSON 확인.
5. 각 JSON 파일 열어 확인 항목 체크:
   - [ ] `UserPromptSubmit`의 `prompt` 필드에 원문이 있는가?
   - [ ] `SubagentStart`에 `agent_type`·`agent_id`·`prompt` 중 무엇이 있는가?
   - [ ] `SubagentStop`에 `agent_transcript_path` 실제 존재 파일인가?
   - [ ] `transcript_path` 경로 패턴은 무엇인가? (`~/.claude/projects/<hash>/...`?)
   - [ ] 트랜스크립트 JSONL의 이벤트 키 이름은? (`type`/`role`/`content`?)
   - [ ] 슬래시 커맨드(`/foo`) 입력 시 `prompt` 필드에 원문이 남는가?
   - [ ] `compact` 후 다음 `UserPromptSubmit`의 `session_id`는 이전과 같은가?

**Acceptance Criteria:**
- `docs/99-observation-log.md`에 위 7개 질문에 대한 **확인된 답**이 기록됨.
- 실측과 다르면 `01-hook-design.md`, `04-transcript-parser.md`에 "OBSERVED:" 섹션 추가.

**Known Failure Modes:**
- 훅이 호출 안 됨 → `~/.claude/settings.json` JSON 유효성(`cat ~/.claude/settings.json | jq .`), stderr 확인.
- 스크립트 권한 없음 → `chmod +x scripts/spike-hook.sh`.
- macOS Gatekeeper 차단 → `xattr -d com.apple.quarantine scripts/spike-hook.sh`.

---

## M1 · 에이전트 + UserPromptSubmit 엔드투엔드

**Goal:** `UserPromptSubmit` 훅 → 로컬 HTTP 에이전트 → SQLite 저장. 가장 얇은 E2E 한 줄.

**Deliverables:**
- `packages/core`:
  - SQLite 초기화 (`db.ts`), 마이그레이션 러너, `001_init.sql`(모든 테이블)
  - ULID 생성기
  - PII 마스킹 v0 (이메일/전화/한국주민번호 3종만)
- `packages/agent`:
  - Fastify 서버, `/v1/hook/user-prompt-submit`, `/v1/hook/session-start`
  - 요청 body zod 검증
  - 들어온 prompt → sessions upsert + prompt_usages insert
  - pino 로깅
- `packages/cli`:
  - `pro-prompt install` (settings.json 병합)
  - `pro-prompt uninstall`
  - `pro-prompt start` / `stop` / `status`
  - `pro-prompt list` (최근 20개 출력)

**Acceptance Criteria:**
- `pro-prompt install && pro-prompt start` 후 Claude Code에서 아무거나 입력 → `pro-prompt list`에 해당 프롬프트가 보인다.
- 에이전트 포트 충돌 시 +1 탐색 성공.
- 에이전트 kill → Claude Code가 여전히 정상 작동 (fail-open).

**Test by User:**
```bash
# 1) 로컬 설치
pnpm -r build
npm link packages/cli
pro-prompt install

# 2) 상태 확인
pro-prompt status
# 기대: agent pid=xxxx :47823 / worker (not yet — M2에서 추가)

# 3) Claude Code 열어서 아무 질문 입력
claude
> What's 2+2?

# 4) 저장 확인
pro-prompt list --limit 5
# 기대: 방금 친 프롬프트 첫 60자 보임

# 5) DB 직접 확인
sqlite3 ~/.pro-prompt/prompts.db "SELECT id, substr(prompt_text,1,40), char_len FROM prompt_usages ORDER BY created_at DESC LIMIT 3;"

# 6) fail-open 테스트
pro-prompt stop
claude
> Does Claude still work?  # 응답 정상이어야 함
pro-prompt start
```

**Known Failure Modes:**
- 훅이 타임아웃 → agent.log에 "slow" 경고, UserPromptSubmit 예산 3초 넘음. 해결: DB insert를 비동기 큐에 밀고 즉시 200 반환.
- settings.json이 이미 다른 훅 있는데 install이 덮어씀 → install은 반드시 **merge**, 충돌 시 `.claude/settings.json.bak-<ts>` 백업.
- 포트 점유 → `pro-prompt config set agent.port 47825`.

**디버그:**
```bash
tail -f ~/.pro-prompt/agent.log | pnpm pino-pretty
curl -s http://127.0.0.1:47823/health
```

---

## M2 · 워커 + 트랜스크립트 파서 + 서브에이전트

**Goal:** `SubagentStop`/`Stop` 훅 → 큐 → 워커가 트랜스크립트를 읽어 서브에이전트 프롬프트·최종 응답 복원.

**Deliverables:**
- `packages/agent`: `/v1/hook/subagent-start`, `/v1/hook/subagent-stop`, `/v1/hook/stop`, `/v1/hook/post-tool-use`. 각 훅은 `queue.jsonl`에 append.
- `packages/worker`:
  - 큐 watcher (파일 append 감시)
  - `parse_transcript`, `parse_subagent_transcript` 작업 처리
  - `04-transcript-parser.md` 인터페이스 구현
  - 실패 재시도 + DLQ
- `packages/cli`: `pro-prompt start` 가 에이전트+워커 둘 다 기동.

**Acceptance Criteria:**
- 서브에이전트가 스폰된 세션이 끝난 후, DB의 `subagent_invocations`에 `prompt_text`와 `response_text`가 채워짐.
- `Stop` 훅 발화 후 60초 이내에 `sessions.ended_at`, `tool_use_rollups` 갱신.

**Test by User:**
```bash
pro-prompt restart

# Claude Code에서 서브에이전트 스폰되는 요청
claude
> Use the Explore agent to summarize packages/core/src/db.ts

# 세션 종료 후 1분 대기
sleep 70

# 확인
sqlite3 ~/.pro-prompt/prompts.db "SELECT agent_type, substr(prompt_text,1,60), length(response_text) FROM subagent_invocations ORDER BY started_at DESC LIMIT 3;"

# tool rollup 확인
sqlite3 ~/.pro-prompt/prompts.db "SELECT tool_name, call_count, fail_count FROM tool_use_rollups WHERE session_id=(SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1);"
```

**Known Failure Modes:**
- 트랜스크립트 경로가 문서와 다름 → M0 실측 결과대로 파서 경로 조정. 여전히 실패하면 워커 로그에 "ENOENT" 확인.
- 트랜스크립트 JSON 포맷 불일치 → `TranscriptEvent.kind = 'unknown'` 과다 발생. raw 이벤트 덤프를 `/tmp/pro-prompt-unknown.jsonl`에 임시 저장하고 포맷 재역공학.
- 같은 파일 반복 처리 → 멱등성 체크(§04-4.3) 확인.

**디버그:**
```bash
tail -f ~/.pro-prompt/worker.log | pnpm pino-pretty
wc -l ~/.pro-prompt/queue.jsonl   # 누적되는지
cat ~/.pro-prompt/queue.offset    # 진행되는지
```

---

## M3 · 룰 엔진 + 품질 스코어

**Goal:** `prompt_usages` 저장 시 즉석 룰 검사 + 점수 산출 + 대시보드에서 볼 수 있는 데이터 생성.

**Deliverables:**
- `packages/rules`: R001~R012 구현 + 테스트(각 룰 positive/negative 샘플)
- `packages/core/src/scorer.ts`: `05-quality-engine.md` §3 공식 구현
- `packages/agent`: UserPromptSubmit 핸들러에서 **동기 룰 검사**(10ms 이내) 후 `rule_hits` + `quality_scores(rule만)` 저장. 큐에 `usage_score` 후속 계산 작업.
- `packages/worker`: 세션 종료 시 `usage_score` 계산 → final_score 업데이트
- `packages/cli`: `pro-prompt show <usage_id>` 가 룰 히트 + 스코어 출력

**Acceptance Criteria:**
- 명백히 나쁜 프롬프트(한두 단어)가 `rule_score < 50` 받음.
- 잘 쓴 프롬프트(200자, 출력 포맷 명시)가 `rule_score >= 85` 받음.
- 룰 테스트 커버리지 > 90%.

**Test by User:**
```bash
# 1) 의도적으로 나쁜 프롬프트
claude
> fix

# 2) 의도적으로 좋은 프롬프트
claude
> 아래 JavaScript 함수가 null 체크 누락으로 TypeError를 낸다.
  목표: null-safe 하게 리팩터. 출력은 수정된 함수 + 1문장 요약.
  제약: 외부 라이브러리 추가 금지. 형식: ```diff 블록 + bullet 1개.

# 3) 스코어 비교
pro-prompt list --limit 5
# 기대: "fix"는 빨강(bad), 두 번째는 초록(good)

pro-prompt show <bad_id>
# 기대: R001 too_short, R002 no_output_format, R003 no_context 등 히트

# 4) 룰 유닛 테스트
pnpm -F @pro-prompt/rules test
```

**Known Failure Modes:**
- 한국어 프롬프트가 영어 키워드 regex로만 검사돼 오탐 → keywords.ts에 한/영 혼재.
- 룰 하나의 엣지 케이스가 많은 전체 점수를 흔듦 → severity weight 재튜닝.

---

## M4 · 로컬 대시보드

**Goal:** `http://127.0.0.1:47824` 열면 수집된 데이터를 볼 수 있다.

**Deliverables:**
- `packages/dashboard`:
  - Fastify + eta templates
  - 라우트: `/`, `/prompts`, `/prompts/:id`, `/sessions/:id`, `/rules`, `/settings`, `/doctor`
  - Tailwind + htmx + Alpine (CDN 또는 로컬)
  - SSE `/events` for 실시간 갱신
- `packages/cli`: `pro-prompt open` 브라우저 자동 오픈

**Acceptance Criteria:**
- 모든 라우트가 200 응답.
- 프롬프트 상세 페이지에 원문 · 룰 히트 · 스코어 breakdown 표시.
- 10초 내 새 프롬프트 추가 시 오버뷰에 자동 반영(SSE).

**Test by User:**
```bash
pro-prompt restart
pro-prompt open   # 브라우저 열림

# Claude Code에서 프롬프트 입력 → 대시보드 탭으로 돌아와 자동 갱신 확인
# 상세 페이지에서 룰 히트 리스트와 스코어 확인
```

**Known Failure Modes:**
- 포트 47824 점유 → `pro-prompt config set dashboard.port 47825`.
- CSP로 CDN 차단 → 로컬 자산 폴백.
- SSE 끊김 → htmx 재연결.

---

## M5 · 인라인 코칭 모드 (`additionalContext`)

**Goal:** coach mode ON 일 때 안티패턴 감지 시 Claude에게 자연스러운 힌트 주입.

**Deliverables:**
- `packages/agent`: UserPromptSubmit 응답에 JSON `{ additionalContext: "..." }` 포함 조건부 로직
- 힌트 템플릿 (`06-coaching-ux.md §2.2`)
- 세션 주입 제한 카운터(3턴 간격)
- `packages/cli`: `pro-prompt coach on/off`

**Acceptance Criteria:**
- `coach_mode=false`: 훅 응답 body 항상 빈값.
- `coach_mode=true` + 나쁜 프롬프트: 응답에 `additionalContext` 포함. Claude의 첫 답변이 "먼저 몇 가지 확인하겠습니다" 류로 나오는지 눈으로 확인.
- 힌트 길이 1KB 이하.
- 세션 내 반복 주입 방지.

**Test by User:**
```bash
pro-prompt coach on

# 나쁜 프롬프트
claude
> 고쳐줘
# 기대: Claude가 "무엇을, 어떤 맥락에서?"를 먼저 질문함

# 확인
pro-prompt show <usage_id>
# coach_context 컬럼에 주입된 텍스트 있음

# OFF
pro-prompt coach off
claude
> 고쳐줘
# 기대: 평소처럼 처리 (힌트 없음)
```

**Known Failure Modes:**
- `additionalContext`가 Claude에게 유저 메시지처럼 보여 이상한 응답 생성 → 템플릿 앞뒤에 `[Pro-Prompt coaching hint]` / `[end hint]` 마커 유지.
- 너무 자주 주입 → `session_inject_count` 로그 확인.

---

## M6 · LLM 심판 + 리라이터

**Goal:** 의심 프롬프트(`rule_score < 60`)는 LLM 심판으로 추가 점수화. 유저 요청 시 개선안 생성.

**Deliverables:**
- `packages/core`: Anthropic SDK 어댑터, prompt caching, token accounting
- `packages/worker`: `judge`, `rewrite` 작업 처리
- `packages/cli`: `pro-prompt rewrite <usage_id>` (대시보드 버튼과 동일 경로)
- 대시보드: "개선안 보기" 버튼 → diff 패널
- 월 토큰 한도 도달 시 자동 OFF + 대시보드 배너

**Acceptance Criteria:**
- `llm.enabled=true` + 유효한 키에서 의심 프롬프트에 `judge_score` 채워짐.
- 리라이트 결과가 JSON 스키마 준수.
- 캐시 hit으로 두 번째 호출은 시스템 프롬프트 토큰이 `cache_read`로 잡힘.

**Test by User:**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
pro-prompt config set llm.enabled true

claude
> fix              # 일부러 나쁜 프롬프트

sleep 90
pro-prompt show <usage_id>
# judge_score 채워짐, top_issue 표시

# 리라이트
pro-prompt rewrite <usage_id>
# diff 출력, after_text 복사 가능
```

**Known Failure Modes:**
- JSON 파싱 실패 → 1회 재시도 후 judge_score=NULL, audit에 기록.
- API 키 오류 → 대시보드에 빨간 배너 + 기능 자동 OFF.
- 토큰 한도 초과 → 월 리셋까지 OFF.

---

## M7 · 리라이트 수락 · 거절 · 클립보드

**Goal:** 유저가 개선안을 accept → 클립보드 복사 (Claude Code로 바로 붙여넣기).

**Deliverables:**
- 대시보드 accept/reject 버튼 + 피드백 입력
- CLI `pro-prompt rewrite --copy` 로 clipboard 복사 (`clipboardy` 사용)
- `rewrites.status` 업데이트

**Acceptance Criteria:**
- accept → 클립보드에 after_text, status=accepted.
- reject → 피드백 저장, status=rejected.

**Test by User:**
```bash
pro-prompt rewrite <usage_id> --copy
# "Copied to clipboard ✓"
# Claude Code에서 붙여넣기해 사용
```

---

## M8 · 설치 견고화 + 업그레이드 + Doctor

**Goal:** 처음 설치하는 유저가 막히지 않도록 `install` · `doctor` · 업그레이드 매끄럽게.

**Deliverables:**
- `pro-prompt install` 인터랙티브:
  - 기존 settings.json 백업
  - 훅 병합 (충돌 시 diff 보여주고 확인)
  - 데몬 start
  - 설치 직후 `doctor` 자동 실행
- `pro-prompt upgrade` (npm 재설치 후 스키마 마이그레이션)
- `pro-prompt doctor` 모든 검사 구현
- `--autostart` 옵션 (launchd/systemd-user 등록)

**Acceptance Criteria:**
- 깨끗한 환경에서 `npm i -g @pro-prompt/cli && pro-prompt install && claude` 한 번에 동작.
- 업그레이드 시 기존 DB 보존, schema 자동 마이그레이션.
- doctor가 비정상 상태 모두 구체적으로 지적.

**Test by User (전체 클린 설치):**
```bash
# 기존 설치 제거
pro-prompt wipe --yes || true
npm uninstall -g @pro-prompt/cli || true

# 새로 설치
npm i -g @pro-prompt/cli
pro-prompt install
pro-prompt doctor
# 모두 ✓ 표시되어야 함

# 훅 손상 시나리오
jq 'del(.hooks.UserPromptSubmit)' ~/.claude/settings.json > /tmp/s.json && mv /tmp/s.json ~/.claude/settings.json
pro-prompt doctor
# 기대: "⚠ Hook block missing — run `pro-prompt install` to restore"

# 복구
pro-prompt install
pro-prompt doctor   # 다시 ✓
```

---

## M9 · 릴리스 v0.1.0

**Goal:** npm 공개 배포 + README + 유저용 사용 안내 + 이슈 템플릿.

**Deliverables:**
- README.md 최종판 (설치 · 빠른 시작 · 프라이버시 · FAQ)
- CHANGELOG.md v0.1.0
- GitHub Actions: tag → build → `npm publish --access public`
- Issue/PR 템플릿, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`
- 대시보드 About 페이지에 버전 · 라이선스 · 리포 링크

**Acceptance Criteria:**
- `npm info @pro-prompt/cli` 가 0.1.0을 보여준다.
- 완전히 비어 있는 가상 머신에서 설치·작동.

**Test by User (클린 VM):**
```bash
# 가상머신/컨테이너
docker run -it --rm -v ~/.claude:/root/.claude node:20-bullseye bash
# (안에서)
npm i -g @pro-prompt/cli
pro-prompt install --non-interactive
pro-prompt status
```

---

## 전체 체크리스트 (릴리스 준비)

- [ ] M-1 리포 세팅 완료
- [ ] M0 실측 결과로 가정 확정
- [ ] M1 E2E 수집 동작
- [ ] M2 서브에이전트·응답 복원
- [ ] M3 룰 + 스코어
- [ ] M4 대시보드
- [ ] M5 코칭 모드
- [ ] M6 LLM 심판 + 리라이터
- [ ] M7 accept/reject + clipboard
- [ ] M8 install/doctor/upgrade 견고화
- [ ] M9 릴리스
- [ ] README + 프라이버시 문서 최종화
- [ ] 첫 베타 테스터 3명 피드백 수집

---

## 공통 디버그 도구

```bash
# 실시간 로그
tail -f ~/.pro-prompt/agent.log ~/.pro-prompt/worker.log | pnpm pino-pretty

# DB 즉석 조회
sqlite3 ~/.pro-prompt/prompts.db "SELECT name FROM sqlite_master WHERE type='table';"
sqlite3 ~/.pro-prompt/prompts.db "SELECT count(*) FROM prompt_usages;"

# 큐 상태
wc -l ~/.pro-prompt/queue.jsonl
cat ~/.pro-prompt/queue.offset

# 훅 수동 재생(문제 진단)
curl -X POST http://127.0.0.1:47823/v1/hook/user-prompt-submit \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"test-1","cwd":"/tmp","hook_event_name":"UserPromptSubmit","prompt":"hello world"}'

# 마이그레이션 상태
sqlite3 ~/.pro-prompt/prompts.db "SELECT * FROM _meta;"

# 완전 초기화(테스트용)
pro-prompt wipe --yes
```

---

## 릴리스 이후 바로 시작할 것 (Post-v0.1)
- 사용자 피드백 수집 (issue template + 간단한 `pro-prompt feedback` 명령)
- 윈도우 지원
- Cursor / VSCode 확장 첫 프로토타입
- 서버 동기화(Opt-in) 설계
- 팀/공유 기능 (D-001 재검토 근거 마련)
