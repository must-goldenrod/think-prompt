# 01 · Claude Code 훅 설계

> Think-Prompt MVP의 단일 수집 채널 = Claude Code 훅.
> 본 문서는 "어디에 걸고, 뭘 잡고, 뭘 못 잡고, 못 잡는 건 어떻게 우회할지"를 확정한다.

전제(§0.5 결정):
- **개인 개발자 · 무료 · 로컬 중심**
- **수집 + 개선**을 동시에 제공
- 서버는 선택적. 훅 단계에서는 **로컬로만** 흘려보낸다.

---

## 1. Think-Prompt가 필요한 데이터 ↔ 훅 매핑

| # | 필요한 데이터 | 훅 | 직접 노출되는가? | 비고 |
|---|---|---|---|---|
| 1 | **유저가 친 원문 프롬프트** | `UserPromptSubmit` | ✅ `prompt` 필드 | 모델 호출 **이전**. 동기식. |
| 2 | 세션 메타 (id, cwd, model) | `SessionStart`, 공통 payload | ✅ `session_id`, `cwd`, `model` | 모든 훅 payload에 공통 포함 |
| 3 | **슬래시 커맨드 원문** (`/foo bar`) | (없음) | ❌ CLI 파서가 훅 이전에 소비 | → 우회: history 파일 또는 SDK 래퍼 |
| 4 | **서브에이전트 프롬프트** | `SubagentStart` | ❌ `agent_type`, `agent_id`만 | → 우회: `agent_transcript_path` JSONL 파싱 |
| 5 | 서브에이전트 종료 시점 | `SubagentStop` | ✅ `agent_transcript_path` 포함 | 이 경로가 **프롬프트 복원의 핵심** |
| 6 | 도구 호출 (Read/Edit/Bash 등) | `PreToolUse`, `PostToolUse` | ✅ `tool_name`, `tool_input`, `tool_response` | 비용·지연·실패율 집계에 사용 |
| 7 | **모델의 최종 응답 텍스트** | (없음) | ❌ 훅 payload에는 tool I/O만 | → 우회: 세션 `transcript_path` JSONL 파싱 |
| 8 | 턴 종료 / 세션 종료 | `Stop`, `SessionEnd` | ✅ | 포스트핫 엔리치 트리거로 사용 |
| 9 | 컴팩션 발생 | `PreCompact`, `PostCompact` | ✅ | 컨텍스트 오버 힌트 (프롬프트 품질 신호) |
| 10 | 에러/레이트리밋 | `StopFailure`, `PostToolUseFailure` | ✅ | 품질 스코어 음의 가중치 |

### 1.1 핵심 구조상의 사실
- **훅 payload에는 "유저 원문 프롬프트"까지만 들어온다.** 서브에이전트 프롬프트와 모델 응답은 payload에 **없다**.
- 그러나 **모든 훅에 `transcript_path`가 포함**되고, 서브에이전트 종료 시 `agent_transcript_path`가 제공된다. 이 JSONL을 **사후 파싱**하면 대화 전체 복원이 가능하다.
- 훅은 **유저 PC의 쉘**에서 실행된다. Anthropic으로 자동 전송되는 데이터는 없다. → **로컬 중심 원칙과 아키텍처적으로 정확히 일치.**

---

## 2. 2-Tier 캡처 아키텍처

훅만으로는 데이터가 부족하고, 훅을 다 건드리면 지연/복잡도가 치솟는다. **Tier 분리**로 간다.

### Tier 1 — 실시간 훅 (경량, 동기)
**목적:** 품질 진단과 인라인 코칭을 위한 "지금 막 친 프롬프트" 캡처.

