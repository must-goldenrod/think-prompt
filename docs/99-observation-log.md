# 99 · 실측 · 관찰 로그

> M0 스파이크, 실제 운영 중 마주친 Claude Code 훅·트랜스크립트 동작을 **사실 그대로** 기록.
> 문서의 "가정"이 여기의 "관찰"과 다르면 문서를 수정한다.

> 포맷:
> - `### <YYYY-MM-DD> · <주제>`
> - **Observed:** 실제로 본 것 (JSON 샘플 등)
> - **Source:** 어느 세션·경로
> - **Doc impact:** 어느 문서의 어느 섹션을 업데이트했는지

---

## 열린 관찰 항목 (M0에서 채울 것)

| # | 질문 | 관련 문서 §  | 상태 |
|---|---|---|---|
| O-001 | `UserPromptSubmit` payload의 정확한 키 이름(예: `prompt`)과 슬래시 커맨드가 원문/확장본 중 무엇으로 들어오는지 | 01-hook-design §1, 04-transcript-parser §7 | **resolved (2026-04-22)** — 키 = `prompt` (string). 슬래시 커맨드 전개 형태는 별도 검증 필요 |
| O-002 | `SubagentStart/Stop` payload에 prompt 필드 존재 여부 | 01-hook-design §1 | pending |
| O-003 | `transcript_path` 실제 경로 패턴 | 04-transcript-parser §1, §7 | **resolved (2026-04-22)** — `~/.claude/projects/<slugified-cwd>/<session_id>.jsonl` |
| O-004 | 트랜스크립트 JSONL 이벤트 키 이름 (`type`, `role`, `content`, `message`) | 04-transcript-parser §2 | partial (parser는 가정대로 동작 중, 직접 JSONL inspection은 별도) |
| O-005 | 서브에이전트 호출이 세션 트랜스크립트에 인라인 vs 별도 파일 | 04-transcript-parser §7 | **resolved (2026-04-22)** — 별도 파일. `agent_transcript_path`로 SubagentStop payload에 전달 |
| O-006 | `/compact` 후 session_id 유지 여부 | 01-hook-design §1 | pending |
| O-007 | HTTP `type` 훅이 `UserPromptSubmit` 포함 모든 이벤트에서 동작하는지 | 01-hook-design §9 | **resolved (2026-04-22)** — 6개 hook 모두 :47823으로 정상 도달 |
| O-008 | `resume` 시 새 `SessionStart` 발화 여부 | 01-hook-design §1 | pending |
| O-009 | 훅 timeout 초과 시 Claude Code 동작 (대기 vs 무시) | 01-hook-design §8 | pending |
| O-010 | `additionalContext`가 실제 Claude 답변에 미치는 영향 강도 | 06-coaching-ux §2 | pending |

---

## 관찰 기록

*(여기 아래에 날짜순으로 append)*

### 2026-04-22 · 운영 로그 기반 일괄 관찰 (5+건 캡처 확인)

**Source:** `~/.think-prompt/{agent,worker}.log`, `prompts.db` (5+ rows in `prompt_usages`), `~/Library/LaunchAgents/com.thinkprompt.*.plist` (launchd autostart 동작 중)

**Observed:**
- **O-001 키 이름:** UserPromptSubmit payload는 `body.prompt: string`. 우리 zod 스키마 `UserPromptSubmitPayload`와 일치. agent.ts:69 `p.prompt`로 직접 접근, 5+ 캡처에서 score / tier / hits 모두 비어있지 않음 (예: score=85, tier=good, hits=2).
- **O-003 transcript_path 패턴:** `/Users/<user>/.claude/projects/<slugified-cwd>/<session_id>.jsonl`. 슬러그화 규칙 = 슬래시·도트를 하이픈으로, 선두 슬래시도 하이픈. 예: cwd `/Users/must-hoyoung/Documents/claude-management/think-prompt` → 디렉토리 `-Users-must-hoyoung-Documents-claude-management-think-prompt`. worker DLQ 기록의 `agent_transcript_path` payload에서도 동일 패턴 관찰.
- **O-005 서브에이전트 트랜스크립트:** SubagentStop payload에 별도 `agent_transcript_path` 필드 포함. 메인 세션 트랜스크립트에 인라인되지 않음 → 04-transcript-parser §7 가정 확정.
- **O-007 훅 라우팅:** 6개 hook (UserPromptSubmit / SessionStart / SubagentStart / SubagentStop / Stop / PostToolUse) 모두 `:47823`으로 도달, agent.log에 INFO 레벨 기록. fail-open 코드 경로(`config.agent.fail_open`)는 unhandled error 발생 시에만 `{}` 반환.

**Doc impact:**
- 04-transcript-parser §1: 경로 패턴 명시 권장
- 04-transcript-parser §7: 서브에이전트 별도 파일 확정
- 01-hook-design §9: HTTP type 훅 6종 라우팅 정상 동작 확정

**미해결:** O-002, O-004(가정대로 작동 중이지만 직접 JSONL 키 검증 별도 필요), O-006, O-008, O-009, O-010 — 모두 사용자가 특정 시나리오를 만들어야 검증 가능 (compact / resume / 인위적 timeout / Claude 답변 비교 실험).

---

### 2026-04-23 · PostToolUse 가 세션 미지 상태에서 FK 위반 (fail-open 은폐)

**Source:** Issue #11 dogfooding 재현 — `~/.think-prompt/agent.log` 에 `SqliteError: FOREIGN KEY constraint failed` (`code: SQLITE_CONSTRAINT_FOREIGNKEY`, `msg: "post-tool-use failed"`).

**Observed:**
- Claude Code 세션을 먼저 띄운 뒤 별개 터미널에서 `think-prompt install` 을 실행하는 시나리오에서는, 이미 러닝 중인 세션의 `SessionStart` / `UserPromptSubmit` 이 우리 agent 에 도달하지 않고 이후 `PostToolUse` 만 도달한다.
- `/v1/hook/post-tool-use` 핸들러는 `sessions` 행이 없는 상태에서 `bumpToolRollup` 을 호출 → `tool_use_rollups.session_id REFERENCES sessions(id)` FK 위반 → 500. `config.agent.fail_open` 가 빈 `{}` 로 덮어 Claude Code 자체는 영향 없음.
- 결과: 해당 세션의 `tool_use_rollups` 가 **조용히** 누락 (집계 정확도 저하).

**Why the other five hooks did not hit this:** `user-prompt-submit`, `session-start`, `subagent-start`, `subagent-stop`, `stop` 핸들러는 모두 본문 처리 전 `upsertSession(db, { id, cwd })` 를 호출해 sessions 행을 멱등 upsert. `post-tool-use` 만 이 패턴이 빠져 있었음 (`packages/agent/src/server.ts:253`).

**Doc impact:**
- 01-hook-design §1: "매 hook 핸들러는 본문 처리 전 `upsertSession` 선행" 규약을 명시 고려.
- `CHANGELOG.md` `[Unreleased] / Fixed` 에 반영.

**Fix:** `packages/agent/src/server.ts` 에 `upsertSession` 1줄 선행 호출 + 회귀 테스트 `post-tool-use upserts unknown session (FK-safe, regression for #11)` 추가. PR `fix/post-tool-use-fk-session` 참조.

**Residual:** fail-open 가 이런 silent drop 을 은폐하는 구조는 D-028 의도대로이지만, 에이전트 내부 에러 카운터를 `think-prompt doctor` 에서 노출하는 후속 작업을 고려할 수 있음 (별도 이슈 후보).
