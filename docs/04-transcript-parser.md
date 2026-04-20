# 04 · 트랜스크립트 파서

> 훅이 못 잡는 데이터(서브에이전트 프롬프트 · 모델 최종 응답)를 `transcript.jsonl` 파싱으로 복원한다.

---

## 1. 입력 경로

두 종류.
- **세션 트랜스크립트:** 모든 훅 payload의 `transcript_path`. 전체 대화 스트림.
- **서브에이전트 트랜스크립트:** `SubagentStop` payload의 `agent_transcript_path`. 해당 서브에이전트 호출 범위.

**가정 (→ M0에서 실측 검증):**
- 파일은 **JSONL**, 각 줄이 1 이벤트.
- 진행 중엔 append-only. 세션 종료 시점에 완전해짐.
- 형식은 Claude Code 내부 포맷. 비공개·불안정(릴리스 간 변경 가능).

→ **파서는 형식 변경에 강해야 한다.** 모든 필드 접근은 optional, 알 수 없는 이벤트 타입은 로깅 후 스킵.

---

## 2. 기대되는 이벤트 타입 (관찰 기반 · 변경 가능)

M0 실측으로 확정. 초안:

| 이벤트 | 키 필드 | 용도 |
|---|---|---|
| `user` (or `message` with `role:user`) | `text`, `ts` | 유저 턴 복원 |
| `assistant` | `text`, `ts`, `tool_uses` | 모델 응답 복원 |
| `tool_use` | `name`, `input`, `id` | 도구 호출 복원 |
| `tool_result` | `tool_use_id`, `content` | 도구 결과 |
| `system` | `text` | 시스템 프롬프트(처음에만) |
| `subagent_*` | `agent_type`, `prompt` | 서브에이전트 경계 |

**주의:** 실제 키 이름은 M0 실측으로 확정. 위는 플레이스홀더.

---

## 3. 파서 인터페이스

```ts
// packages/core/src/transcript/parser.ts

export interface TranscriptEvent {
  raw: unknown;          // 원본 JSON (디버그용)
  kind: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'subagent' | 'unknown';
  text?: string;
  role?: string;
  ts?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  toolUseId?: string;
  agentType?: string;
}

export async function parseTranscript(path: string): Promise<TranscriptEvent[]>;
export async function* streamTranscript(path: string): AsyncGenerator<TranscriptEvent>;
export function extractSubagentPrompt(events: TranscriptEvent[]): string | null;
export function extractFinalAssistantText(events: TranscriptEvent[]): string | null;
```

---

## 4. 시나리오별 동작

### 4.1 `Stop` 훅 후 세션 트랜스크립트 처리
1. 워커가 큐 작업 `parse_transcript` 소비.
2. `transcript_path` 읽기 (최대 10 MB 제한, 초과 시 꼬리 tail).
3. 모든 이벤트를 시간순 파싱.
4. 이번 세션의 `prompt_usages` 행들과 **turn_index 매칭**으로 모델 응답 연결.
5. `subagent_invocations` 행들 중 `response_text=NULL`인 것에 파싱 결과 채우기.
6. 세션 `tool_use_rollups` 갱신.

### 4.2 `SubagentStop` 훅 후 서브에이전트 트랜스크립트 처리
1. `parse_subagent_transcript` 작업 소비.
2. `agent_transcript_path`의 **첫 user 메시지** = 서브에이전트 프롬프트.
3. **마지막 assistant 메시지** = 서브에이전트 응답.
4. `subagent_invocations` 행 업데이트.

### 4.3 부분 파일 (세션 진행 중)
- 읽는 도중 끊겨 있어도 OK. 파싱 실패 라인은 스킵 + WARN 로그.
- `Stop` 훅 발화 후 1초 지연(파일 flush 대기) 후 파싱 시작.

---

## 5. 에러 처리

| 상황 | 동작 |
|---|---|
| 파일 없음 | 작업 재시도 (최대 5회, 지수 백오프 10s→2m). 이후 작업 DLQ로 이동. |
| JSON 파싱 실패 라인 | 해당 라인만 스킵. `audit`에 WARN 기록. |
| 파일 > 10 MB | 꼬리 200 KB만 읽어 최종 응답 복원. 전체 분석은 포기 플래그. |
| 알 수 없는 이벤트 kind | `unknown`으로 분류, 저장은 하되 분석에서 제외. |

---

## 6. 멱등성(Idempotency)

- 같은 트랜스크립트가 여러 번 큐에 들어와도 **멱등**.
- `subagent_invocations.prompt_hash`와 `quality_scores`의 존재 여부로 "이미 처리됨" 판정.
- 재처리는 `pro-prompt reprocess --session <id>` 로만 강제 가능.

---

## 7. M0 실측 체크리스트 (열린 질문 해소)

- [ ] 세션 트랜스크립트 실제 파일 경로 패턴 (`~/.claude/projects/<hash>/sessions/<id>.jsonl` 형태 추정)
- [ ] 각 이벤트의 실제 JSON 키 이름 (`type`, `role`, `content`, `message` 등 어느 쪽?)
- [ ] 서브에이전트 호출이 세션 트랜스크립트에 **인라인**으로 들어가는지, **별도 파일**로 분리되는지
- [ ] 슬래시 커맨드가 트랜스크립트에 원문으로 찍히는지, 확장된 결과만 찍히는지
- [ ] 컴팩션 발생 시 이전 턴들이 요약/제거되는지
- [ ] 세션이 resume 되면 동일 파일에 append되는지 새 파일이 생성되는지

→ 결과는 `docs/99-observation-log.md`에 기록 후 본 문서 §2, §4를 최종화.