| 훅 | 역할 | 응답 시간 목표 |
|---|---|---|
| `UserPromptSubmit` | 원문 프롬프트 로깅 + 룰 기반 즉석 진단 + (선택) 인라인 힌트 주입 | **< 150 ms** (유저 체감 지연 방지) |
| `SessionStart` | 세션 레코드 생성, 로컬 DB 초기화 | < 50 ms |
| `SubagentStart` | 서브에이전트 이벤트 레코드 생성 (프롬프트는 없지만 타입/타이밍은 남김) | < 50 ms |

**구현 제약:** 훅은 동기 실행이라 느려지면 Claude Code 자체가 느려진다. Tier 1은 **로컬 파일 append + 얇은 룰 검사**까지만. LLM 호출 / 네트워크 요청은 여기서 **금지**.

### Tier 2 — 사후 엔리치 (비동기, 무거움)
**목적:** 풀 컨텍스트 복원, 서브에이전트 프롬프트·모델 응답 추출, 품질 메트릭 계산, LLM 심판 호출.

| 훅 | 역할 |
|---|---|
| `SubagentStop` | `agent_transcript_path`를 큐에 푸시 → 워커가 파싱 후 DB 저장 |
| `Stop` | 세션 `transcript_path`를 큐에 푸시 → 모델 최종 응답 + 전체 턴 복원 |
| `PostToolUse` / `PostToolUseFailure` | 도구 호출 성공률·지연·입출력 크기 집계 |
| `PostCompact` | 컴팩션 이벤트를 품질 신호로 기록 |

**워커(daemon)** 가 큐를 소비해서:
1. 해당 JSONL 파일을 읽음
2. 서브에이전트 프롬프트 / 모델 응답 / 시스템 프롬프트 추출
3. 룰베이스 스코어러 + (필요 시) LLM 심판 호출
4. 로컬 DB에 정규화 저장

---

## 3. 수집 불가 항목과 우회

| 항목 | 공식 불가 이유 | 우회 |
|---|---|---|
| 슬래시 커맨드 원문 | CLI 파서가 훅 이전 단계에서 소비 | ① `~/.claude/history.jsonl` (혹은 projects/<hash>/history.jsonl) 파싱<br>② SDK 래퍼로 CLI 입력 단계에서 후킹<br>**MVP: ①만 지원** |
| 서브에이전트 프롬프트 텍스트 | `SubagentStart` payload에 프롬프트 없음 | `SubagentStop` 시점에 `agent_transcript_path` JSONL에서 "첫 user message" 추출 |
| 모델 최종 응답 | `PostToolUse`는 tool I/O만 노출 | `Stop` 시점에 세션 `transcript_path` JSONL 파싱 |
| 스킬 호출 상세 | (확인 필요) | `InstructionsLoaded` + 트랜스크립트로 추정 |

---

## 4. 데이터 흐름 (로컬 중심)

```
┌─────────────────────────────────────────────────────────┐
│              Claude Code (유저 PC)                       │
│                                                         │
│  UserPromptSubmit ──►  ┌──────────────────────────┐     │
│  SessionStart     ──►  │  think-prompt-agent (CLI)   │     │
│  SubagentStart    ──►  │  - 룰 기반 즉석 진단     │     │
│  PostToolUse      ──►  │  - append to SQLite      │     │
│  Stop / SubagentStop ► │  - 큐에 transcript_path  │     │
│                        └──────┬──────────┬────────┘     │
│                               │          │              │
│                               │          ▼              │
│                               │   ~/.think-prompt/        │
│                               │    prompts.db (SQLite)  │
│                               │    queue.jsonl          │
│                               │                         │
│                               ▼                         │
│                        ┌──────────────────────────┐     │
│                        │  think-prompt-worker        │     │
│                        │  (daemon, 비동기)         │     │
│                        │  - transcript JSONL 파싱 │     │
│                        │  - LLM 심판 (선택)        │     │
│                        │  - 메트릭 집계            │     │
│                        └──────┬──────────┬────────┘     │
│                               │          │              │
│                               ▼          ▼              │
│                        ┌──────────┐  ┌────────────┐     │
│                        │  SQLite  │  │ 로컬 웹 UI │     │
│                        │  (최종)  │  │ :PORT      │     │
│                        └──────────┘  └────────────┘     │
└─────────────────────────────────────────────────────────┘

(옵션) 사용자가 켜면 → 익명화된 메트릭만 서버로 전송
```

