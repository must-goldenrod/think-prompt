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
| O-001 | `UserPromptSubmit` payload의 정확한 키 이름(예: `prompt`)과 슬래시 커맨드가 원문/확장본 중 무엇으로 들어오는지 | 01-hook-design §1, 04-transcript-parser §7 | pending |
| O-002 | `SubagentStart/Stop` payload에 prompt 필드 존재 여부 | 01-hook-design §1 | pending |
| O-003 | `transcript_path` 실제 경로 패턴 | 04-transcript-parser §1, §7 | pending |
| O-004 | 트랜스크립트 JSONL 이벤트 키 이름 (`type`, `role`, `content`, `message`) | 04-transcript-parser §2 | pending |
| O-005 | 서브에이전트 호출이 세션 트랜스크립트에 인라인 vs 별도 파일 | 04-transcript-parser §7 | pending |
| O-006 | `/compact` 후 session_id 유지 여부 | 01-hook-design §1 | pending |
| O-007 | HTTP `type` 훅이 `UserPromptSubmit` 포함 모든 이벤트에서 동작하는지 | 01-hook-design §9 | pending |
| O-008 | `resume` 시 새 `SessionStart` 발화 여부 | 01-hook-design §1 | pending |
| O-009 | 훅 timeout 초과 시 Claude Code 동작 (대기 vs 무시) | 01-hook-design §8 | pending |
| O-010 | `additionalContext`가 실제 Claude 답변에 미치는 영향 강도 | 06-coaching-ux §2 | pending |

---

## 관찰 기록

*(여기 아래에 날짜순으로 append)*