**원칙:** 원문 프롬프트·트랜스크립트는 **절대 PC를 벗어나지 않음(default)**. 서버 전송은 유저가 명시적으로 켜는 Opt-in이며, 전송 내용은 **해시 + 카운트 + 마스킹된 예시**로 제한.

---

## 5. 실시간 코칭 UX — 제약과 옵션

`UserPromptSubmit` 훅은 exit 0일 때 stdout을 `additionalContext`로 Claude에 **주입**할 수 있다. 하지만 이건 **Claude가 읽는 텍스트**지 유저에게 보이는 UI가 아니다.

### 옵션 비교

| 방식 | 유저가 체감하나? | 마찰 | 비고 |
|---|---|---|---|
| A. **대시보드에만 기록, 실시간 알림 없음** | 아니오 | 없음 | 가장 안전. 유저가 자발적으로 대시보드 열어야 함 |
| B. `additionalContext`로 Claude에게 힌트 주입 | 간접적 (Claude가 답에 녹임) | 낮음 | "모호한 프롬프트니 확인 질문부터" 같은 자연스러운 가이드 가능 |
| C. `exit 2`로 블로킹 + stderr에 메시지 | 강함 | 높음 | 워크플로 끊김. 극단적 안티패턴(인젝션 등)에만 제한 사용 |
| D. OS 알림 / 로컬 웹 UI 토스트 | 직접 | 중간 | 별도 채널 필요, 훅 시간 내에 띄우려면 비동기 |

**MVP 기본값: A + B 혼합.**
- 기본은 A(조용히 기록).
- 유저가 "코칭 모드 ON"을 켜면 B(Claude에 힌트 주입)를 활성화. 예:
  > "이 프롬프트에는 출력 포맷/대상/제약이 빠졌습니다. 먼저 그걸 물어보고 진행해 주세요."
  → Claude가 자연스럽게 확인 질문으로 응답.
- C는 **인젝션 의심 / PII 대량 포함** 같은 명백한 위험 신호에만 예약.

---

## 6. 프라이버시 보장 구조 (훅 단계)

로컬 중심이 정책에서 **구조적으로** 강제되도록.

1. **훅 → 에이전트 통신은 localhost only.** HTTP 훅이면 `http://127.0.0.1:<port>`로만.
2. **원문은 로컬 SQLite에만.** 컬럼: `prompt_text` (원문), `prompt_hash` (공유용).
3. **PII 마스킹은 저장 전 파이프라인에서.** 에이전트가 append 전에 룰 기반 마스킹 1차 통과.
4. **서버 동기화는 별도 프로세스.** 켜져 있을 때만, 마스킹된 사본 + 메트릭만 송출.
5. **삭제는 파일 삭제 한 번으로.** `~/.think-prompt/` 디렉토리 제거 = 모든 데이터 제거.

---

## 7. 설정 파일 예시 (`~/.claude/settings.json` 스니펫)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47823/v1/hook/user-prompt-submit",
            "timeout": 3,
            "async": false
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47823/v1/hook/session-start",
            "timeout": 2
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47823/v1/hook/subagent-start",
            "timeout": 2
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47823/v1/hook/subagent-stop",
            "timeout": 2
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "think-prompt-cli post-tool-use",
            "timeout": 3,
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47823/v1/hook/stop",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**설치 UX:**
- `think-prompt install` 명령이 `~/.claude/settings.json`에 위 블록을 병합 (기존 훅과 충돌 시 merge).
- `think-prompt uninstall`이 정확히 해당 블록만 제거.
- 에이전트는 **launchd(macOS) / systemd-user(Linux)** 로 등록해 상시 기동.

---

## 8. 훅 프로토콜 (think-prompt-agent v0)

### 8.1 요청 규격 (Claude Code → agent)
모든 훅은 HTTP POST, body는 Claude Code의 표준 payload 그대로 전달.

공통 필드:
```json
{
  "session_id": "uuid",
  "cwd": "/path",
  "hook_event_name": "UserPromptSubmit",
  "transcript_path": "/.../transcript.jsonl"
}
```

훅별 추가 필드:
- `UserPromptSubmit`: `prompt`
- `SubagentStart/Stop`: `agent_id`, `agent_type`, `agent_transcript_path`
- `PostToolUse`: `tool_name`, `tool_input`, `tool_response`, `tool_use_id`
- `Stop`: `stop_hook_active`

### 8.2 응답 규격 (agent → Claude Code)
- **기본:** exit 0 / HTTP 200, body 비움 → 통과.
- **코칭 모드 ON 상태에서 안티패턴 감지:**
  ```json
  { "additionalContext": "이 프롬프트에는 … 이 빠졌습니다. 진행 전 확인 질문으로 …" }
  ```
- **블로킹 (극단적 경우):** HTTP 상태에 상관없이 커맨드 훅 exit 2 사용. HTTP 훅은 structured output으로 `decision: "block"`.

### 8.3 타임아웃 예산
유저 체감 지연을 막기 위해 훅별 예산 고정:
- `UserPromptSubmit`: **3초 hard cap**, agent 내부 목표 150ms
- `Stop`/`SubagentStop`: 5초 (파싱은 비동기 큐에 푸시만 하고 즉시 반환)
- 초과 시 agent가 **fail-open** (빈 응답으로 통과). 절대 Claude Code를 멈추지 않는다.

---

## 9. 이 문서로 확정된 것 vs 다음 문서로 넘기는 것

### 확정 (이 문서)
- ✅ MVP 훅 세트: `UserPromptSubmit`, `SessionStart`, `SubagentStart`, `SubagentStop`, `PostToolUse`, `Stop`
- ✅ 2-Tier 아키텍처 (실시간 경량 + 사후 트랜스크립트 엔리치)
- ✅ 로컬 HTTP 에이전트(localhost)로 수집. 커맨드 훅은 fallback.
- ✅ 원문은 로컬 SQLite. 서버 전송은 Opt-in + 마스킹된 사본.
- ✅ 실시간 코칭 UX 기본값: 조용히 기록(A) + 명시 ON 시 `additionalContext` 힌트(B)
- ✅ fail-open 원칙 (훅이 Claude Code를 절대 막지 않음)

### 다음 문서로 이관
- **02-local-storage.md:** SQLite 스키마, 큐 포맷, 에이전트/워커 IPC, 로컬 웹 UI 표면
- **03-antipattern-rules.md:** 룰셋 v0, 각 룰의 감지 로직 · 메시지 · 자동 수정 프롬프트
- **04-transcript-parser.md:** JSONL 포맷 역공학, 서브에이전트/모델 응답 추출기 규격

### 열린 질문 (곧 검증 필요)
- [ ] `settings.json`의 `type: "http"` 훅이 **모든 hook event**에서 지원되는지 (command 대비 동일 스펙 보장?)
- [ ] `~/.claude/history.jsonl` (또는 projects/ 하위)의 정확한 경로·포맷 — 슬래시 커맨드 복원에 필요
- [ ] `transcript.jsonl` 포맷의 안정성 (릴리스 간 변경 빈도)
- [ ] 훅 matcher 패턴이 hook-event-level에서만 동작하는지, 이벤트 내부 서브필드로도 필터 가능한지
- [ ] `UserPromptSubmit`이 **continuation/재시도/compact resume** 에서도 매 턴 발화되는지

**→ 위 4개는 02 문서 작성 전에 실측으로 확정한다.** (간단한 더미 훅 설치 후 로그 관찰)
